import { describe, expect, it } from "vitest";
import type { AiClient, AiEvent, AiRequest } from "@/lib/ai/client";
import { AllModelsFailedError } from "@/lib/ai/client";
import {
  errorPayload,
  finishSession,
  prepareAnswer,
  prepareSession,
  ServiceError,
  streamAnswer,
  streamFirstQuestion,
  type Deps,
} from "./service";
import { createMemoryStore } from "./store";

/** Fake AI: returns queued JSON replies, streamed in small chunks. */
function fakeAi(replies: (object | string | Error)[]) {
  const requests: AiRequest[] = [];
  const next = () => {
    const r = replies.shift();
    if (r === undefined) throw new Error("no more replies");
    if (r instanceof Error) throw r;
    return typeof r === "string" ? r : JSON.stringify(r);
  };
  const ai: Pick<AiClient, "stream" | "generate"> = {
    async *stream(req): AsyncGenerator<AiEvent, void, void> {
      requests.push(req);
      const text = next();
      for (let i = 0; i < text.length; i += 7) yield { type: "text", delta: text.slice(i, i + 7) };
      yield { type: "done", model: "hydrogen", text, fallback: false };
    },
    async generate(req) {
      requests.push(req);
      return { text: next(), model: "flash", fallback: true };
    },
  };
  return { ai, requests };
}

function recorder() {
  const events: { event: string; data: unknown }[] = [];
  return { events, send: (event: string, data: unknown) => events.push({ event, data }) };
}

const joined = (events: { event: string; data: unknown }[], name: string) =>
  events.filter((e) => e.event === name).map((e) => (e.data as { delta: string }).delta).join("");

const input = { vacancy: "", role: "Продакт-менеджер", grade: "junior", difficulty: "gentle", tone: "rude" };

const turnReply = (over: object = {}) => ({
  hrReaction: "И это всё?",
  idealAnswer: "Я бы ответил по STAR: [ситуация]…",
  feedback: ["Добавьте цифры"],
  score: 5,
  nextQuestion: "Как вы приоритизируете бэклог?",
  nextQuestionKind: "technical",
  isFollowUp: false,
  ...over,
});

async function started(replies: (object | string | Error)[], body: object = input) {
  const { ai, requests } = fakeAi([{ question: "Почему продукт?", kind: "motivation" }, ...replies]);
  const deps: Deps = { ai, store: createMemoryStore(), newId: () => "sid", now: () => new Date(0) };
  const session = prepareSession(body, deps);
  const rec = recorder();
  await streamFirstQuestion(session, deps, rec.send);
  return { deps, session, rec, requests };
}

describe("create session", () => {
  it("rejects input without vacancy or role", () => {
    const deps: Deps = { ai: fakeAi([]).ai, store: createMemoryStore() };
    expect(() => prepareSession({ grade: "junior", difficulty: "gentle", tone: "polite" }, deps)).toThrow(ServiceError);
    expect(() => prepareSession({ ...input, grade: "boss" }, deps)).toThrow(/Invalid option|grade/i);
  });

  it("streams the first question and stores it as pending", async () => {
    const { deps, rec } = await started([]);
    expect(rec.events[0]).toEqual({ event: "session", data: { sessionId: "sid", totalQuestions: 8, answerSeconds: null } });
    expect(joined(rec.events, "question")).toBe("Почему продукт?");
    expect(rec.events.at(-1)).toMatchObject({ event: "question_done", data: { index: 0, kind: "motivation" } });
    expect((await deps.store.get("sid"))?.pending?.question).toBe("Почему продукт?");
  });
});

