import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Pool } from 'pg';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { createApiRateLimiter, createRegistrationRateLimiters, type RateLimitOptions } from './middleware/rate-limit.js';
import { createAdminRouter, type AdminRouterOptions } from './routes/admin.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createEventRouter } from './routes/event.js';
import { createRegistrationsRouter } from './routes/registrations.js';
import { createSessionMiddleware } from './session.js';

export interface AppOptions {
  rateLimits?: RateLimitOptions;
  // Requests per minute per IP across the whole /api.
  apiRateLimitPerIp?: number;
  admin?: AdminRouterOptions;
}

export function createApp(pool: Pool, options: AppOptions = {}): Express {
  const app = express();

  if (config.isProduction) {
    // Railway terminates TLS at its proxy; without this, req.secure and the
    // rate limiter's client IP would both read the proxy's own connection.
    app.set('trust proxy', config.trustProxyHops);
  }

  // The API only serves JSON, so anything meant for HTML pages (script/style policies,
  // cross-origin isolation) is off or minimal; what matters is that no response can be
  // framed, sniffed into another type or leak the URL through the Referer header.
  app.use(
    helmet({
      // useDefaults: false, otherwise helmet merges its own script/style/font rules into these.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      // Only meaningful over HTTPS, and a local http:// dev server must never be pinned to it.
      strictTransportSecurity: config.isProduction ? { maxAge: 15_552_000 } : false,
    }),
  );

  if (config.corsOrigin) {
    app.use(cors({ origin: config.corsOrigin, credentials: true }));
  }

  // Registered before the session middleware so Railway's health check never
  // depends on the database being reachable.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Separate from /health: this one actually hits Postgres, for callers that need to
  // know the backend can serve real traffic rather than just that the process is up.
  app.get('/health/ready', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'error' });
    }
  });

  // After /health so health checks are never limited; before the body parser and the session
  // so throttled requests cost as little as possible.
  app.use('/api', createApiRateLimiter(options.apiRateLimitPerIp));

  app.use(express.json());
  app.use(createSessionMiddleware(pool));

  app.use('/api/catalog', createCatalogRouter(pool));
  app.use('/api/event', createEventRouter(pool));
  app.use('/api/registrations', createRegistrationRateLimiters(options.rateLimits), createRegistrationsRouter(pool));

  const adminRouter = createAdminRouter(pool, options.admin);
  if (adminRouter) {
    app.use('/api/admin', adminRouter);
  }

  // Anything under /api that no router claimed. /health is registered above and never
  // reaches this, and the frontend server only proxies /api here, so nothing else is affected.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use(errorHandler);

  return app;
}
