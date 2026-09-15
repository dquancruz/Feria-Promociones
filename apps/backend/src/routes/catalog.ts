import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/async-handler.js';
import * as catalog from '../services/catalog.js';

export function createCatalogRouter(pool: Pool): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const items = await catalog.listCatalog(pool, search);
      res.json({ items });
    }),
  );

  return router;
}
