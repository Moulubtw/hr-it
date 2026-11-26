import { describe, expect, it, vi } from "vitest";
import { BASE_COOLDOWN_MS, MAX_COOLDOWN_MS } from "./breaker";
import {
  AllModelsFailedError,
  createAiClient,
  FatalAiError,
  type AiEvent,
  type AiLog,
  type AiRequest,
  type AiTransport,
} from "./client";
import { classifyError } from "./errors";
import { readModelConfig } from "./models";

// ── fakes ───────────────────────────────────────────────────────────────

type Behavior =
  | { kind: "ok"; chunks: string[] }
  | { kind: "error"; status?: number; message?: string; error?: Error }
  | { kind: "hang" }
  | { kind: "breakAfter"; chunks: string[]; status: number };

function apiError(status: number, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status });
}

function fakeTransport(
  behaviors: Record<string, Behavior | Behavior[]>,
  models: string[] | Error = ["models/hydrogen", "models/flash", "models/lite"],
) {
  const calls: string[] = [];
  const counters = new Map<string, number>();

  const transport: AiTransport = {
    async *stream(model, _req, signal) {
      calls.push(model);
      const list = behaviors[model];
      const n = counters.get(model) ?? 0;
      counters.set(model, n + 1);
      const b = Array.isArray(list) ? list[Math.min(n, list.length - 1)] : list;
      if (!b) throw apiError(404, `model ${model} not found`);

      if (b.kind === "ok") {
        for (const c of b.chunks) yield c;
        return;
      }
      if (b.kind === "error") throw b.error ?? apiError(b.status ?? 500, b.message);
      if (b.kind === "breakAfter") {
        for (const c of b.chunks) yield c;
        throw apiError(b.status);
      }
      // hang until aborted
      await new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    },
    async listModels() {
      if (models instanceof Error) throw models;
      return models;
    },
  };
  return { transport, calls };
}

const config = {
  primary: "hydrogen",
  fallbacks: ["flash", "lite"],
  firstTokenTimeoutMs: 40,
};

const req: AiRequest = { messages: [{ role: "user", text: "Привет" }] };

async function collect(it: AsyncIterable<AiEvent>) {
  const events: AiEvent[] = [];
  for await (const e of it) events.push(e);
  return events;
}

function setup(
  behaviors: Record<string, Behavior | Behavior[]>,
  opts: { models?: string[] | Error; clock?: { t: number } } = {},
) {
  const { transport, calls } = fakeTransport(behaviors, opts.models);
  const logs: AiLog[] = [];
  const clock = opts.clock;
  const client = createAiClient({
    transport,
    config,
    now: clock ? () => clock.t : undefined,
    onLog: (l) => logs.push(l),
  });
  return { client, calls, logs };
}

// ── config ──────────────────────────────────────────────────────────────

describe("readModelConfig", () => {
  it("parses env, strips models/ prefix, dedupes and drops the primary from fallbacks", () => {
    const c = readModelConfig({
      GEMINI_PRIMARY_MODEL: "models/hydrogen",
      GEMINI_FALLBACK_MODELS: " flash, models/lite ,flash,hydrogen,",
      GEMINI_FIRST_TOKEN_TIMEOUT_MS: "5000",
    });
    expect(c).toEqual({ primary: "hydrogen", fallbacks: ["flash", "lite"], firstTokenTimeoutMs: 5000 });
  });

  it("requires a primary model and defaults the timeout", () => {
    expect(() => readModelConfig({})).toThrow(/GEMINI_PRIMARY_MODEL/);
    expect(readModelConfig({ GEMINI_PRIMARY_MODEL: "h" }).firstTokenTimeoutMs).toBe(8000);
  });
});

// ── error classification ────────────────────────────────────────────────

describe("classifyError", () => {
  it.each([
    [429, "skip", "rate_limited"],
    [500, "skip", "server_error"],
    [503, "skip", "server_error"],
    [404, "skip", "not_found"],
    [403, "skip", "forbidden"],
    [401, "fatal", "unauthorized"],
  ] as const)("status %i → %s/%s", (status, action, reason) => {
    expect(classifyError(apiError(status))).toMatchObject({ action, reason });
  });

  it("treats 400 about the model as skip and other 400s as fatal", () => {
    expect(classifyError(apiError(400, "model is not supported"))).toMatchObject({ action: "skip" });
    expect(classifyError(apiError(400, "invalid argument: contents"))).toMatchObject({ action: "fatal" });
  });

  it("treats network failures as skip", () => {
    expect(classifyError(new TypeError("fetch failed"))).toMatchObject({ action: "skip", reason: "network" });
  });
});

