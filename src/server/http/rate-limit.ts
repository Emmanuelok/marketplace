/**
 * In-process sliding-window rate limiter.
 *
 * This is per-instance only. On a multi-instance deployment each instance
 * enforces its own budget, so the effective limit is `limit x instances` —
 * move this to Redis before relying on it as a spend control rather than as
 * abuse protection.
 */

interface Window {
  timestamps: number[];
}

const windows = new Map<string, Window>();
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  // Opportunistic sweep — cheaper than a timer, and this map only grows with
  // distinct keys seen in the last window.
  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    for (const [existingKey, window] of windows) {
      if (window.timestamps.every((t) => now - t > options.windowMs)) windows.delete(existingKey);
    }
    lastSweep = now;
  }

  const window = windows.get(key) ?? { timestamps: [] };
  window.timestamps = window.timestamps.filter((t) => now - t < options.windowMs);

  if (window.timestamps.length >= options.limit) {
    const oldest = window.timestamps[0] ?? now;
    windows.set(key, window);
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, options.windowMs - (now - oldest)),
    };
  }

  window.timestamps.push(now);
  windows.set(key, window);
  return {
    ok: true,
    remaining: options.limit - window.timestamps.length,
    retryAfterMs: 0,
  };
}

export function resetRateLimits(): void {
  windows.clear();
}
