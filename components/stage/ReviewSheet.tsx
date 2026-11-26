"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Live } from "./useInterview";
import { ScoreScale } from "./ScoreScale";

/**
 * "Как ответил бы ИИ" (PLAN.md §3.4): an inverted sheet that unrolls under
 * the answer. Two columns on desktop, tabs on mobile.
 */
export function ReviewSheet({
  sessionId,
  answer,
  live,
  streaming,
  hasNext,
  onNext,
}: {
  sessionId: string;
  answer: string;
  live: Live;
  streaming: boolean;
  hasNext: boolean;
  onNext: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<"ideal" | "yours">("ideal");

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <section ref={ref} aria-label="Как ответил бы ИИ" className="sheet-in -mx-[var(--gutter)] scroll-mt-4 bg-invert-bg px-[var(--gutter)] pb-10 pt-8 text-invert-text">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-invert-text/20 pb-6">
        <h2 className="display text-[clamp(22px,3vw,40px)] font-extrabold">Как ответил бы ИИ</h2>
        {live.score !== null ? (
          <ScoreScale score={live.score} invert />
        ) : (
          <span className="label !text-invert-text/60">Оценка…</span>
        )}
      </div>

      {/* mobile tabs */}
      <div role="tablist" className="mt-6 flex gap-2 md:hidden">
        {(
          [
            ["ideal", "Эталон"],
            ["yours", "Ваш ответ"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`display px-3 py-2 text-[12px] font-semibold ${tab === id ? "bg-invert-text text-invert-bg" : "border border-invert-text/30"}`}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-10 md:mt-8 md:grid-cols-12">
        <div className={`md:col-span-5 ${tab === "yours" ? "" : "hidden md:block"}`}>
          <span className="label mb-4 block !text-invert-text/60">Ваш ответ</span>
          <p className="whitespace-pre-wrap text-[16px] leading-[1.6] text-invert-text/75">{answer}</p>
        </div>
        <div className={`md:col-span-7 md:border-l md:border-invert-text/20 md:pl-10 ${tab === "ideal" ? "" : "hidden md:block"}`}>
          <span className="label mb-4 block !text-invert-text/60">Эталон</span>
          <p className="whitespace-pre-wrap text-[18px] leading-[1.6]" aria-live="polite" aria-busy={streaming}>
            {live.idealAnswer}
            {streaming && <span className="caret ml-1 !bg-invert-text" aria-hidden />}
          </p>
        </div>
      </div>

      {live.feedback && (
        <div className="mt-10 border-t border-invert-text/20 pt-6">
          <span className="label mb-4 block !text-invert-text/60">Что усилить</span>
          <ol className="grid gap-4 md:grid-cols-3">
            {live.feedback.map((f, i) => (
              <li key={i} className="flex gap-4 text-[15px] leading-[1.5]">
                <span className="display tnum text-[13px] font-semibold">{String(i + 1).padStart(2, "0")}</span>
                {f}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-10 flex justify-end">
        {streaming ? (
          <span className="label !text-invert-text/60">Интервьюер записывает…</span>
        ) : hasNext ? (
          <button
            type="button"
            onClick={onNext}
            className="display group inline-flex items-center gap-4 bg-invert-text px-7 py-5 text-[15px] font-semibold text-invert-bg hover:opacity-85"
          >
            Следующий вопрос
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
        ) : (
          <Link
            href={`/report?id=${sessionId}`}
            className="display group inline-flex items-center gap-4 bg-invert-text px-7 py-5 text-[15px] font-semibold text-invert-bg hover:opacity-85"
          >
            К отчёту
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        )}
      </div>
    </section>
  );
}
