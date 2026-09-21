import { createHash, timingSafeEqual } from 'node:crypto';
import {
  adminDeleteOutOfWindowSchema,
  adminLoginSchema,
  adminRegistrationFiltersSchema,
  eventSettingsInputSchema,
  type AdminDeleteResult,
} from '@feria/shared';
import { Router, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncHandler } from '../middleware/async-handler.js';
import * as admin from '../services/admin.js';
import { getEvent, replaceEvent } from '../services/event.js';
import { toCsv } from '../utils/csv.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const DEFAULT_LOGIN_ATTEMPTS_PER_MINUTE = 5;

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

// Blank inputs ("?day=") mean "no filter", not an invalid value.
function parseFilters(query: Request['query']) {
  const present = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''));
  return adminRegistrationFiltersSchema.parse(present);
}

// Hashing first gives both sides the same length, which timingSafeEqual requires, and
// keeps the comparison time independent of how much of the key was right.
function keyMatches(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

// An admin browser session ends after this long without any admin request. Each request
// pushes the deadline out again, so an admin who is working is never logged out.
export const ADMIN_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

type AdminAccess = 'session' | 'key' | 'expired' | 'none';

// Browser sessions (after POST /login) or, for scripts, the x-admin-key header.
function checkAdminAccess(req: Request, adminKey: string): AdminAccess {
  const header = req.header('x-admin-key');
  if (header !== undefined && keyMatches(header, adminKey)) return 'key';

  if (req.session.isAdmin !== true) return 'none';

  const now = Date.now();
  if (now - (req.session.adminLastSeen ?? 0) > ADMIN_IDLE_TIMEOUT_MS) {
    // Drop only the admin flag: the rest of the session is the visitor's own draft.
    delete req.session.isAdmin;
    delete req.session.adminLastSeen;
    return 'expired';
  }
  req.session.adminLastSeen = now;
  return 'session';
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export interface AdminRouterOptions {
  loginAttemptsPerMinute?: number;
}

// Not mounted at all when ADMIN_API_KEY isn't set, so the admin data surface
// doesn't exist by accident in an environment nobody meant to expose it in.
export function createAdminRouter(pool: Pool, options: AdminRouterOptions = {}): Router | null {
  const adminKey = config.adminApiKey;
  if (!adminKey) return null;

  const router = Router();

  // A per-IP brake on guessing the key. Created per router so each app (and test) has its own count.
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: options.loginAttemptsPerMinute ?? DEFAULT_LOGIN_ATTEMPTS_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Demasiados intentos, espera un momento.' },
  });

  router.post(
    '/login',
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { key } = adminLoginSchema.parse(req.body);
      if (!keyMatches(key, adminKey)) {
        res.status(401).json({ error: 'invalid_key', message: 'Clave incorrecta.' });
        return;
      }
      // A fresh session id at the moment of privilege change, so an id that was known
      // before logging in (session fixation) is worthless afterwards.
      await regenerateSession(req);
      req.session.isAdmin = true;
      req.session.adminLastSeen = Date.now();
      res.json({ isAdmin: true });
    }),
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      await destroySession(req);
      res.clearCookie('sid');
      res.status(204).end();
    }),
  );

  router.get('/me', (req, res) => {
    const access = checkAdminAccess(req, adminKey);
    res.json({ isAdmin: access === 'session' || access === 'key' });
  });

  const requireAdmin: RequestHandler = (req, res, next) => {
    const access = checkAdminAccess(req, adminKey);
    if (access === 'expired') {
      res.status(401).json({ error: 'session_expired', message: 'Tu sesión de administrador expiró.' });
      return;
    }
    if (access === 'none') {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
  router.use(requireAdmin);

  router.get(
    '/event',
    asyncHandler(async (_req, res) => {
      const event = await getEvent(pool);
      if (!event) {
        res.status(404).json({ error: 'event_not_configured' });
        return;
      }
      res.json(event);
    }),
  );

  router.put(
    '/event',
    asyncHandler(async (req, res) => {
      const input = eventSettingsInputSchema.parse(req.body);
      res.json(await replaceEvent(pool, input));
    }),
  );

  router.get(
    '/registrations',
    asyncHandler(async (req, res) => {
      const { limit, offset } = parsePagination(req.query);
      const filters = parseFilters(req.query);
      const { registrations, total } = await admin.listConfirmedRegistrations(pool, { limit, offset, filters });
      res.json({ registrations, total, limit, offset });
    }),
  );

  router.get(
    '/registrations.csv',
    asyncHandler(async (req, res) => {
      const registrations = await admin.listAllConfirmedRegistrations(pool, parseFilters(req.query));
      const csv = toCsv(
        CSV_HEADERS,
        registrations.map((registration) => [
          registration.confirmationId,
          registration.nombre,
          registration.apellidos,
          registration.email,
          registration.attendAt ?? '',
          registration.items.map((item) => item.name).join('; '),
          String(registration.serviceDiscountPct),
          String(registration.productDiscountPct),
          String(registration.servicesTotal),
          String(registration.productsTotal),
          String(registration.grandTotal),
          registration.confirmedAt,
        ]),
      );
      res
        .type('text/csv')
        .set('Content-Disposition', 'attachment; filename="registros.csv"')
        .send(csv);
    }),
  );

  // Registered before the /:id route so "delete-out-of-window" is never read as an id.
  router.post(
    '/registrations/delete-out-of-window',
    asyncHandler(async (req, res) => {
      const { expectedCount } = adminDeleteOutOfWindowSchema.parse(req.body);
      const result: AdminDeleteResult = { deleted: await admin.deleteOutOfWindowRegistrations(pool, expectedCount) };
      res.json(result);
    }),
  );

  router.delete(
    '/registrations/:id',
    asyncHandler(async (req, res) => {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      if (!(await admin.deleteConfirmedRegistration(pool, id.data))) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(204).end();
    }),
  );

  router.get(
    '/stats',
    asyncHandler(async (_req, res) => {
      res.json(await admin.getStats(pool));
    }),
  );

  return router;
}
