"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { answer as sendAnswer, ApiClientError, loadSession, type ApiErrorPayload } from "@/lib/client/engine";
import { updateHistory } from "@/lib/history";
import type { Session, Turn } from "@/lib/schema";
import type { QuestionKind } from "@/lib/session/options";

export type Question = { index: number; question: string; kind: QuestionKind; isFollowUp: boolean };

export type Live = {
  hrReaction: string;
  idealAnswer: string;
  feedback: string[] | null;
  score: number | null;
};

export type Phase = "loading" | "answering" | "evaluating" | "reviewed" | "missing";

export type InterviewState = {
  phase: Phase;
  session: Session | null;
  current: Question | null;
  /** The answer being evaluated / reviewed. */
  answer: string;
  live: Live;
  /** Arrives with turn_done; null after the last question. */
  next: Question | null;
  model: { name: string; fallback: boolean } | null;
  error: ApiErrorPayload | null;
  startedAt: number;
};

const EMPTY_LIVE: Live = { hrReaction: "", idealAnswer: "", feedback: null, score: null };

type Action =
  | { type: "loaded"; session: Session; now: number }
  | { type: "load_failed"; error: ApiErrorPayload }
  | { type: "submit"; answer: string }
  | { type: "delta"; field: "hrReaction" | "idealAnswer"; delta: string }
  | { type: "replace_hr"; text: string }
  | { type: "feedback"; items: string[] }
  | { type: "score"; score: number }
  | { type: "model"; name: string; fallback: boolean }
  | { type: "reset" }
  | { type: "turn_done"; turn: Turn; next: Question | null }
  | { type: "failed"; error: ApiErrorPayload }
  | { type: "advance"; now: number }
  | { type: "dismiss_error" };

const fromTurn = (t: Turn): Live => ({
  hrReaction: t.hrReaction,
  idealAnswer: t.idealAnswer,
  feedback: t.feedback,
  score: t.score,
});

function reducer(s: InterviewState, a: Action): InterviewState {
  switch (a.type) {
    case "loaded": {
      const { session } = a;
      if (session.pending) {
        return {
          ...s,
          phase: "answering",
          session,
          current: { index: session.turns.length, ...session.pending },
          startedAt: a.now,
          error: null,
        };
      }
      const last = session.turns.at(-1);
      if (!last) return { ...s, phase: "missing", session };
      // Finished interview reopened: show the last review with "to report".
      return {
        ...s,
        phase: "reviewed",
        session,
        current: { index: last.index, question: last.question, kind: last.kind, isFollowUp: last.isFollowUp },
        answer: last.answer,
        live: fromTurn(last),
        next: null,
      };
    }
    case "load_failed":
      return { ...s, phase: "missing", error: a.error };
    case "submit":
      return { ...s, phase: "evaluating", answer: a.answer, live: EMPTY_LIVE, error: null };
    case "delta":
      return { ...s, live: { ...s.live, [a.field]: s.live[a.field] + a.delta } };
    case "replace_hr":
      return { ...s, live: { ...s.live, hrReaction: a.text } };
    case "feedback":
      return { ...s, live: { ...s.live, feedback: a.items } };
    case "score":
      return { ...s, live: { ...s.live, score: a.score } };
    case "model":
      return { ...s, model: { name: a.name, fallback: a.fallback } };
    case "reset":
      return { ...s, live: EMPTY_LIVE };
    case "turn_done":
      return {
        ...s,
        phase: "reviewed",
        live: fromTurn(a.turn),
        next: a.next,
        session: s.session ? { ...s.session, turns: [...s.session.turns, a.turn], pending: a.next && { question: a.next.question, kind: a.next.kind, isFollowUp: a.next.isFollowUp } } : s.session,
      };
    case "failed":
      // Back to answering; the draft is still in the answer box.
      return { ...s, phase: "answering", live: EMPTY_LIVE, error: a.error };
    case "advance":
      if (!s.next) return s;
      return { ...s, phase: "answering", current: s.next, next: null, answer: "", live: EMPTY_LIVE, startedAt: a.now };
    case "dismiss_error":
      return { ...s, error: null };
  }
}

const INITIAL: InterviewState = {
  phase: "loading",
  session: null,
  current: null,
  answer: "",
  live: EMPTY_LIVE,
  next: null,
  model: null,
  error: null,
  startedAt: 0,
};

const toPayload = (err: unknown): ApiErrorPayload =>
  err instanceof ApiClientError ? err.payload : { code: "unknown", message: "Что-то пошло не так.", retryable: true };

export function useInterview(id: string) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSession(id)
      .then((session) => !cancelled && dispatch({ type: "loaded", session, now: Date.now() }))
      .catch((err) => {
        if (!cancelled) dispatch({ type: "load_failed", error: toPayload(err) });
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [id]);

  const submit = useCallback(
    async (answer: string) => {
      const text = answer.trim();
      if (!text || state.phase !== "answering") return false;
      const elapsedMs = Math.max(0, Date.now() - state.startedAt);

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      dispatch({ type: "submit", answer: text });

      try {
        await sendAnswer(
          id,
          { answer: text, elapsedMs },
          ({ event, data }) => {
            const d = data as Record<string, unknown>;
            switch (event) {
              case "hr_reaction":
                return dispatch({ type: "delta", field: "hrReaction", delta: d.delta as string });
              case "ideal_answer":
                return dispatch({ type: "delta", field: "idealAnswer", delta: d.delta as string });
              case "hr_reaction_replace":
                return dispatch({ type: "replace_hr", text: d.text as string });
              case "feedback":
                return dispatch({ type: "feedback", items: d.items as string[] });
              case "score":
                return dispatch({ type: "score", score: d.score as number });
              case "model":
                return dispatch({ type: "model", name: d.model as string, fallback: d.fallback as boolean });
              case "reset":
                return dispatch({ type: "reset" });
              case "turn_done":
                updateHistory(id, { answered: (d.turn as Turn).index + 1 });
                return dispatch({ type: "turn_done", turn: d.turn as Turn, next: d.next as Question | null });
            }
          },
          ctrl.signal,
        );
        return true;
      } catch (err) {
        if (!ctrl.signal.aborted) dispatch({ type: "failed", error: toPayload(err) });
        return false;
      }
    },
    [id, state.phase, state.startedAt],
  );

  const advance = useCallback(() => dispatch({ type: "advance", now: Date.now() }), []);
  const dismissError = useCallback(() => dispatch({ type: "dismiss_error" }), []);

  return { state, submit, advance, dismissError };
}