describe("answer", () => {
  it("streams reaction, ideal answer, feedback, score and next question, then stores the turn", async () => {
    const { deps } = await started([turnReply()]);
    const { session, input: a } = await prepareAnswer("sid", { answer: "Люблю продукты", elapsedMs: 1200 }, deps);
    const rec = recorder();
    await streamAnswer(session, a, deps, rec.send);

    expect(joined(rec.events, "hr_reaction")).toBe("И это всё?");
    expect(joined(rec.events, "ideal_answer")).toBe("Я бы ответил по STAR: [ситуация]…");
    expect(joined(rec.events, "next_question")).toBe("Как вы приоритизируете бэклог?");
    const names = rec.events.map((e) => e.event);
    expect(names.indexOf("hr_reaction")).toBeLessThan(names.indexOf("ideal_answer"));
    expect(names.slice(-4)).toEqual(["model", "feedback", "score", "turn_done"]);

    const stored = await deps.store.get("sid");
    expect(stored?.turns).toHaveLength(1);
    expect(stored?.turns[0]).toMatchObject({ question: "Почему продукт?", answer: "Люблю продукты", elapsedMs: 1200, score: 5 });
    expect(stored?.pending).toEqual({ question: "Как вы приоритизируете бэклог?", kind: "technical", isFollowUp: false });
  });

  it("replaces an abusive HR line before it is stored", async () => {
    const { deps } = await started([turnReply({ hrReaction: "Вы идиот?" })]);
    const { session, input: a } = await prepareAnswer("sid", { answer: "x" }, deps);
    const rec = recorder();
    await streamAnswer(session, a, deps, rec.send);
    const replaced = rec.events.find((e) => e.event === "hr_reaction_replace");
    expect(replaced).toBeTruthy();
    expect((await deps.store.get("sid"))?.turns[0].hrReaction).not.toMatch(/идиот/);
  });

  it("finishes after the last question and refuses further answers", async () => {
    const { deps } = await started([turnReply({ nextQuestion: "" })]);
    const { session, input: a } = await prepareAnswer("sid", { answer: "x" }, deps);
    const rec = recorder();
    await streamAnswer(session, a, deps, rec.send);
    expect(rec.events.at(-1)).toMatchObject({ event: "turn_done", data: { finished: true, next: null } });
    await expect(prepareAnswer("sid", { answer: "y" }, deps)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects empty answers and unknown sessions", async () => {
    const { deps } = await started([]);
    await expect(prepareAnswer("sid", { answer: "   " }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(prepareAnswer("nope", { answer: "x" }, deps)).rejects.toMatchObject({ status: 404 });
  });

  it("does not store a turn when the model output is broken", async () => {
    const { deps } = await started(['{"hrReaction":"ok"']);
    const { session, input: a } = await prepareAnswer("sid", { answer: "x" }, deps);
    await expect(streamAnswer(session, a, deps, () => {})).rejects.toMatchObject({ code: "bad_model_output" });
    expect((await deps.store.get("sid"))?.turns).toHaveLength(0);
  });
});

describe("finish", () => {
  const report = {
    overall: 6.5,
    criteria: [
      { name: "Структура", score: 6, note: "ок" },
      { name: "Глубина", score: 7, note: "ок" },
      { name: "Примеры", score: 6, note: "ок" },
    ],
    strengths: ["s"],
    weaknesses: ["w"],
    nextSteps: ["n"],
  };

  it("needs at least one answer", async () => {
    const { deps } = await started([]);
    await expect(finishSession("sid", { store: deps.store, ai: () => deps.ai })).rejects.toMatchObject({ status: 409 });
  });

  it("builds the report once and returns the cached one after", async () => {
    const { deps, requests } = await started([turnReply(), report]);
    const { session, input: a } = await prepareAnswer("sid", { answer: "x" }, deps);
    await streamAnswer(session, a, deps, () => {});

    const first = await finishSession("sid", { store: deps.store, ai: () => deps.ai });
    const again = await finishSession("sid", { store: deps.store, ai: () => deps.ai });
    expect(first.report.overall).toBe(6.5);
    expect(again.report).toEqual(first.report);
    expect(requests).toHaveLength(3); // question, turn, report — no second report call
    expect(first.session.modelsUsed).toEqual(["hydrogen", "flash"]);
    expect(first.session.pending).toBeNull();
  });
});

describe("errors and SSE", () => {
  it("maps failures to client-safe payloads", () => {
    expect(errorPayload(new AllModelsFailedError([]))).toMatchObject({ code: "ai_unavailable", retryable: true });
    expect(errorPayload(new ServiceError(400, "invalid_input", "bad"))).toMatchObject({ retryable: false });
    expect(errorPayload(new Error("secret stack"))).toEqual({ code: "internal", message: "Что-то пошло не так.", retryable: true });
  });

  it("marks rate limits and busy sessions as retryable", () => {
    expect(errorPayload(new ServiceError(429, "rate_limited", "x"))).toMatchObject({ retryable: true });
    expect(errorPayload(new ServiceError(409, "busy", "x"))).toMatchObject({ retryable: true });
    expect(errorPayload(new ServiceError(409, "finished", "x"))).toMatchObject({ retryable: false });
  });

  it("lets only one operation hold a session lock, and frees stale locks", async () => {
    const clock = { t: 0 };
    const store = createMemoryStore(() => clock.t);
    expect(await store.lock("s")).toBe(true);
    expect(await store.lock("s")).toBe(false);
    await store.unlock("s");
    expect(await store.lock("s")).toBe(true);
    clock.t += 91_000;
    expect(await store.lock("s")).toBe(true);
  });

});
