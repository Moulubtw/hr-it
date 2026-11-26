/**
 * The interview engine, running entirely in the browser (static hosting):
 * the service layer + the visitor's Gemini key + localStorage sessions.
 * Mirrors the old API so the UI keeps its event-driven shape.
 */
import { createAiClient, type AiClient } from "@/lib/ai/client";
import { fakeTransport } from "@/lib/ai/fake";
import { createGeminiTransport } from "@/lib/ai/gemini";
import type { Report, Session } from "@/lib/schema";
import {
  errorPayload,
  finishSession,
  getSession,
  prepareAnswer,
  prepareSession,
  ServiceError,
  streamAnswer,
  streamFirstQuestion,
} from "@/lib/session/service";
import { createLocalStore, type SessionStore } from "@/lib/session/store";
import { readAiSettings } from "./settings";

export type ApiErrorPayload = { code: string; message: string; retryable: boolean };

export class ApiClientError extends Error {
  constructor(public payload: ApiErrorPayload) {
    super(payload.message);
  }
}

export type EngineMessage = { event: string; data: unknown };

/** Demo build for tests: canned answers, no key needed. */
export const FAKE_AI = process.env.NEXT_PUBLIC_HRIT_FAKE_AI === "1";

let store: SessionStore | null = null;
const getStore = () => (store ??= createLocalStore());

let cached: { signature: string; client: AiClient } | null = null;

function getAi(): AiClient {
  if (FAKE_AI) {
    if (!cached) {
      cached = {
        signature: "fake",
        client: createAiClient({ transport: fakeTransport, config: { primary: "fake-hydrogen", fallbacks: [], firstTokenTimeoutMs: 8000 } }),
      };
    }
    return cached.client;
  }
  const s = readAiSettings();
  if (!s) throw new ServiceError(401, "no_key", "Добавьте свой ключ Gemini — без него интервьюер не сможет задавать вопросы.");
  // Same key + models → keep the client, so its breaker and model cache persist.
  const signature = [s.apiKey, s.primary, ...s.fallbacks].join("|");
  if (cached?.signature !== signature) {
    cached = {
      signature,
      client: createAiClient({
        transport: createGeminiTransport(s.apiKey),
        config: { primary: s.primary, fallbacks: s.fallbacks, firstTokenTimeoutMs: 12_000 },
      }),
    };
  }
  return cached.client;
}

function toClientError(err: unknown): unknown {
  if (err instanceof ApiClientError) return err;
  if (err instanceof Error && err.name === "AbortError") return err;
  return new ApiClientError(errorPayload(err));
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toClientError(err);
  }
}

export function hasAiAccess(): boolean {
  return FAKE_AI || readAiSettings() !== null;
}

/** Creates a session and streams the first question. */
export function createSession(body: unknown, onMessage: (m: EngineMessage) => void, signal?: AbortSignal) {
  return guarded(async () => {
    const session = prepareSession(body);
    const ai = getAi();
    await streamFirstQuestion(session, { ai, store: getStore() }, (event, data) => onMessage({ event, data }), signal);
  });
}

/** Evaluates an answer: HR reaction, ideal answer, feedback, score, next question. */
export function answer(id: string, body: unknown, onMessage: (m: EngineMessage) => void, signal?: AbortSignal) {
  return guarded(async () => {
    const store = getStore();
    if (!(await store.lock(id))) throw new ServiceError(409, "busy", "Предыдущий ответ ещё обрабатывается.");
    try {
      const { session, input } = await prepareAnswer(id, body, { store });
      const ai = getAi();
      await streamAnswer(session, input, { ai, store }, (event, data) => onMessage({ event, data }), signal);
    } finally {
      await store.unlock(id);
    }
  });
}

export function loadSession(id: string): Promise<Session> {
  return guarded(() => getSession(id, { store: getStore() }));
}

export function finish(id: string): Promise<Report> {
  return guarded(async () => {
    const store = getStore();
    if (!(await store.lock(id))) throw new ServiceError(409, "busy", "Отчёт уже готовится.");
    try {
      const { report } = await finishSession(id, { store, ai: getAi });
      return report;
    } finally {
      await store.unlock(id);
    }
  });
}
