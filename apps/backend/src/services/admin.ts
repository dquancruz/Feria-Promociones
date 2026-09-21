import {
  EVENT_TIMEZONE,
  calculateDiscounts,
  normalizeSearchText,
  type AdminRegistration,
  type AdminRegistrationFilters,
  type AdminRegistrationItem,
  type AdminStats,
} from '@feria/shared';
import type { Pool } from 'pg';
import { centsToQuetzales } from '../utils/money.js';
import { ConflictError } from '../errors.js';
import { countOutOfWindowRegistrations, outOfWindowSql } from './event.js';

interface RegistrationRow {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  attend_at: Date | null;
  confirmed_at: Date;
  out_of_window: boolean;
}

interface ItemRow {
  registration_id: string;
  catalog_item_id: string;
  name: string;
  type: 'service' | 'product';
  price_cents: number;
}

const LOCAL_ATTEND_DAY = `(attend_at AT TIME ZONE '${EVENT_TIMEZONE}')::date`;

// Newest first. The filters are resolved to a list of ids before paging so the total
// is exact and the free-text search can ignore accents without needing the unaccent
// extension: the admin only ever deals with the people confirmed for one fair.
async function findMatchingIds(pool: Pool, { q, day }: AdminRegistrationFilters): Promise<string[]> {
  const { rows } = await pool.query<{ id: string; nombre: string; apellidos: string; email: string }>(
    `SELECT id, nombre, apellidos, email
     FROM registrations
     WHERE status = 'confirmed' AND ($1::date IS NULL OR ${LOCAL_ATTEND_DAY} = $1::date)
     ORDER BY confirmed_at DESC, id`,
    [day ?? null],
  );

  const needle = q ? normalizeSearchText(q) : '';
  if (!needle) return rows.map((row) => row.id);

  return rows
    .filter((row) => normalizeSearchText(`${row.nombre} ${row.apellidos} ${row.email}`).includes(needle))
    .map((row) => row.id);
}

async function loadRegistrations(pool: Pool, ids: string[]): Promise<AdminRegistration[]> {
  if (ids.length === 0) return [];

  const [{ rows: registrationRows }, { rows: itemRows }] = await Promise.all([
    pool.query<RegistrationRow>(
      `SELECT r.id, r.nombre, r.apellidos, r.email, r.attend_at, r.confirmed_at,
              ${outOfWindowSql('r')} AS out_of_window
       FROM registrations r
       WHERE r.id = ANY($1::uuid[])`,
      [ids],
    ),
    pool.query<ItemRow>(
      `SELECT ri.registration_id, ri.catalog_item_id, ci.name, ci.type, ri.price_cents_snapshot AS price_cents
       FROM registration_items ri
       JOIN catalog_items ci ON ci.id = ri.catalog_item_id
       WHERE ri.registration_id = ANY($1::uuid[])
       ORDER BY ci.type, ci.name`,
      [ids],
    ),
  ]);

  const rowsById = new Map(registrationRows.map((row) => [row.id, row]));
  const itemsByRegistration = new Map<string, ItemRow[]>();
  for (const item of itemRows) {
    const list = itemsByRegistration.get(item.registration_id) ?? [];
    list.push(item);
    itemsByRegistration.set(item.registration_id, list);
  }

  return ids.map((id): AdminRegistration => {
    const registration = rowsById.get(id)!;
    const items = itemsByRegistration.get(id) ?? [];
    const totals = calculateDiscounts({
      selectedServices: items
        .filter((item) => item.type === 'service')
        .map((item) => ({ id: item.catalog_item_id, priceCents: item.price_cents })),
      selectedProducts: items
        .filter((item) => item.type === 'product')
        .map((item) => ({ id: item.catalog_item_id, priceCents: item.price_cents })),
    });

    return {
      confirmationId: registration.id,
      nombre: registration.nombre,
      apellidos: registration.apellidos,
      email: registration.email,
      attendAt: registration.attend_at ? registration.attend_at.toISOString() : null,
      confirmedAt: registration.confirmed_at.toISOString(),
      outOfWindow: registration.out_of_window,
      items: items.map((item): AdminRegistrationItem => ({
        name: item.name,
        type: item.type,
        priceCents: item.price_cents,
      })),
      serviceDiscountPct: totals.serviceDiscountPct,
      productDiscountPct: totals.productDiscountPct,
      servicesTotal: centsToQuetzales(totals.servicesTotalCents),
      productsTotal: centsToQuetzales(totals.productsTotalCents),
      grandTotal: centsToQuetzales(totals.grandTotalCents),
    };
  });
}

