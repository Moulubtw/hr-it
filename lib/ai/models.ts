/**
 * Model chain configuration (PLAN.md §2.2).
 *
 * The primary model is Gemini 4 Hydrogen; its exact ID comes from env so it
 * can be confirmed in Google AI Studio / `models.list` without a code change.
 * Fallbacks are fast models, best first.
 */

export type ModelConfig = {
  primary: string;
  fallbacks: string[];
  firstTokenTimeoutMs: number;
};

type Env = Record<string, string | undefined>;

const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 8000;

/** `models/gemini-x` and `gemini-x` refer to the same model. */
export function normalizeModelId(id: string): string {
  return id.trim().replace(/^models\//, "");
}

export function readModelConfig(env: Env = process.env): ModelConfig {
  const primary = normalizeModelId(env.GEMINI_PRIMARY_MODEL ?? "");
  if (!primary) {
    throw new Error(
      "GEMINI_PRIMARY_MODEL is not set. Put the Gemini 4 Hydrogen model ID in .env.local.",
    );
  }

  const fallbacks = (env.GEMINI_FALLBACK_MODELS ?? "")
    .split(",")
    .map(normalizeModelId)
    .filter(Boolean);

  const timeout = Number(env.GEMINI_FIRST_TOKEN_TIMEOUT_MS);

  return {
    primary,
    // Keep order, drop duplicates and the primary itself.
    fallbacks: [...new Set(fallbacks)].filter((m) => m !== primary),
    firstTokenTimeoutMs:
      Number.isFinite(timeout) && timeout > 0
        ? timeout
        : DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
  };
}

export function modelChain(config: ModelConfig): string[] {
  return [config.primary, ...config.fallbacks];
}
