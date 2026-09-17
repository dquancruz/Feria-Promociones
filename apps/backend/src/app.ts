import cors from 'cors';
import express, { type Express } from 'express';
import type { Pool } from 'pg';
import { errorHandler } from './middleware/error-handler.js';
import { createRegistrationRateLimiter } from './middleware/rate-limit.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createRegistrationsRouter } from './routes/registrations.js';
import { createSessionMiddleware } from './session.js';

export function createApp(pool: Pool): Express {
  const app = express();

  if (process.env.NODE_ENV === 'production') {
    // Railway terminates TLS at its proxy; without this, req.secure and the
    // rate limiter's client IP would both read the proxy's own connection.
    app.set('trust proxy', 1);
  }

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? true, credentials: true }));

  // Registered before the session middleware so Railway's health check never
  // depends on the database being reachable.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(express.json());
  app.use(createSessionMiddleware(pool));

  app.use('/api/catalog', createCatalogRouter(pool));
  app.use('/api/registrations', createRegistrationRateLimiter(), createRegistrationsRouter(pool));

  app.use(errorHandler);

  return app;
}