export async function listConfirmedRegistrations(
  pool: Pool,
  { limit, offset, filters }: { limit: number; offset: number; filters: AdminRegistrationFilters },
): Promise<{ registrations: AdminRegistration[]; total: number }> {
  const ids = await findMatchingIds(pool, filters);
  const registrations = await loadRegistrations(pool, ids.slice(offset, offset + limit));
  return { registrations, total: ids.length };
}

const EXPORT_CHUNK_SIZE = 500;

// Every matching registration, loaded in chunks so an export is never silently cut off at
// the API's per-request page limit and never asks Postgres for thousands of ids at once.
export async function listAllConfirmedRegistrations(
  pool: Pool,
  filters: AdminRegistrationFilters,
): Promise<AdminRegistration[]> {
  const ids = await findMatchingIds(pool, filters);
  const all: AdminRegistration[] = [];
  for (let start = 0; start < ids.length; start += EXPORT_CHUNK_SIZE) {
    all.push(...(await loadRegistrations(pool, ids.slice(start, start + EXPORT_CHUNK_SIZE))));
  }
  return all;
}

const TOP_ITEMS_LIMIT = 5;

export async function getStats(pool: Pool): Promise<AdminStats> {
  const [confirmed, byDay, topItems, drafts, outOfWindowCount] = await Promise.all([
    pool.query<{ count: string }>("SELECT count(*)::text AS count FROM registrations WHERE status = 'confirmed'"),
    pool.query<{ date: string; count: string }>(
      `SELECT to_char(${LOCAL_ATTEND_DAY}, 'YYYY-MM-DD') AS date, count(*)::text AS count
       FROM registrations
       WHERE status = 'confirmed' AND attend_at IS NOT NULL
       GROUP BY 1
       ORDER BY 1`,
    ),
    pool.query<{ name: string; type: 'service' | 'product'; count: string }>(
      `SELECT ci.name, ci.type, count(*)::text AS count
       FROM registration_items ri
       JOIN registrations r ON r.id = ri.registration_id AND r.status = 'confirmed'
       JOIN catalog_items ci ON ci.id = ri.catalog_item_id
       GROUP BY ci.id, ci.name, ci.type
       ORDER BY count(*) DESC, ci.name
       LIMIT $1`,
      [TOP_ITEMS_LIMIT],
    ),
    pool.query<{ count: string }>("SELECT count(*)::text AS count FROM registrations WHERE status = 'draft'"),
    countOutOfWindowRegistrations(pool),
  ]);

  return {
    confirmedTotal: Number(confirmed.rows[0].count),
    byDay: byDay.rows.map((row) => ({ date: row.date, count: Number(row.count) })),
    topItems: topItems.rows.map((row) => ({ name: row.name, type: row.type, count: Number(row.count) })),
    draftsStarted: Number(drafts.rows[0].count),
    outOfWindowCount,
  };
}

// Only confirmed registrations: a draft is somebody's form in progress, and it is not listed
// in the admin, so it must not be reachable by id from here either. The items go with it.
export async function deleteConfirmedRegistration(pool: Pool, id: string): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM registrations WHERE id = $1 AND status = 'confirmed'", [id]);
  return rowCount === 1;
}

// Deletes the confirmed registrations whose visit is outside the event dates, but only if
// there are exactly as many as the admin was told. Otherwise nothing is deleted.
export async function deleteOutOfWindowRegistrations(pool: Pool, expectedCount: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `DELETE FROM registrations r WHERE r.status = 'confirmed' AND ${outOfWindowSql('r')}`,
    );
    const deleted = rowCount ?? 0;
    if (deleted !== expectedCount) throw new ConflictError('count_changed', deleted);
    await client.query('COMMIT');
    return deleted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
