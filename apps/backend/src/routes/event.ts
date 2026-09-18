import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/async-handler.js';
import { getPublicEvent } from '../services/event.js';

export function createEventRouter(pool: Pool): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const event = await getPublicEvent(pool);
      if (!event) {
        res.status(404).json({ error: 'event_not_configured' });
        return;
      }
      res.json(event);
    }),
  );

  return router;
}
