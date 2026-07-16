export type RateLimitResult = Readonly<{
  allowed: boolean;
  retryAfterMs: number;
}>;

export type HostedRateLimiter = Readonly<{
  consume(): RateLimitResult;
}>;

export function createFixedWindowRateLimiter(options: {
  limit: number;
  now?: () => number;
  windowMs?: number;
}): HostedRateLimiter {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? 60_000;
  let windowStart = now();
  let count = 0;

  return {
    consume() {
      const current = now();
      if (current >= windowStart + windowMs) {
        windowStart = current;
        count = 0;
      }
      const retryAfterMs = Math.max(1, windowStart + windowMs - current);
      if (count >= options.limit) {
        return { allowed: false, retryAfterMs };
      }
      count += 1;
      return { allowed: true, retryAfterMs };
    },
  };
}
