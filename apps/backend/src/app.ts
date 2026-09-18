import cors from 'cors';
import express, { type Express } from 'express';
import type { Pool } from 'pg';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { createRegistrationRateLimiters, type RateLimitOptions } from './middleware/rate-limit.js';
import { createAdminRouter } from './routes/admin.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createRegistrationsRouter } from './routes/registrations.js';
import { createSessionMiddleware } from './session.js';

export interface AppOptions {
  rateLimits?: RateLimitOptions;
}

export function createApp(pool: Pool, options: AppOptions = {}): Express {
  const app = express();

  if (config.isProduction) {
    // Railway terminates TLS at its proxy; without this, req.secure and the
    // rate limiter's client IP would both read the proxy's own connection.
    app.set('trust proxy', config.trustProxyHops);
  }

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

  app.use(express.json());
  app.use(createSessionMiddleware(pool));

  app.use('/api/catalog', createCatalogRouter(pool));
  app.use('/api/registrations', createRegistrationRateLimiters(options.rateLimits), createRegistrationsRouter(pool));

  const adminRouter = createAdminRouter(pool);
  if (adminRouter) {
    app.use('/api/admin', adminRouter);
  }

  app.use(errorHandler);

  return app;
}
