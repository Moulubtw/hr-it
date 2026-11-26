/**
 * Interview flow (PLAN.md §2.3), independent of Next.js so it can be tested
 * with a fake AI client and store. Routes only parse HTTP and wire SSE.
 */
import { AllModelsFailedError, FatalAiError, type AiClient, type AiRequest } from "@/lib/ai/client";
import { createFieldStreamer } from "@/lib/ai/partial-json";
import { guardHrLine } from "@/lib/ai/prompts/guard";
import { buildFirstQuestionRequest, buildReportRequest, buildTurnRequest } from "@/lib/ai/prompts";
import {
  answerInput,
  createSessionInput,
  questionOutput,
  reportOutput,
  turnOutput,
  type Report,
  type Session,
  type Turn,
} from "@/lib/schema";
import type { SessionStore } from "./store";
import { DIFFICULTY_RULES, questionCount } from "./options";

export type Deps = {
  ai: Pick<AiClient, "stream" | "generate">;
  store: SessionStore;
  now?: () => Date;
  newId?: () => string;
};

export type Send = (event: string, data: unknown) => void;

export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// ── helpers ────────────────────────────────────────────────────────────

function parseOrThrow<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new ServiceError(400, "invalid_input", r.error.issues[0]?.message ?? "Некорректные данные.", r.error.issues);
  }
  return r.data;
}

function parseModelJson<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, raw: string): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ServiceError(502, "bad_model_output", "Модель вернула некорректный ответ. Попробуйте ещё раз.");
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new ServiceError(502, "bad_model_output", "Модель вернула неполный ответ. Попробуйте ещё раз.");
  return r.data;
}

/** Streams a JSON response, forwarding chosen string fields as deltas. */
async function streamJson(
  ai: Deps["ai"],
  request: AiRequest,
  fields: Record<string, string>, // json field → SSE event
  send: Send,
): Promise<{ raw: string; model: string; fallback: boolean }> {
  const streamer = createFieldStreamer(Object.keys(fields));
  for await (const ev of ai.stream(request)) {
    if (ev.type === "text") {
      for (const d of streamer.push(ev.delta)) send(fields[d.field], { delta: d.delta });
    } else if (ev.type === "reset") {
      streamer.reset();
      send("reset", { model: ev.model, reason: ev.reason });
    } else {
      send("model", { model: ev.model, fallback: ev.fallback });
      return { raw: ev.text, model: ev.model, fallback: ev.fallback };
    }
  }
  throw new AllModelsFailedError([]);
}

/** Converts any failure into a final `error` SSE event. */
export function errorPayload(err: unknown): { code: string; message: string; retryable: boolean } {
  if (err instanceof ServiceError)
    return { code: err.code, message: err.message, retryable: err.status >= 500 || err.status === 429 || err.code === "busy" };
  if (err instanceof AllModelsFailedError) {
    if (err.attempts.length > 0 && err.attempts.every((a) => a.reason === "forbidden" || a.reason === "not_found"))
      return { code: "no_model_access", message: "У вашего ключа нет доступа к выбранным моделям. Выберите другие модели в настройках ключа.", retryable: false };
    return { code: "ai_unavailable", message: "Все модели сейчас недоступны. Попробуйте через минуту.", retryable: true };
  }
  if (err instanceof FatalAiError) {
    if (err.reason === "aborted") return { code: "aborted", message: "Запрос отменён.", retryable: true };
    if (err.reason === "unauthorized")
      return { code: "bad_key", message: "Ключ Gemini не подошёл. Проверьте его в настройках ключа.", retryable: false };
    return { code: "ai_error", message: "Не удалось получить ответ ИИ.", retryable: false };
  }
  return { code: "internal", message: "Что-то пошло не так.", retryable: true };
}

function addModel(s: Session, model: string) {
  if (!s.modelsUsed.includes(model)) s.modelsUsed.push(model);
}

// ── create ─────────────────────────────────────────────────────────────

/** Validates input before the stream starts, so bad input gets a plain 400. */
export function prepareSession(body: unknown, deps: Pick<Deps, "newId" | "now"> = {}): Session {
  const input = parseOrThrow(createSessionInput, body);
  return {
    id: deps.newId?.() ?? crypto.randomUUID(),
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
    vacancy: input.vacancy,
    role: input.role || undefined,
    company: input.company || undefined,
    grade: input.grade,
    difficulty: input.difficulty,
    tone: input.tone,
    totalQuestions: questionCount(input.grade, input.difficulty),
    pending: null,
    turns: [],
    modelsUsed: [],
  };
}

