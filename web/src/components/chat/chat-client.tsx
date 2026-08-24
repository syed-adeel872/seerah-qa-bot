"use client";

import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { SAMPLE_QUESTIONS } from "./samples";
import { redirectInfo } from "@/lib/guardrails/blockers";
import type { Answer } from "@/lib/engine/answer";
import type { Citation } from "@/lib/corpus/schema";

/** Parse **bold** markdown into <strong> elements. */
function renderBoldText(text: string): React.ReactNode[] {
  const cleaned = text.replace(/\*{4,}/g, "");
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold text-white/95">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

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

/* ─── Copy Button ─── */
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/* ─── Share Button ─── */
function ShareButton({ text, citations }: { text: string; citations: Citation[] }) {
  const [shared, setShared] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  async function handleShare() {
    const sourceList = citations.map((c, i) => `[${i + 1}] ${c.title.en || c.title.ur}`).join("\n");
    const shareText = `${text}\n\n— Sources:\n${sourceList}\n\nvia Seerah Q&A — Seerat Ki Dunya`;

    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        setShared(true);
        timerRef.current = window.setTimeout(() => setShared(false), 2000);
        return;
      } catch {
        // user cancelled or unsupported — fall through to copy
      }
    }
    if (await copyToClipboard(shareText)) {
      setShared(true);
      timerRef.current = window.setTimeout(() => setShared(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      aria-label="Share response"
      title="Share / Copy for WhatsApp"
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium leading-none transition-colors cursor-pointer text-muted/50 hover:bg-white/5 hover:text-foreground"
    >
      {shared ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      )}
      {shared ? "Copied!" : "Share"}
    </button>
  );
}

/* ─── Source Detail Modal ─── */
function SourceModal({ citation, index, onClose }: { citation: Citation; index: number; onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Source ${index + 1}`}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-emerald-500/20 bg-gray-950 shadow-2xl shadow-emerald-500/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800/60 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-300">
              {index + 1}
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-400/70">
              {citation.source === "shamail" ? "Shamail" : "Seerah Timeline"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted/50 transition hover:bg-white/5 hover:text-foreground cursor-pointer"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted/50 mb-1">English</p>
            <p className="text-sm font-medium text-gray-100 leading-relaxed">{citation.title.en}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted/50 mb-1">اردو</p>
            <p className="font-ur text-sm font-medium text-gray-200 leading-relaxed" dir="rtl">{citation.title.ur}</p>
          </div>
          {citation.hawala?.en && (
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/60 mb-0.5">Hawala / Reference</p>
              <p className="text-xs text-emerald-200/80">{citation.hawala.en}</p>
              {citation.hawala.ur && (
                <p className="font-ur text-xs text-emerald-200/60 mt-0.5" dir="rtl">{citation.hawala.ur}</p>
              )}
            </div>
          )}
          {citation.category && (
            <div className="text-[11px] text-muted/60">
              Category: <span className="text-emerald-300/70">{citation.category.name.en}</span>
            </div>
          )}
          {citation.textEn && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted/50 mb-1.5">English Translation</p>
              <div className="rounded-lg bg-gray-800/50 p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto thin-scrollbar">{citation.textEn}</div>
            </div>
          )}
          {citation.textUr && (
            <div className="mt-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted/50 mb-1.5 text-right" dir="rtl">اردو متن</p>
              <div className="font-ur rounded-lg bg-gray-800/50 p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap text-right max-h-48 overflow-y-auto thin-scrollbar" dir="rtl">{citation.textUr}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800/60 px-5 py-3 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg bg-emerald-600/15 px-4 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-600/25 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Interactive Source Chips (clickable, open modal) ─── */
function SourceChips({ citations, onOpen }: { citations: Citation[]; onOpen: (c: Citation, i: number) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.map((c, i) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c, i)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-1 text-[11px] leading-none text-emerald-300/80 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
          title={`View source: ${c.source}${c.section ? ` · ${c.section}` : ""}`}
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold text-emerald-300">
            {i + 1}
          </span>
          <span className="max-w-[200px] truncate">
            {c.title.en || c.title.ur}
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ))}
    </div>
  );
}

/* ─── Assistant Bubble ─── */
function AssistantBubble({ m }: { m: Message }) {
  const [modalCitation, setModalCitation] = useState<{ citation: Citation; index: number } | null>(null);
  const answer = m.answer;

  const openModal = useCallback((c: Citation, i: number) => {
    setModalCitation({ citation: c, index: i });
  }, []);

  const closeModal = useCallback(() => {
    setModalCitation(null);
  }, []);

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
  const showCitations = answer.status === "answered" && answer.citations.length > 0;

  return (
    <>
      <div className="flex w-full justify-start">
        <div className="max-w-[85%] text-left text-gray-200">
          <div className="rounded-xl bg-white/[0.03] px-4 py-3">
            <div className={cn("whitespace-pre-wrap text-sm leading-7", isUrdu && "font-ur rtl text-[15px] leading-8")}>
              {renderBoldText(answer.text)}
            </div>

            {showCitations && (
              <>
                <p className="text-sm font-semibold text-gray-400 mt-3 mb-2">References</p>
                <SourceChips citations={answer.citations} onOpen={openModal} />
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
          <div className="mt-1 px-1 flex items-center gap-2">
            <CopyButton text={answer.text} />
            {showCitations && <ShareButton text={answer.text} citations={answer.citations} />}
          </div>
        </div>
      </div>
      {modalCitation && (
        <SourceModal
          citation={modalCitation.citation}
          index={modalCitation.index}
          onClose={closeModal}
        />
      )}
    </>
  );
}

/* ─── Main Chat Client ─── */
export function ChatClient({ corpusSummary }: { corpusSummary: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: controller.signal,
      });
      const data = (await res.json()) as Answer & { error?: string };
      if (controller.signal.aborted) return;
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
    } catch (err) {
      if (controller.signal.aborted) return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "", error: true },
      ]);
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
      }
    }
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <>
      {/* ─── Persistent Header ─── */}
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

          {/* Trust Badges + Language Indicator */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[10px] text-emerald-300/80">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Verified Corpus
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-[10px] text-amber-300/80">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              Fatwa-Safe
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-muted">
              EN · UR · Roman
            </span>
          </div>
        </div>
      </div>

      {/* ─── Scrollable Message Area ─── */}
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

      {/* ─── Persistent Composer ─── */}
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
