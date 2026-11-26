"use client";

import { useEffect, useState, type CSSProperties } from "react";

const fmt = (ms: number) => {
  const s = Math.floor(Math.abs(ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Digits: remaining time, then overtime with a "+" once the limit passes. */
export function TimerDigits({ seconds, startedAt, running }: { seconds: number; startedAt: number; running: boolean }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const left = seconds * 1000 - (now - startedAt);
  const over = left < 0;
  return (
    <span className={`label tnum ${left <= 10_000 && running ? "timer-low text-text-1" : ""}`} aria-live="off">
      {over ? `Время вышло +${fmt(left)}` : fmt(left)}
    </span>
  );
}

/** The 2 px bar across the top of the screen (PLAN.md §3.5). */
export function TimerBar({ seconds, startedAt }: { seconds: number; startedAt: number }) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 h-[2px] bg-line" aria-hidden>
      <div key={startedAt} className="timer-bar h-full bg-text-1" style={{ "--duration": `${seconds}s` } as CSSProperties} />
    </div>
  );
}
