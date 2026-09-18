import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

export interface RateLimitOptions {
  perSession: number;
  perIp: number;
}

// Requests per minute. At the fair everyone shares the venue's WiFi, so one IP stands for
// many different people: the per-session limit is the real guard against a runaway client,
// and the per-IP limit is only a generous safety net.
export const DEFAULT_RATE_LIMITS: RateLimitOptions = { perSession: 120, perIp: 600 };

const tooManyRequests = {
  error: 'rate_limited',
  message: 'Demasiadas solicitudes, espera un momento.',
};

// A factory instead of module-level singletons: each createApp() call (one per
// running server, but also one per test file) gets its own counters, so unrelated
// tests don't share a request budget with each other. Must run after the session
// middleware, since the per-session key is the session id.
export function createRegistrationRateLimiters(
  options: RateLimitOptions = DEFAULT_RATE_LIMITS,
): RequestHandler[] {
  const common = {
    windowMs: 60_000,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooManyRequests,
  } as const;

  return [
    rateLimit({ ...common, limit: options.perSession, keyGenerator: (req) => req.sessionID }),
    rateLimit({ ...common, limit: options.perIp }),
  ];
}