export async function streamFirstQuestion(session: Session, deps: Deps, send: Send, signal?: AbortSignal) {
  send("session", {
    sessionId: session.id,
    totalQuestions: session.totalQuestions,
    answerSeconds: DIFFICULTY_RULES[session.difficulty].answerSeconds,
  });

  const { raw, model } = await streamJson(
    deps.ai,
    { ...buildFirstQuestionRequest(session), signal },
    { question: "question" },
    send,
  );
  const out = parseModelJson(questionOutput, raw);

  session.pending = { question: out.question, kind: out.kind, isFollowUp: false };
  addModel(session, model);
  await deps.store.set(session);

  send("question_done", { index: 0, question: out.question, kind: out.kind, isFollowUp: false });
}

// ── answer ─────────────────────────────────────────────────────────────

export async function prepareAnswer(id: string, body: unknown, deps: Pick<Deps, "store">) {
  const input = parseOrThrow(answerInput, body);
  const session = await deps.store.get(id);
  if (!session) throw new ServiceError(404, "not_found", "Сессия не найдена или истекла.");
  if (!session.pending) throw new ServiceError(409, "finished", "Интервью уже завершено.");
  return { session, input };
}

export async function streamAnswer(
  session: Session,
  input: { answer: string; elapsedMs: number },
  deps: Deps,
  send: Send,
  signal?: AbortSignal,
) {
  const pending = session.pending!;
  const { raw, model } = await streamJson(
    deps.ai,
    { ...buildTurnRequest(session, pending, input.answer, input.elapsedMs), signal },
    { hrReaction: "hr_reaction", idealAnswer: "ideal_answer", nextQuestion: "next_question" },
    send,
  );
  const out = parseModelJson(turnOutput, raw);

  const guarded = guardHrLine(out.hrReaction, session.tone, session.turns.length);
  if (guarded.replaced) send("hr_reaction_replace", { text: guarded.text });

  send("feedback", { items: out.feedback });
  send("score", { score: out.score });

  const turn: Turn = {
    index: session.turns.length,
    question: pending.question,
    kind: pending.kind,
    isFollowUp: pending.isFollowUp,
    answer: input.answer,
    elapsedMs: input.elapsedMs,
    hrReaction: guarded.text,
    idealAnswer: out.idealAnswer,
    feedback: out.feedback,
    score: out.score,
    modelUsed: model,
  };
  session.turns.push(turn);
  addModel(session, model);

  const finished = session.turns.length >= session.totalQuestions || out.nextQuestion.trim() === "";
  session.pending = finished
    ? null
    : { question: out.nextQuestion.trim(), kind: out.nextQuestionKind, isFollowUp: out.isFollowUp };
  await deps.store.set(session);

  send("turn_done", {
    turn,
    next: session.pending ? { index: session.turns.length, ...session.pending } : null,
    finished,
  });
}

// ── finish ─────────────────────────────────────────────────────────────

export async function finishSession(
  id: string,
  deps: Pick<Deps, "store"> & { ai: () => Deps["ai"] },
  signal?: AbortSignal,
  beforeGenerate?: () => Promise<void>,
): Promise<{ report: Report; session: Session }> {
  const session = await deps.store.get(id);
  if (!session) throw new ServiceError(404, "not_found", "Сессия не найдена или истекла.");
  if (session.report) return { report: session.report, session };
  if (session.turns.length === 0) throw new ServiceError(409, "no_answers", "Нужен хотя бы один ответ для отчёта.");

  await beforeGenerate?.();
  const { text, model } = await deps.ai().generate({ ...buildReportRequest(session), signal });
  const report = parseModelJson(reportOutput, text);

  session.report = report;
  session.pending = null;
  addModel(session, model);
  await deps.store.set(session);
  return { report, session };
}

export async function getSession(id: string, deps: Pick<Deps, "store">): Promise<Session> {
  const session = await deps.store.get(id);
  if (!session) throw new ServiceError(404, "not_found", "Сессия не найдена или истекла.");
  return session;
}
