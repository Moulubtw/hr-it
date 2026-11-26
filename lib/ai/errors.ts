/**
 * Decides what a failed model call means for the fallback chain.
 *
 * - `skip`  — this model can't serve now (quota, outage, timeout, missing):
 *             try the next one.
 * - `fatal` — the request or the key is wrong; another model won't help.
 */

export type FailureReason =
  | "rate_limited"
  | "server_error"
  | "not_found"
  | "forbidden"
  | "timeout"
  | "network"
  | "aborted"
  | "bad_request"
  | "unauthorized"
  | "unknown";

export type Classified = {
  action: "skip" | "fatal";
  reason: FailureReason;
  message: string;
};

/** Thrown internally when no first token arrives in time. */
export class FirstTokenTimeoutError extends Error {
  constructor(ms: number) {
    super(`No first token within ${ms} ms`);
    this.name = "FirstTokenTimeoutError";
  }
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const s = (err as { status?: unknown; code?: unknown }).status ??
      (err as { code?: unknown }).code;
    if (typeof s === "number") return s;
  }
  return undefined;
}

export function classifyError(err: unknown): Classified {
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof FirstTokenTimeoutError) {
    return { action: "skip", reason: "timeout", message };
  }

  const status = statusOf(err);
  if (status !== undefined) {
    if (status === 429) return { action: "skip", reason: "rate_limited", message };
    if (status >= 500) return { action: "skip", reason: "server_error", message };
    if (status === 404) return { action: "skip", reason: "not_found", message };
    // 403 is usually "this key has no access to this model".
    if (status === 403) return { action: "skip", reason: "forbidden", message };
    if (status === 401) return { action: "fatal", reason: "unauthorized", message };
    if (status === 400 && /api[_ -]?key/i.test(message)) {
      return { action: "fatal", reason: "unauthorized", message };
    }
    if (status === 400) {
      // Retired / unsupported model IDs come back as 400 on some endpoints.
      return /model|not (found|supported)/i.test(message)
        ? { action: "skip", reason: "not_found", message }
        : { action: "fatal", reason: "bad_request", message };
    }
  }

  if (err instanceof Error && err.name === "AbortError") {
    return { action: "fatal", reason: "aborted", message };
  }

  if (
    err instanceof TypeError ||
    /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(message)
  ) {
    return { action: "skip", reason: "network", message };
  }

  return { action: "skip", reason: "unknown", message };
}
