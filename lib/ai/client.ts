/**
 * Streaming client with automatic model fallback (PLAN.md §2.2).
 *
 * Tries Gemini 4 Hydrogen first, then fast models in order. A model is
 * skipped on 429 / 5xx / 404 / 403 / network errors / no first token in
 * time, and benched by the circuit breaker. If a stream breaks after text
 * was already sent, a `reset` event tells the caller to drop that text,
 * and the next model starts from scratch.
 *
 * The transport is injected, so this file has no SDK or server-only
 * dependency and can be unit-tested with fakes.
 */

import { CircuitBreaker } from "./breaker";
import {
  classifyError,
  FirstTokenTimeoutError,
  type FailureReason,
} from "./errors";
import { modelChain, normalizeModelId, type ModelConfig } from "./models";

export type AiMessage = { role: "user" | "model"; text: string };

export type AiRequest = {
  system?: string;
  messages: AiMessage[];
  /** JSON schema for structured output; the model then returns JSON text. */
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  signal?: AbortSignal;
};

export interface AiTransport {
  stream(model: string, req: AiRequest, signal: AbortSignal): AsyncIterable<string>;
  /** IDs of models available to this key (with or without `models/`). */
  listModels(): Promise<string[]>;
}

export type AiEvent =
  | { type: "text"; delta: string }
  /** Drop any text received so far; `model` takes over from scratch. */
  | { type: "reset"; reason: FailureReason; from: string; model: string }
  | { type: "done"; model: string; text: string; fallback: boolean };

export type AiLog =
  | { type: "attempt"; model: string }
  | { type: "success"; model: string; firstTokenMs: number; totalMs: number }
  | {
      type: "failure";
      model: string;
      reason: FailureReason;
      afterText: boolean;
      cooldownMs: number;
    };

export class AllModelsFailedError extends Error {
  constructor(
    public attempts: { model: string; reason: FailureReason; message: string }[],
  ) {
    super(
      `All models failed: ${attempts.map((a) => `${a.model} (${a.reason})`).join(", ") || "no models configured"}`,
    );
    this.name = "AllModelsFailedError";
  }
}

export class FatalAiError extends Error {
  constructor(
    public model: string,
    public reason: FailureReason,
    message: string,
  ) {
    super(message);
    this.name = "FatalAiError";
  }
}

const AVAILABILITY_TTL_MS = 10 * 60_000;

type Options = {
  transport: AiTransport;
  config: ModelConfig;
  now?: () => number;
  onLog?: (log: AiLog) => void;
};