// ── fallback ────────────────────────────────────────────────────────────

describe("createAiClient.stream", () => {
  it("uses the primary model when it works", async () => {
    const { client, calls } = setup({ hydrogen: { kind: "ok", chunks: ["При", "вет"] } });
    const events = await collect(client.stream(req));
    expect(calls).toEqual(["hydrogen"]);
    expect(events.at(-1)).toEqual({ type: "done", model: "hydrogen", text: "Привет", fallback: false });
  });

  it.each([429, 500, 503, 404, 403])("falls back on HTTP %i", async (status) => {
    const { client, calls } = setup({
      hydrogen: { kind: "error", status },
      flash: { kind: "ok", chunks: ["ok"] },
    });
    const events = await collect(client.stream(req));
    expect(calls).toEqual(["hydrogen", "flash"]);
    expect(events.at(-1)).toMatchObject({ type: "done", model: "flash", fallback: true });
    // Nothing was streamed before the failure, so no reset is needed.
    expect(events.some((e) => e.type === "reset")).toBe(false);
  });

  it("falls back on network errors", async () => {
    const { client, calls } = setup({
      hydrogen: { kind: "error", error: new TypeError("fetch failed") },
      flash: { kind: "ok", chunks: ["ok"] },
    });
    await collect(client.stream(req));
    expect(calls).toEqual(["hydrogen", "flash"]);
  });

  it("falls back when no first token arrives in time", async () => {
    const { client, calls, logs } = setup({
      hydrogen: { kind: "hang" },
      flash: { kind: "ok", chunks: ["fast"] },
    });
    const events = await collect(client.stream(req));
    expect(calls).toEqual(["hydrogen", "flash"]);
    expect(events.at(-1)).toMatchObject({ type: "done", model: "flash", text: "fast" });
    expect(logs).toContainEqual(expect.objectContaining({ type: "failure", model: "hydrogen", reason: "timeout" }));
  });

  it("emits reset and restarts on the next model when a stream breaks mid-way", async () => {
    const { client } = setup({
      hydrogen: { kind: "breakAfter", chunks: ["Полови"], status: 503 },
      flash: { kind: "ok", chunks: ["Целый ответ"] },
    });
    const events = await collect(client.stream(req));
    expect(events).toEqual([
      { type: "text", delta: "Полови" },
      { type: "reset", reason: "server_error", from: "hydrogen", model: "flash" },
      { type: "text", delta: "Целый ответ" },
      { type: "done", model: "flash", text: "Целый ответ", fallback: true },
    ]);
  });

  it("walks the whole chain and reports every attempt when all fail", async () => {
    const { client, calls } = setup({
      hydrogen: { kind: "error", status: 429 },
      flash: { kind: "error", status: 500 },
      lite: { kind: "error", status: 503 },
    });
    const err = await collect(client.stream(req)).catch((e) => e);
    expect(err).toBeInstanceOf(AllModelsFailedError);
    expect((err as AllModelsFailedError).attempts.map((a) => a.reason)).toEqual([
      "rate_limited",
      "server_error",
      "server_error",
    ]);
    expect(calls).toEqual(["hydrogen", "flash", "lite"]);
  });

  it("stops immediately on a fatal error instead of trying other models", async () => {
    const { client, calls } = setup({ hydrogen: { kind: "error", status: 401 } });
    await expect(collect(client.stream(req))).rejects.toBeInstanceOf(FatalAiError);
    expect(calls).toEqual(["hydrogen"]);
  });

  it("does not fall back when the caller aborts", async () => {
    const { client, calls } = setup({ hydrogen: { kind: "hang" }, flash: { kind: "ok", chunks: ["x"] } });
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5);
    const err = await collect(client.stream({ ...req, signal: ctrl.signal })).catch((e) => e);
    expect(err).toBeInstanceOf(FatalAiError);
    expect((err as FatalAiError).reason).toBe("aborted");
    expect(calls).toEqual(["hydrogen"]);
  });

  it("generate() returns the final text and model", async () => {
    const { client } = setup({
      hydrogen: { kind: "error", status: 429 },
      flash: { kind: "ok", chunks: ["a", "b"] },
    });
    await expect(client.generate(req)).resolves.toEqual({ text: "ab", model: "flash", fallback: true });
  });
});

