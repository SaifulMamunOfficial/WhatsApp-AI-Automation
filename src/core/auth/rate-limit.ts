/**
 * Sliding-window limiter for failed login attempts.
 * In-memory: correct for the single-instance VPS deployment. Move to the DB
 * if the app is ever run as multiple instances.
 */
export class LoginRateLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isBlocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    const list = this.recent(key, now);
    list.push(now);
    this.failures.set(key, list);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}

export const loginLimiter = new LoginRateLimiter();
