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
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.map((c, i) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-950/10 px-2 py-0.5 text-[11px] leading-none text-emerald-400/80"
          title={`source: ${c.source}${c.section ? ` · ${c.section}` : ""}`}
        >
          <span className="font-mono opacity-60">[{i + 1}]</span>
          <span className="max-w-[200px] truncate">
            {c.title.en || c.title.ur}
          </span>
        </span>
      ))}
    </div>
  );
}

function SourceList({ citations }: { citations: Citation[] }) {
  return (
    <div className="flex flex-col gap-2 mt-4 text-xs text-muted/80">
      {citations.map((c, i) => (
        <div
          key={c.id}
          className="border-l-2 border-emerald-500/30 pl-3 py-1"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium text-emerald-300/80" dir="ltr">
              [{i + 1}] {c.title.en}
            </span>
            <span className="font-medium text-emerald-300/60" dir="rtl">
              {c.title.ur}
            </span>
          </div>
          {c.hawala?.en && (
            <div className="mt-0.5 text-[10px] text-muted/60">
              Hawala: {c.hawala.en}
            </div>
          )}
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
      <div className="flex w-full justify-start">
        <div className="max-w-[85%] text-left text-gray-200">
          <div className="whitespace-pre-wrap">{displayText}</div>
        </div>
      </div>
    );
  }

  const isBlocked = answer.status === "blocked";
  const isUrdu = answer.lang === "ur";

  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[85%] text-left text-gray-200">
        <div className="rounded-xl bg-white/[0.03] px-4 py-3">
          <div className={cn("whitespace-pre-wrap text-sm leading-7", isUrdu && "font-ur rtl text-[15px] leading-8")}>
            {answer.text}
          </div>

          {answer.status === "answered" && answer.citations.length > 0 && (
            <>
              <SourceChips citations={answer.citations} />
              <SourceList citations={answer.citations} />
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
        <div className="mt-1 px-1">
          <CopyButton text={answer.text} />
        </div>
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
    <>
      {/* persistent header — always visible, never inside scroll or conditionals */}
      <div className="w-full shrink-0 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-md z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.seeratkidunya.com/images/landingPage/homePage/logo.svg"
              alt="Seerat Ki Dunya"
              className="h-9 w-auto"
            />
            <div>
              <h1 className="text-base font-semibold tracking-tight">Seerah Q&amp;A</h1>
              <p className="text-[12px] text-muted">Grounded in the verified Seerah &amp; Shamail corpus</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-muted">Web</span>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-200">Grounded · Cited</span>
          </div>
        </div>
      </div>

      {/* scrollable message area */}
      <div className="flex-1 overflow-y-auto w-full">
        <div ref={listRef} className="flex flex-col gap-6 pb-6 pt-4 max-w-4xl mx-auto w-full">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 w-full text-center mt-12">
              <div className="max-w-md">
                <h2 className="text-lg font-semibold text-foreground">
                  Ask anything about Seerah &amp; Shamail
                </h2>
                <p className="mt-1 text-sm text-muted">{PREAMBLE}</p>
                <p className="mt-4 text-[11px] text-muted/70">{corpusSummary}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-8 max-w-3xl">
                {SAMPLE_QUESTIONS.map((s) => (
                  <button
                    key={s.question}
                    onClick={() => void ask(s.question)}
                    className="rounded-full border border-emerald-500/30 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-200 text-sm px-4 py-2 transition-all cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex w-full justify-end pr-4">
                <div className="max-w-[85%] bg-emerald-900/40 rounded-2xl px-5 py-3 text-right">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 whitespace-pre-wrap text-sm leading-7">{m.text}</div>
                    <CopyButton text={m.text} tone="user" />
                  </div>
                </div>
              </div>
            ) : (
              <AssistantBubble key={i} m={m} />
            ),
          )}

          {busy && (
    <div className="flex w-full justify-start">
              <div className="flex items-center gap-1.5 px-2 py-3">
                <span className="typing-dot h-2 w-2 rounded-full bg-emerald-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-emerald-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-emerald-400" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* persistent composer — always visible at bottom */}
      <form onSubmit={onSubmit} className="shrink-0 w-full border-t border-gray-800/50 bg-gray-950/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 py-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the Prophet ﷺ's life, character, and habits…"
            className="input-glow flex-1 rounded-xl border border-emerald-500/20 bg-card px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/60 focus:border-emerald-500/50"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 hover:shadow-[0_0_18px_-6px_rgba(16,185,129,0.7)] disabled:cursor-not-allowed cursor-pointer"
          >
            Ask
          </button>
        </div>
      </form>
    </>
  );
}
