/**
 * Guardrails (PLAN.md §1.9, §2.7):
 * - the vacancy is untrusted data, fenced off from instructions;
 * - HR lines that cross the line are swapped for a harsh-but-acceptable one.
 */
import type { Tone } from "@/lib/session/options";

/** Neutralises our own delimiters so the vacancy can't close its fence. */
export function fenceVacancy(text: string): string {
  const cleaned = text.replace(/<\/?\s*vacancy\s*>/gi, "").trim();
  return `<vacancy>\n${cleaned || "(текст вакансии не указан)"}\n</vacancy>`;
}

// Roots of profanity, insults and slurs that must never appear in an HR line.
const BANNED = [
  /х[уy][йиеёяю]/i,
  /п[иi]зд/i,
  /(^|[^а-яё])(ё|е)б(а|у|л|н|и|ё)/i,
  /бля/i,
  /(^|[^а-яё])сук[аи]?($|[^а-яё])/i,
  /муда[кч]/i,
  /долбо/i,
  /идиот/i,
  /дебил/i,
  /кретин/i,
  /придур/i,
  /(^|[^а-яё])туп(ой|ая|ица|ые)/i,
  /(^|[^а-яё])урод/i,
  /(^|[^а-яё])дура[кч]?($|[^а-яё])/i,
  /ничтожеств/i,
  /бездар/i,
  /неудачни/i,
];

const SAFE_RUDE = [
  "Неубедительно. Дальше.",
  "Много слов, мало конкретики. Следующий вопрос.",
  "Это не ответ на мой вопрос. Идём дальше.",
];

const SAFE_POLITE = ["Спасибо, давайте продолжим."];

export function isHrLineSafe(text: string): boolean {
  return !BANNED.some((re) => re.test(text));
}

export function guardHrLine(text: string, tone: Tone, seed = 0): { text: string; replaced: boolean } {
  if (isHrLineSafe(text)) return { text, replaced: false };
  const pool = tone === "rude" ? SAFE_RUDE : SAFE_POLITE;
  return { text: pool[seed % pool.length], replaced: true };
}
