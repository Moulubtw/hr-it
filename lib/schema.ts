/** Zod schemas for API input, model output and stored sessions (PLAN.md §2.3, §2.5). */
import { z } from "zod";
import { DIFFICULTIES, GRADES, QUESTION_KINDS, TONES } from "./session/options";

const ids = <T extends readonly { id: string }[]>(list: T) =>
  list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];

export const LIMITS = { vacancy: 8000, answer: 4000, role: 120, company: 120 } as const;

export const gradeSchema = z.enum(ids(GRADES));
export const difficultySchema = z.enum(ids(DIFFICULTIES));
export const toneSchema = z.enum(ids(TONES));
export const questionKindSchema = z.enum(QUESTION_KINDS);

// ── API input ──────────────────────────────────────────────────────────

export const createSessionInput = z
  .object({
    vacancy: z.string().trim().max(LIMITS.vacancy).default(""),
    role: z.string().trim().max(LIMITS.role).optional(),
    company: z.string().trim().max(LIMITS.company).optional(),
    grade: gradeSchema,
    difficulty: difficultySchema,
    tone: toneSchema,
  })
  .refine((v) => v.vacancy.length >= 20 || (v.role?.length ?? 0) >= 2, {
    message: "Нужен текст вакансии (от 20 символов) или название должности.",
    path: ["vacancy"],
  });
export type CreateSessionInput = z.infer<typeof createSessionInput>;

export const answerInput = z.object({
  answer: z.string().trim().min(1, "Ответ пустой.").max(LIMITS.answer),
  elapsedMs: z.number().int().nonnegative().max(60 * 60_000).default(0),
});

// ── model output ───────────────────────────────────────────────────────

export const questionOutput = z.object({
  question: z.string().min(3),
  kind: questionKindSchema,
});

export const turnOutput = z.object({
  hrReaction: z.string(),
  idealAnswer: z.string().min(1),
  feedback: z.array(z.string()).min(1).max(3),
  score: z.number().min(0).max(10),
  nextQuestion: z.string(),
  nextQuestionKind: questionKindSchema,
  isFollowUp: z.boolean(),
});
export type TurnOutput = z.infer<typeof turnOutput>;

export const reportOutput = z.object({
  overall: z.number().min(0).max(10),
  criteria: z
    .array(z.object({ name: z.string(), score: z.number().min(0).max(10), note: z.string() }))
    .min(3),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).min(1),
  nextSteps: z.array(z.string()).min(1),
});
export type Report = z.infer<typeof reportOutput>;

// ── stored session ─────────────────────────────────────────────────────

export const turnSchema = z.object({
  index: z.number().int(),
  question: z.string(),
  kind: questionKindSchema,
  isFollowUp: z.boolean(),
  answer: z.string(),
  elapsedMs: z.number(),
  hrReaction: z.string(),
  idealAnswer: z.string(),
  feedback: z.array(z.string()),
  score: z.number(),
  modelUsed: z.string(),
});
export type Turn = z.infer<typeof turnSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  vacancy: z.string(),
  role: z.string().optional(),
  company: z.string().optional(),
  grade: gradeSchema,
  difficulty: difficultySchema,
  tone: toneSchema,
  totalQuestions: z.number().int(),
  /** The question currently waiting for an answer (null once finished). */
  pending: z.object({ question: z.string(), kind: questionKindSchema, isFollowUp: z.boolean() }).nullable(),
  turns: z.array(turnSchema),
  report: reportOutput.optional(),
  modelsUsed: z.array(z.string()),
});
export type Session = z.infer<typeof sessionSchema>;

/** JSON Schema sent to Gemini as `responseJsonSchema`. Key order = streaming order. */
function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _drop;
  return rest;
}

export const jsonSchemas = {
  question: toGeminiSchema(questionOutput),
  turn: toGeminiSchema(turnOutput),
  report: toGeminiSchema(reportOutput),
};
