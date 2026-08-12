/**
 * Pluggable LLM backend.
 *
 * Primary intent: Google AI Studio — Gemini 2.5 (Flash) via its
 * OpenAI-compatible endpoint (`.../v1beta/openai/chat/completions`),
 * configured with `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`.
 * A native Generative Language API adapter (`GEMINI_*`) is supported as an
 * alternative. If neither is configured, the engine still runs in the fully
 * offline, deterministic mode (the spec-mandated safe fallback).
 *
 * The LLM is only ever used for *presentation* of grounded answers: the RAG
 * pipeline passes retrieved corpus text and forces citations, and every
 * returned citation is post-verified against the retrieved corpus ids.
 */

export interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMClient {
  available: boolean;
  provider: string;
  complete(messages: LLMChatMessage[]): Promise<string | null>;
}

const OPENAI_COMPAT_ENV = {
  baseUrl: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL,
};

/**
 * Ordered fallback chain for the OpenAI-compatible endpoint. The primary
 * model is tried first; on 404/network failure the next candidate is tried.
 * Configured via `LLM_MODEL_FALLBACKS` (comma-separated). Useful because
 * some accounts can no longer access e.g. gemini-2.5-flash / -lite.
 */
const OPENAI_COMPAT_FALLBACKS: string[] = (process.env.LLM_MODEL_FALLBACKS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const GEMINI_NATIVE_ENV = {
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  baseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
};

/** True when any real LLM backend is configured. */
export function isLLMConfigured(): boolean {
  return Boolean(
    (OPENAI_COMPAT_ENV.baseUrl && OPENAI_COMPAT_ENV.apiKey && OPENAI_COMPAT_ENV.model) ||
      GEMINI_NATIVE_ENV.apiKey,
  );
}

const openAICompatClient: LLMClient = {
  available: isLLMConfigured(),
  provider: OPENAI_COMPAT_ENV.model ?? "openai-compatible",
  async complete(messages) {
    if (!OPENAI_COMPAT_ENV.baseUrl || !OPENAI_COMPAT_ENV.apiKey || !OPENAI_COMPAT_ENV.model) {
      return null;
    }
    const base = OPENAI_COMPAT_ENV.baseUrl.replace(/\/+$/, "");
    const models = [
      OPENAI_COMPAT_ENV.model,
      ...OPENAI_COMPAT_FALLBACKS.filter((m) => m !== OPENAI_COMPAT_ENV.model),
    ];
    for (const model of models) {
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_COMPAT_ENV.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.2,
            max_tokens: 1200,
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (!res.ok) {
          console.error(`[llm] model ${model} -> HTTP ${res.status} ${res.statusText}`);
          continue; // e.g. 404 model unavailable -> try next
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content ?? null;
        if (content) return content;
        console.error(`[llm] model ${model} -> empty content`);
      } catch (err) {
        console.error(
          `[llm] model ${model} -> network error: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue; // network error -> try next model
      }
    }
    return null;
  },
};

const geminiNativeClient: LLMClient = {
  available: isLLMConfigured(),
  provider: `google-gemini:${GEMINI_NATIVE_ENV.model}`,
  async complete(messages) {
    if (!GEMINI_NATIVE_ENV.apiKey) return null;
    const base = GEMINI_NATIVE_ENV.baseUrl!.replace(/\/+$/, "");
    try {
      const res = await fetch(
        `${base}/models/${GEMINI_NATIVE_ENV.model}:generateContent?key=${encodeURIComponent(
          GEMINI_NATIVE_ENV.apiKey,
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: messages
              .filter((m) => m.role !== "system")
              .map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
              })),
            systemInstruction: {
              parts: [
                {
                  text:
                    messages.find((m) => m.role === "system")?.content ??
                    "You answer ONLY from the supplied corpus entries.",
                },
              ],
            },
            generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
          }),
          signal: AbortSignal.timeout(45000),
        },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    } catch {
      return null;
    }
  },
};

/** The shared client. Local/injectable for tests. */
export function getLLMClient(): LLMClient {
  if (localOverride) return localOverride;
  if (OPENAI_COMPAT_ENV.baseUrl && OPENAI_COMPAT_ENV.apiKey && OPENAI_COMPAT_ENV.model) {
    return openAICompatClient;
  }
  return geminiNativeClient;
}

let localOverride: LLMClient | null = null;
export function setLLMClientOverride(client: LLMClient | null): void {
  localOverride = client;
}