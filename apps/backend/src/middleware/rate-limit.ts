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

// Requests per minute for one IP across the whole /api. It sits above the registrations
// limits (600 per IP) so it never cuts into their budget: it only exists to stop a client
// hammering the cheaper endpoints (catalog, event, admin) that have no limiter of their own.
export const DEFAULT_API_RATE_LIMIT_PER_IP = 1200;

const tooManyRequests = {
  error: 'rate_limited',
  message: 'Demasiadas solicitudes, espera un momento.',
};

const common = {
  windowMs: 60_000,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests,
} as const;

// A factory instead of module-level singletons: each createApp() call (one per
// running server, but also one per test file) gets its own counters, so unrelated
// tests don't share a request budget with each other. Must run after the session
// middleware, since the per-session key is the session id.
export function createRegistrationRateLimiters(
  options: RateLimitOptions = DEFAULT_RATE_LIMITS,
): RequestHandler[] {
  return [
    rateLimit({ ...common, limit: options.perSession, keyGenerator: (req) => req.sessionID }),
    rateLimit({ ...common, limit: options.perIp }),
  ];
}

// Keyed by IP only: a visitor who has not saved anything has no stable session id (see
// session.ts), so the session id can't be used to count their requests.
export function createApiRateLimiter(perIp: number = DEFAULT_API_RATE_LIMIT_PER_IP): RequestHandler {
  return rateLimit({ ...common, limit: perIp });
}
