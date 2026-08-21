"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { SAMPLE_QUESTIONS } from "./samples";
import { redirectInfo } from "@/lib/guardrails/blockers";
import type { Answer } from "@/lib/engine/answer";
import type { Citation } from "@/lib/corpus/schema";

interface Message {
  role: "user" | "assistant";
  text: string;
  answer?: Answer;
  error?: boolean;
}

const PREAMBLE = "Ask anything about the Seerah and Shamail — answered only from the verified corpus.";

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyButton({ text, tone = "assistant" }: { text: string; tone?: "user" | "assistant" }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  async function handleCopy() {
    if (!(await copyToClipboard(text))) return;
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? "Copied to clipboard" : "Copy message"}
      title={copied ? "Copied" : "Copy"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium leading-none transition-colors",
        "cursor-pointer",
        tone === "user"
          ? copied
            ? "bg-emerald-400/20 text-emerald-100"
            : "text-white/55 hover:bg-white/10 hover:text-white"
          : copied
            ? "bg-emerald-500/10 text-emerald-300"
            : "text-muted/50 hover:bg-white/5 hover:text-foreground",
      )}
    >
      {copied ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function SourceChips({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {citations.map((c, i) => (
        <span
          key={c.id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs leading-none",
            "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
          )}
          title={`source: ${c.source} · id: ${c.id}${c.section ? ` · ${c.section}` : ""}`}
        >
          <span className="font-mono text-emerald-400/80">[{i + 1}]</span>
          <span className="max-w-[220px] truncate">
            {i < 3 ? c.title.en || c.title.ur : "Source"}
          </span>
        </span>
      ))}
    </div>
  );
}

