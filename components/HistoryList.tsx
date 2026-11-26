"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearHistory, readHistory, takeLabel, type HistoryEntry } from "@/lib/history";
import { DIFFICULTIES, GRADES, TONES } from "@/lib/session/options";

const label = <T extends string>(list: readonly { id: T; label: string }[], id: T) =>
  list.find((x) => x.id === id)!.label;

/** «Ваши дубли»: past sessions from this browser. Renders nothing when empty. */
export function HistoryList() {
  const [items, setItems] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setItems(readHistory());
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="border-b border-line py-10" aria-labelledby="history-title">
      <div className="mb-6 flex items-baseline justify-between">
        <h2 id="history-title" className="label">
          05 / Ваши дубли
        </h2>
        <button
          type="button"
          onClick={() => {
            clearHistory();
            setItems([]);
          }}
          className="label hover:text-text-1"
        >
          Очистить
        </button>
      </div>
      <ul>
        {items.slice(0, 8).map((e) => {
          const done = e.overall !== undefined;
          const s = e.settings;
          return (
            <li key={e.id} className="border-t border-line first:border-t-0">
              <Link
                href={done ? `/report?id=${e.id}` : `/interview?id=${e.id}`}
                className="group grid grid-cols-12 items-baseline gap-y-2 py-5 transition-colors hover:bg-surface-1"
              >
                <span className="label tnum col-span-12 md:col-span-2">{takeLabel(e.take)}</span>
                <span className="display col-span-12 text-[clamp(16px,1.8vw,22px)] font-semibold md:col-span-5">
                  {s.role || "По тексту вакансии"}
                  {s.company && <span className="text-text-2"> · {s.company}</span>}
                </span>
                <span className="label col-span-8 md:col-span-3">
                  {label(GRADES, s.grade)} · {label(DIFFICULTIES, s.difficulty)} · {label(TONES, s.tone)}
                </span>
                <span className="display tnum col-span-4 text-right text-[18px] font-semibold md:col-span-2">
                  {done ? (
                    e.overall!.toFixed(1)
                  ) : (
                    <span className="label">
                      {e.answered} / {e.totalQuestions} →
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
