/** Session parameters shared by UI, API and prompts (PLAN.md §1.5, §2.3). */

export const GRADES = [
  { id: "intern", label: "Стажёр" },
  { id: "junior", label: "Junior" },
  { id: "middle", label: "Middle" },
  { id: "senior", label: "Senior" },
  { id: "teamlead", label: "Team Lead" },
] as const;

export const DIFFICULTIES = [
  { id: "gentle", label: "Щадящий" },
  { id: "medium", label: "Средний" },
  { id: "hard", label: "Сложный" },
] as const;

export const TONES = [
  { id: "polite", label: "Вежливый" },
  { id: "rude", label: "Грубый" },
] as const;

export type Grade = (typeof GRADES)[number]["id"];
export type Difficulty = (typeof DIFFICULTIES)[number]["id"];
export type Tone = (typeof TONES)[number]["id"];

/** How each difficulty shapes the interview (PLAN.md §1.5). */
export const DIFFICULTY_RULES: Record<
  Difficulty,
  { maxFollowUps: number; answerSeconds: number | null; hints: boolean }
> = {
  gentle: { maxFollowUps: 0, answerSeconds: null, hints: true },
  medium: { maxFollowUps: 1, answerSeconds: 240, hints: false },
  hard: { maxFollowUps: 2, answerSeconds: 150, hints: false },
};

/** 8–12 questions: more for senior grades and harder modes. */
export function questionCount(grade: Grade, difficulty: Difficulty): number {
  const byGrade: Record<Grade, number> = {
    intern: 8,
    junior: 8,
    middle: 9,
    senior: 10,
    teamlead: 10,
  };
  const byDifficulty: Record<Difficulty, number> = { gentle: 0, medium: 1, hard: 2 };
  return Math.min(12, byGrade[grade] + byDifficulty[difficulty]);
}

export const QUESTION_KINDS = ["technical", "behavioral", "situational", "motivation"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** One-line hints shown under the setup toggles. */
export const GRADE_HINTS: Record<Grade, string> = {
  intern: "Мотивация, обучаемость, базовые знания, учебные проекты.",
  junior: "Основы профессии, простые практические задачи, работа в команде.",
  middle: "Самостоятельность, реальные кейсы, компромиссы решений.",
  senior: "Архитектура и стратегия, влияние на продукт, менторство.",
  teamlead: "Люди, конфликты, найм, планирование, результат команды.",
};

export const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  gentle: "Без давления и таймера. Интервьюер может подсказать.",
  medium: "Обычное интервью. Одно уточнение по теме, мягкий лимит времени.",
  hard: "Стресс‑вопросы, ловушки, цепочки уточнений. Таймер на ответ.",
};

export const TONE_SAMPLES: Record<Tone, string> = {
  polite: "Спасибо, интересно. Расскажите чуть подробнее?",
  rude: "И это всё? Конкретнее. Цифры.",
};

export const KIND_LABELS: Record<QuestionKind, string> = {
  technical: "Профильный",
  behavioral: "Поведенческий",
  situational: "Ситуационный",
  motivation: "Мотивация",
};
