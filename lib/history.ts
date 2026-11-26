/**
 * Per-browser session history (PLAN.md §1.6). Convenience only: it lives in
 * localStorage, can be empty or unavailable, and the server stays the source
 * of truth for each session.
 */
import type { Difficulty, Grade, Tone } from "./session/options";

export type SessionSettings = {
  vacancy: string;
  role?: string;
  company?: string;
  grade: Grade;
  difficulty: Difficulty;
  tone: Tone;
};

export type HistoryEntry = {
  id: string;
  createdAt: string;
  settings: SessionSettings;
  /** Same settings tried again → «Дубль 02», «Дубль 03»… */
  take: number;
  totalQuestions: number;
  answered: number;
  overall?: number;
};

const KEY = "hrit:history";
const MAX = 50;

/** Cheap stable hash so the full vacancy text isn't compared over and over. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function settingsSignature(s: SessionSettings): string {
  return [hash(s.vacancy.trim()), s.role?.trim().toLowerCase() ?? "", s.company?.trim().toLowerCase() ?? "", s.grade, s.difficulty, s.tone].join("|");
}

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage unavailable or full */
  }
}

export function addHistory(entry: Omit<HistoryEntry, "take" | "answered">): HistoryEntry {
  const list = readHistory().filter((e) => e.id !== entry.id);
  const sig = settingsSignature(entry.settings);
  const take = list.filter((e) => settingsSignature(e.settings) === sig).length + 1;
  const full: HistoryEntry = { ...entry, take, answered: 0 };
  write([full, ...list]);
  return full;
}

export function updateHistory(id: string, patch: Partial<Pick<HistoryEntry, "answered" | "overall">>) {
  const list = readHistory();
  const i = list.findIndex((e) => e.id === id);
  if (i === -1) return;
  list[i] = { ...list[i], ...patch };
  write(list);
}

export function findHistory(id: string): HistoryEntry | undefined {
  return readHistory().find((e) => e.id === id);
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const takeLabel = (n: number) => `Дубль ${String(n).padStart(2, "0")}`;