export function createAiClient({ transport, config, now = Date.now, onLog }: Options) {
  const breaker = new CircuitBreaker(now);

  // ── models.list cache ────────────────────────────────────────────────
  let available: Set<string> | null = null;
  let fetchedAt = -Infinity;
  let refreshing: Promise<void> | null = null;

  function refreshAvailability(): Promise<void> {
    if (!refreshing) {
      refreshing = transport
        .listModels()
        .then((ids) => {
          available = new Set(ids.map(normalizeModelId));
          fetchedAt = now();
        })
        .catch(() => {
          // Keep the previous list; try again on the next call.
        })
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  /** Never blocks a request on models.list — it only prunes once known. */
  function maybeRefresh() {
    if (now() - fetchedAt > AVAILABILITY_TTL_MS) void refreshAvailability();
  }

  function candidates(): string[] {
    const all = modelChain(config);
    const listed = available ? all.filter((m) => available!.has(m)) : all;
    const pool = listed.length > 0 ? listed : all;
    const healthy = pool.filter((m) => !breaker.isOpen(m));
    if (healthy.length > 0) return healthy;
    // Everything is benched: try the one that recovers soonest anyway.
    const soonest = [...pool].sort((a, b) => breaker.openUntil(a) - breaker.openUntil(b))[0];
    return soonest ? [soonest] : [];
  }

  // ── one attempt on one model ──────────────────────────────────────────
  async function* attempt(model: string, req: AiRequest) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort(req.signal?.reason);
    if (req.signal?.aborted) onAbort();
    req.signal?.addEventListener("abort", onAbort, { once: true });

    const iterator = transport.stream(model, req, ctrl.signal)[Symbol.asyncIterator]();
    const started = now();
    const deadline = started + config.firstTokenTimeoutMs;
    let gotText = false;
    let firstTokenMs = 0;

    try {
      while (true) {
        const next = gotText
          ? await iterator.next()
          : await raceDeadline(iterator.next(), deadline - now(), config.firstTokenTimeoutMs, ctrl);
        if (next.done) break;
        const delta = next.value;
        if (!delta) continue;
        if (!gotText) {
          gotText = true;
          firstTokenMs = now() - started;
        }
        yield delta;
      }
      if (!gotText) throw new FirstTokenTimeoutError(config.firstTokenTimeoutMs);
      return { firstTokenMs, totalMs: now() - started };
    } catch (err) {
      void iterator.return?.(undefined)?.catch?.(() => {});
      throw Object.assign(new AttemptError(err), { afterText: gotText });
    } finally {
      req.signal?.removeEventListener("abort", onAbort);
    }
  }

  // ── public API ────────────────────────────────────────────────────────
  async function* stream(req: AiRequest): AsyncGenerator<AiEvent, void, void> {
    maybeRefresh();

    const failures: { model: string; reason: FailureReason; message: string }[] = [];
    const queue = candidates();
    let text = "";
    let previous: { model: string; reason: FailureReason } | null = null;

    for (const model of queue) {
      if (previous && text) {
        yield { type: "reset", reason: previous.reason, from: previous.model, model };
        text = "";
      }
      onLog?.({ type: "attempt", model });

      const run = attempt(model, req);
      try {
        let step = await run.next();
        while (!step.done) {
          text += step.value;
          yield { type: "text", delta: step.value };
          step = await run.next();
        }
        breaker.recordSuccess(model);
        onLog?.({ type: "success", model, ...step.value });
        yield { type: "done", model, text, fallback: model !== config.primary };
        return;
      } catch (err) {
        const cause = err instanceof AttemptError ? err.cause : err;
        const afterText = (err as { afterText?: boolean }).afterText ?? false;
        const c = req.signal?.aborted
          ? ({ action: "fatal", reason: "aborted", message: "Aborted by caller" } as const)
          : classifyError(cause);

        if (c.action === "fatal") {
          throw new FatalAiError(model, c.reason, c.message);
        }

        const cooldownMs = breaker.recordFailure(model, {
          maxCooldown: c.reason === "not_found" || c.reason === "forbidden",
        });
        if (c.reason === "not_found") void refreshAvailability();
        onLog?.({ type: "failure", model, reason: c.reason, afterText, cooldownMs });
        failures.push({ model, reason: c.reason, message: c.message });
        previous = { model, reason: c.reason };
      }
    }

    throw new AllModelsFailedError(failures);
  }

  /** Collects the whole answer; fallback/reset handling stays inside. */
  async function generate(req: AiRequest): Promise<{ text: string; model: string; fallback: boolean }> {
    for await (const ev of stream(req)) {
      if (ev.type === "done") return { text: ev.text, model: ev.model, fallback: ev.fallback };
    }
    throw new AllModelsFailedError([]);
  }

  return {
    stream,
    generate,
    /** For diagnostics / tests. */
    candidates,
    refreshAvailability,
  };
}

export type AiClient = ReturnType<typeof createAiClient>;

class AttemptError extends Error {
  constructor(public override cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

function raceDeadline<T>(
  p: Promise<T>,
  remainingMs: number,
  budgetMs: number,
  ctrl: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new FirstTokenTimeoutError(budgetMs);
      ctrl.abort(err);
      reject(err);
    }, Math.max(0, remainingMs));
  });
  // The losing promise may still reject later; don't let it go unhandled.
  p.catch(() => {});
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
