import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

// A factory instead of a module-level singleton: each createApp() call (one per
// running server, but also one per test file) gets its own counter, so unrelated
// tests don't share a request budget with each other.
export function createRegistrationRateLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
