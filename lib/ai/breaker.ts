/**
 * In-memory circuit breaker per model (PLAN.md §2.2).
 * A failed model is benched for 60 s; each consecutive failure doubles the
 * bench time up to 5 min. A success clears it.
 */

export const BASE_COOLDOWN_MS = 60_000;
export const MAX_COOLDOWN_MS = 5 * 60_000;

type State = { failures: number; openUntil: number };

export class CircuitBreaker {
  private states = new Map<string, State>();

  constructor(private now: () => number = Date.now) {}

  isOpen(model: string): boolean {
    const s = this.states.get(model);
    return !!s && s.openUntil > this.now();
  }

  /** When the model becomes usable again (0 if it already is). */
  openUntil(model: string): number {
    const s = this.states.get(model);
    return s && s.openUntil > this.now() ? s.openUntil : 0;
  }

  recordFailure(model: string, opts: { maxCooldown?: boolean } = {}): number {
    const failures = (this.states.get(model)?.failures ?? 0) + 1;
    const cooldown = opts.maxCooldown
      ? MAX_COOLDOWN_MS
      : Math.min(BASE_COOLDOWN_MS * 2 ** (failures - 1), MAX_COOLDOWN_MS);
    const openUntil = this.now() + cooldown;
    this.states.set(model, { failures, openUntil });
    return cooldown;
  }

  recordSuccess(model: string): void {
    this.states.delete(model);
  }
}