// ── circuit breaker ─────────────────────────────────────────────────────

describe("circuit breaker", () => {
  it("benches a failed model for 60 s, then tries it again", async () => {
    const clock = { t: 1_000_000 };
    const { client, calls } = setup(
      {
        hydrogen: [{ kind: "error", status: 429 }, { kind: "ok", chunks: ["back"] }],
        flash: { kind: "ok", chunks: ["ok"] },
      },
      { clock },
    );

    await collect(client.stream(req));
    expect(client.candidates()).toEqual(["flash", "lite"]);

    clock.t += BASE_COOLDOWN_MS - 1;
    await collect(client.stream(req));
    expect(calls).toEqual(["hydrogen", "flash", "flash"]);

    clock.t += 2;
    const events = await collect(client.stream(req));
    expect(events.at(-1)).toMatchObject({ model: "hydrogen", fallback: false });
  });

  it("doubles the cooldown on repeated failures, capped at 5 min", async () => {
    const clock = { t: 0 };
    const { client, logs } = setup(
      { hydrogen: { kind: "error", status: 500 }, flash: { kind: "ok", chunks: ["ok"] } },
      { clock },
    );
    const cooldowns: number[] = [];
    for (let i = 0; i < 5; i++) {
      await collect(client.stream(req));
      const f = logs.filter((l) => l.type === "failure").at(-1) as Extract<AiLog, { type: "failure" }>;
      cooldowns.push(f.cooldownMs);
      clock.t += f.cooldownMs; // let it reopen
    }
    expect(cooldowns).toEqual([60_000, 120_000, 240_000, MAX_COOLDOWN_MS, MAX_COOLDOWN_MS]);
  });

  it("benches a missing model for the max cooldown at once", async () => {
    const { logs, client } = setup({ hydrogen: { kind: "error", status: 404 }, flash: { kind: "ok", chunks: ["ok"] } });
    await collect(client.stream(req));
    expect(logs).toContainEqual(expect.objectContaining({ model: "hydrogen", cooldownMs: MAX_COOLDOWN_MS }));
  });

  it("still tries the soonest-recovering model when every model is benched", async () => {
    const clock = { t: 0 };
    const { client } = setup(
      {
        hydrogen: { kind: "error", status: 500 },
        flash: { kind: "error", status: 404 },
        lite: { kind: "error", status: 500 },
      },
      { clock },
    );
    await collect(client.stream(req)).catch(() => {});
    // hydrogen and lite benched 60 s, flash 5 min → hydrogen recovers first.
    expect(client.candidates()).toEqual(["hydrogen"]);
  });
});

// ── models.list cache ───────────────────────────────────────────────────

describe("model availability", () => {
  it("skips configured models that the key cannot see", async () => {
    const { client, calls } = setup(
      { hydrogen: { kind: "ok", chunks: ["x"] }, flash: { kind: "ok", chunks: ["y"] } },
      { models: ["models/flash", "models/lite"] },
    );
    await client.refreshAvailability();
    const events = await collect(client.stream(req));
    expect(calls).toEqual(["flash"]);
    expect(events.at(-1)).toMatchObject({ model: "flash" });
  });

  it("ignores a failed models.list and uses the full chain", async () => {
    const { client, calls } = setup(
      { hydrogen: { kind: "ok", chunks: ["x"] } },
      { models: new Error("list failed") },
    );
    await client.refreshAvailability();
    await collect(client.stream(req));
    expect(calls).toEqual(["hydrogen"]);
  });

  it("falls back to the full chain if models.list contains none of the configured models", async () => {
    const { client } = setup({}, { models: ["models/other"] });
    await client.refreshAvailability();
    expect(client.candidates()).toEqual(["hydrogen", "flash", "lite"]);
  });

  it("does not block the first request on models.list", async () => {
    const listModels = vi.fn(() => new Promise<string[]>(() => {})); // never resolves
    const client = createAiClient({
      transport: {
        async *stream() {
          yield "fast";
        },
        listModels,
      },
      config,
    });
    await expect(client.generate(req)).resolves.toMatchObject({ text: "fast" });
    expect(listModels).toHaveBeenCalledOnce();
  });
});
