"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS } from "@/lib/schema";

const draftKey = (id: string, index: number) => `hrit:draft:${id}:${index}`;

function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * Transcript-style answer field (PLAN.md §3.4): no bubbles, no borders,
 * a block caret, ⌘/Ctrl+Enter to send. Unsent text survives a reload.
 */
export function AnswerBox({
  sessionId,
  index,
  onSubmit,
}: {
  sessionId: string;
  index: number;
  onSubmit: (answer: string) => Promise<boolean>;
}) {
  const key = draftKey(sessionId, index);
  const [value, setValue] = useState(() => readDraft(key));
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);

  async function send() {
    if (!value.trim() || sending) return;
    setSending(true);
    const ok = await onSubmit(value);
    setSending(false);
    if (ok) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    }
  }

  return (
    <div className="border-t border-line py-8">
      <label htmlFor="answer" className="label mb-4 flex items-center gap-2">
        Ваш ответ <span className="caret" aria-hidden />
      </label>
      <textarea
        id="answer"
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        maxLength={LIMITS.answer}
        rows={6}
        disabled={sending}
        placeholder="Отвечайте так, как ответили бы вживую…"
        className="block w-full resize-y bg-transparent text-[18px] leading-[1.6] text-text-1 placeholder:text-text-2/60 [caret-color:var(--text-1)] focus:outline-none disabled:opacity-60"
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <span className="label hidden sm:inline">⌘ / Ctrl + Enter — отправить</span>
        <div className="flex w-full items-center justify-between gap-6 sm:w-auto">
          <span className="label tnum">
            {value.length} / {LIMITS.answer}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!value.trim() || sending}
            className="display group inline-flex items-center gap-4 bg-invert-bg px-6 py-4 text-[14px] font-semibold text-invert-text transition-colors hover:bg-transparent hover:text-text-1 hover:outline hover:outline-1 hover:outline-text-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-invert-bg disabled:hover:text-invert-text disabled:hover:outline-none"
          >
            Ответить
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