function SourceList({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-3 space-y-2">
      {citations.map((c, i) => (
        <div
          key={c.id}
          className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium text-emerald-200">
              [{i + 1}] {c.title.en}
            </span>
            <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400/80">
              {c.source === "shamail" ? c.category?.id ? `shamail · cat ${c.category.id}` : "shamail" : `timeline · ${c.section ?? "-"}`}
            </span>
          </div>
          <div className="mt-1 text-muted">
            {c.title.ur && <div className="font-ur rtl text-[13px]">{c.title.ur}</div>}
            <div className="font-mono text-[10px] opacity-70">id: {c.id}</div>
            {c.hawala?.en && <div className="text-[11px] text-emerald-300/70">Hawala: {c.hawala.en}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AssistantBubble({ m }: { m: Message }) {
  const answer = m.answer;
  if (!answer) {
    const displayText = (m.error ? "Something went wrong. Please try again." : m.text) || "…";
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[85%] items-start gap-2 rounded-2xl border border-white/10 bg-card px-4 py-3 text-sm text-muted">
          <div className="flex-1 whitespace-pre-wrap">{displayText}</div>
          <CopyButton text={displayText} />
        </div>
      </div>
    );
  }

  const isBlocked = answer.status === "blocked";
  const isOut = answer.status === "out_of_corpus";
  const isUrdu = answer.lang === "ur";

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl border px-5 py-4 backdrop-blur-md",
          isBlocked && answer.kind === "fatwa"
            ? "border-amber-400/25 bg-warn-soft"
            : isBlocked
              ? "border-amber-400/20 bg-warn-soft"
              : isOut
                ? "border-white/10 bg-white/[0.03]"
                : "border-emerald-500/15 bg-emerald-500/[0.07] glow-card",
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn("flex-1 text-sm leading-7 whitespace-pre-wrap", isUrdu && "font-ur rtl text-[15px] leading-8")}>
            {answer.text}
          </div>
          <CopyButton text={answer.text} />
        </div>

        {answer.status === "answered" && answer.citations.length > 0 && (
          <>
            <SourceChips citations={answer.citations} />
            <SourceList citations={answer.citations} />
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted/80">
              <span>engine: {answer.engine}</span>
              {answer.semantic && (
                <>
                  <span>·</span>
                  <span>
                    semantic: {answer.semantic.available ? "ok" : "unavailable"}
                    {answer.semantic.used ? " (used)" : ""}
                  </span>
                </>
              )}
              {answer.rewrittenQuery && (
                <>
                  <span>·</span>
                  <span className="max-w-[220px] truncate" title={answer.rewrittenQuery}>
                    rewrite: “{answer.rewrittenQuery}”
                  </span>
                </>
              )}
              <span>·</span>
              <span>corpus v{answer.corpusVersion}</span>
              {answer.matched && (
                <>
                  <span>·</span>
                  <span>match {Math.round((answer.matched.coverage ?? 0) * 100)}%</span>
                </>
              )}
            </div>
          </>
        )}

        {isBlocked && (
          <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2">
            {answer.kind === "fatwa" ? (
              <a
                href={`mailto:?subject=${encodeURIComponent(
                  "Seerah Q&A — Scholar consultation",
                )}&body=${encodeURIComponent(
                  `${redirectInfo().labelEn} — ${redirectInfo().labelUr}`,
                )}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/15 px-3 py-1.5 text-[11px] font-medium text-amber-200 transition hover:bg-amber-400/25"
              >
                {redirectInfo().labelEn} · {redirectInfo().labelUr}
              </a>
            ) : (
              <div className="text-[11px] text-amber-200/90">
                Guarded — this request tried to alter the assistant&apos;s scope.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatClient({ corpusSummary }: { corpusSummary: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as Answer & { error?: string };
      if (!res.ok || data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "", error: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.text, answer: data },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "", error: true },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* messages */}
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="max-w-md">
              <h2 className="text-lg font-semibold text-foreground">
                Ask anything about Seerah &amp; Shamail
              </h2>
              <p className="mt-1 text-sm text-muted">{PREAMBLE}</p>
              <p className="mt-4 text-[11px] text-muted/70">{corpusSummary}</p>
            </div>
            <div className="flex max-w-2xl flex-wrap justify-center gap-2">
              {SAMPLE_QUESTIONS.map((s) => (
                <button
                  key={s.question}
                  onClick={() => void ask(s.question)}
                  style={{ cursor: 'pointer' }}
                  className={cn(
                    "rounded-full border border-emerald-500/15 bg-emerald-500/[0.05] px-3.5 py-1.5 text-xs text-muted",
                    "transition-all duration-200 hover:border-emerald-500/60 hover:bg-emerald-500/15 hover:text-emerald-100",
                    "hover:shadow-[0_0_20px_-6px_rgba(16,185,129,0.55)] active:scale-95",
                    "cursor-pointer",
                    s.lang === "ur" && "font-ur rtl",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-br-sm border border-emerald-400/20 bg-emerald-600/75 px-5 py-3 text-sm leading-7 text-white backdrop-blur-md">
                <div className="flex-1 whitespace-pre-wrap">{m.text}</div>
                <CopyButton text={m.text} tone="user" />
              </div>
            </div>
          ) : (
            <AssistantBubble key={i} m={m} />
          ),
        )}

        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl border border-emerald-500/20 bg-card px-4 py-3">
              <span className="typing-dot h-2 w-2 rounded-full bg-emerald-400" />
              <span className="typing-dot h-2 w-2 rounded-full bg-emerald-400" />
              <span className="typing-dot h-2 w-2 rounded-full bg-emerald-400" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <form onSubmit={onSubmit} className="border-t border-white/8 bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the Prophet ﷺ's life, character, and habits…"
            className="input-glow flex-1 rounded-xl border border-emerald-500/20 bg-card px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/60 focus:border-emerald-500/50"
            disabled={busy}
          />
<button
              type="submit"
              disabled={busy || !input.trim()}
              style={{ cursor: 'pointer' }}
              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 hover:shadow-[0_0_18px_-6px_rgba(16,185,129,0.7)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}