import { Router } from 'express';
import type { Pool } from 'pg';
import { config } from '../config.js';
import { asyncHandler } from '../middleware/async-handler.js';
import * as admin from '../services/admin.js';
import { toCsv } from '../utils/csv.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const CSV_HEADERS = [
  'confirmationId',
  'nombre',
  'apellidos',
  'email',
  'attendAt',
  'items',
  'serviceDiscountPct',
  'productDiscountPct',
  'servicesTotal',
  'productsTotal',
  'grandTotal',
  'confirmedAt',
];

function parsePagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  return { limit, offset };
}

// Not mounted at all when ADMIN_API_KEY isn't set, so the admin data surface
// doesn't exist by accident in an environment nobody meant to expose it in.
export function createAdminRouter(pool: Pool): Router | null {
  if (!config.adminApiKey) return null;

  const router = Router();

  router.use((req, res, next) => {
    if (req.header('x-admin-key') !== config.adminApiKey) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });

  router.get(
    '/registrations',
    asyncHandler(async (req, res) => {
      const { limit, offset } = parsePagination(req.query);
      const { registrations, total } = await admin.listConfirmedRegistrations(pool, { limit, offset });
      res.json({ registrations, total, limit, offset });
    }),
  );

  router.get(
    '/registrations.csv',
    asyncHandler(async (_req, res) => {
      const registrations = await admin.listAllConfirmedRegistrations(pool);
      const csv = toCsv(
        CSV_HEADERS,
        registrations.map((registration) => [
          registration.confirmationId,
          registration.nombre,
          registration.apellidos,
          registration.email,
          registration.attendAt ?? '',
          registration.items.join('; '),
          String(registration.serviceDiscountPct),
          String(registration.productDiscountPct),
          String(registration.servicesTotal),
          String(registration.productsTotal),
          String(registration.grandTotal),
          registration.confirmedAt,
        ]),
      );
      res.type('text/csv').send(csv);
    }),
  );

  return router;
}
