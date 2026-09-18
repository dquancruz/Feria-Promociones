import {
  calculateDiscounts,
  isWithinEvent,
  type RegistrationConfirmation,
  type RegistrationDraft,
  type RegistrationDraftUpdate,
} from '@feria/shared';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { RegistrationClosedError, ValidationError } from '../errors.js';
import { centsToQuetzales } from '../utils/money.js';
import { getEvent } from './event.js';

type Queryable = Pool | PoolClient;

export interface RegistrationRow {
  id: string;
  session_id: string;
  status: 'draft' | 'confirmed';
  nombre: string;
  apellidos: string;
  email: string;
  attend_at: Date | null;
  service_discount_pct: string;
  product_discount_pct: string;
  created_at: Date;
  confirmed_at: Date | null;
}

interface SelectedItem {
  id: string;
  name: string;
  type: 'service' | 'product';
  priceCents: number;
}

// Read-only: a visitor who has not saved anything yet has no row, so merely opening the
// form (or a bot hitting GET /draft) never writes to the database.
export async function findRegistration(pool: Pool, sessionId: string): Promise<RegistrationRow | null> {
  const { rows } = await pool.query<RegistrationRow>('SELECT * FROM registrations WHERE session_id = $1', [
    sessionId,
  ]);
  return rows[0] ?? null;
}

// Does this autosave carry anything worth a database row? The form sends its whole state
// on every save, so a pristine form arrives as empty strings and no selection.
export function patchHasData(patch: RegistrationDraftUpdate): boolean {
  return Boolean(
    patch.nombre?.trim() ||
      patch.apellidos?.trim() ||
      patch.email?.trim() ||
      patch.attendAt ||
      patch.selectedItemIds?.length,
  );
}

export const EMPTY_DRAFT: RegistrationDraft = {
  status: 'draft',
  nombre: '',
  apellidos: '',
  email: '',
  attendAt: null,
  selectedItemIds: [],
};

const STALE_DRAFT_DAYS = 7;

// Drafts nobody came back to. Confirmed registrations are business data and are never touched.
export async function deleteStaleDrafts(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM registrations
     WHERE status = 'draft' AND created_at < now() - make_interval(days => $1)`,
    [STALE_DRAFT_DAYS],
  );
  return rowCount ?? 0;
}

export async function getOrCreateDraft(pool: Pool, sessionId: string): Promise<RegistrationRow> {
  const { rows } = await pool.query<RegistrationRow>(
    `INSERT INTO registrations (session_id) VALUES ($1)
     ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id
     RETURNING *`,
    [sessionId],
  );
  return rows[0];
}

export async function getSelectedItems(db: Queryable, registrationId: string): Promise<SelectedItem[]> {
  const { rows } = await db.query<{ id: string; name: string; type: 'service' | 'product'; price_cents: number }>(
    `SELECT ci.id, ci.name, ci.type, ri.price_cents_snapshot AS price_cents
     FROM registration_items ri
     JOIN catalog_items ci ON ci.id = ri.catalog_item_id
     WHERE ri.registration_id = $1
     ORDER BY ci.type, ci.name`,
    [registrationId],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, type: row.type, priceCents: row.price_cents }));
}

export async function updateDraft(
  pool: Pool,
  registrationId: string,
  patch: RegistrationDraftUpdate,
): Promise<RegistrationRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Autosave and the confirm click can overlap for the same session. The row lock
    // serializes them, so two DELETE + INSERT cycles never interleave.
    const {
      rows: [current],
    } = await client.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [
      registrationId,
    ]);
    if (current.status === 'confirmed') {
      // A confirm won the race: leave the confirmed data as it is.
      await client.query('COMMIT');
      return current;
    }

    const setFields: string[] = [];
    const values: unknown[] = [];
    if (patch.nombre !== undefined) {
      values.push(patch.nombre);
      setFields.push(`nombre = $${values.length}`);
    }
    if (patch.apellidos !== undefined) {
      values.push(patch.apellidos);
      setFields.push(`apellidos = $${values.length}`);
    }
    if (patch.email !== undefined) {
      values.push(patch.email);
      setFields.push(`email = $${values.length}`);
    }
    if (patch.attendAt !== undefined) {
      values.push(patch.attendAt);
      setFields.push(`attend_at = $${values.length}`);
    }

    if (setFields.length > 0) {
      values.push(registrationId);
      await client.query(`UPDATE registrations SET ${setFields.join(', ')} WHERE id = $${values.length}`, values);
    }

    if (patch.selectedItemIds !== undefined) {
      await client.query('DELETE FROM registration_items WHERE registration_id = $1', [registrationId]);

      if (patch.selectedItemIds.length > 0) {
        await client.query(
          `INSERT INTO registration_items (registration_id, catalog_item_id, price_cents_snapshot)
           SELECT $1, id, price_cents FROM catalog_items WHERE id = ANY($2::uuid[]) AND active = true
           ON CONFLICT DO NOTHING`,
          [registrationId, patch.selectedItemIds],
        );
      }
    }

    const { rows } = await client.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1', [
      registrationId,
    ]);
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmDraft(
  pool: Pool,
  registrationId: string,
): Promise<{ registration: RegistrationRow; alreadyConfirmed: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      rows: [registration],
    } = await client.query<RegistrationRow>('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [
      registrationId,
    ]);

    // The row lock above serializes concurrent confirms of the same registration (e.g. a
    // double-click) — the second request to reach here re-reads status='confirmed' and
    // short-circuits here instead of re-running (and re-timestamping) the confirmation.
    if (registration.status === 'confirmed') {
      await client.query('COMMIT');
      return { registration, alreadyConfirmed: true };
    }

    const event = await getEvent(client);
    if (!event?.registrationOpen) throw new RegistrationClosedError();

    // Items deactivated since they were picked no longer count. Removing them here (rather
    // than only ignoring them in the calculation) keeps the stored discount, the
    // confirmation screen and the admin view describing the same selection.
    await client.query(
      `DELETE FROM registration_items ri
       WHERE ri.registration_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM catalog_items ci WHERE ci.id = ri.catalog_item_id AND ci.active = true
         )`,
      [registrationId],
    );

    // Re-read current catalog prices rather than trusting whatever was snapshotted
    // during earlier drafting — this is the authoritative recalculation the client can't tamper with.
    const { rows: currentItems } = await client.query<{
      id: string;
      type: 'service' | 'product';
      price_cents: number;
    }>(
      `SELECT ci.id, ci.type, ci.price_cents
       FROM registration_items ri
       JOIN catalog_items ci ON ci.id = ri.catalog_item_id
       WHERE ri.registration_id = $1`,
      [registrationId],
    );

    const fieldErrors: Record<string, string> = {};
    if (!registration.nombre.trim()) fieldErrors.nombre = 'Nombre es requerido';
    if (!registration.apellidos.trim()) fieldErrors.apellidos = 'Apellidos son requeridos';
    const emailIsValid = z.string().email().safeParse(registration.email).success;
    if (!emailIsValid) fieldErrors.email = 'Email inválido';
    if (!registration.attend_at) fieldErrors.attendAt = 'Fecha y hora son requeridas';
    else if (registration.attend_at.getTime() <= Date.now()) fieldErrors.attendAt = 'La fecha debe ser futura';
    else if (!isWithinEvent(registration.attend_at, event)) {
      fieldErrors.attendAt = 'Elige un día y una hora dentro del horario de la feria.';
    }
    if (currentItems.length === 0) {
      fieldErrors.selectedItemIds = 'Selecciona al menos un servicio o producto';
    }

    if (emailIsValid) {
      // Deliberately a lock plus a lookup instead of a unique index: a unique index would
      // fail its migration if the database already holds duplicates. The advisory lock makes
      // two simultaneous confirmations for the same email queue up, so the second one sees
      // the first one's committed row.
      await client.query('SELECT pg_advisory_xact_lock(hashtext(lower($1::text)))', [registration.email]);
      const { rowCount } = await client.query(
        `SELECT 1 FROM registrations
         WHERE status = 'confirmed' AND lower(email) = lower($1::text) AND id <> $2`,
        [registration.email, registrationId],
      );
      if (rowCount) fieldErrors.email = 'Este email ya tiene una asistencia confirmada.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError(fieldErrors);
    }

    await client.query(
      `UPDATE registration_items ri
       SET price_cents_snapshot = ci.price_cents
       FROM catalog_items ci
       WHERE ri.registration_id = $1 AND ci.id = ri.catalog_item_id`,
      [registrationId],
    );

    const totals = calculateDiscounts({
      selectedServices: currentItems
        .filter((item) => item.type === 'service')
        .map((item) => ({ id: item.id, priceCents: item.price_cents })),
      selectedProducts: currentItems
        .filter((item) => item.type === 'product')
        .map((item) => ({ id: item.id, priceCents: item.price_cents })),
    });

    const {
      rows: [confirmed],
    } = await client.query<RegistrationRow>(
      `UPDATE registrations
       SET status = 'confirmed', service_discount_pct = $1, product_discount_pct = $2, confirmed_at = now()
       WHERE id = $3
       RETURNING *`,
      [totals.serviceDiscountPct, totals.productDiscountPct, registrationId],
    );

    await client.query('COMMIT');
    return { registration: confirmed, alreadyConfirmed: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function toDraftResponse(registration: RegistrationRow, selectedItemIds: string[]): RegistrationDraft {
  return {
    status: 'draft',
    nombre: registration.nombre,
    apellidos: registration.apellidos,
    email: registration.email,
    attendAt: registration.attend_at ? registration.attend_at.toISOString() : null,
    selectedItemIds,
  };
}

export async function buildConfirmationResponse(
  db: Queryable,
  registration: RegistrationRow,
): Promise<RegistrationConfirmation> {
  const items = await getSelectedItems(db, registration.id);
  const totals = calculateDiscounts({
    selectedServices: items.filter((item) => item.type === 'service'),
    selectedProducts: items.filter((item) => item.type === 'product'),
  });

  return {
    status: 'confirmed',
    confirmationId: registration.id,
    // The percentages recorded at confirmation are the source of truth; the totals are
    // derived from the same (already cleaned) item list.
    serviceDiscountPct: Number(registration.service_discount_pct),
    productDiscountPct: Number(registration.product_discount_pct),
    servicesTotal: centsToQuetzales(totals.servicesTotalCents),
    productsTotal: centsToQuetzales(totals.productsTotalCents),
    grandTotal: centsToQuetzales(totals.grandTotalCents),
    nombre: registration.nombre,
    apellidos: registration.apellidos,
    attendAt: registration.attend_at ? registration.attend_at.toISOString() : null,
    items,
    servicesSubtotal: centsToQuetzales(totals.servicesSubtotalCents),
    productsSubtotal: centsToQuetzales(totals.productsSubtotalCents),
    subtotal: centsToQuetzales(totals.servicesSubtotalCents + totals.productsSubtotalCents),
    servicesSavings: centsToQuetzales(totals.servicesSubtotalCents - totals.servicesTotalCents),
    productsSavings: centsToQuetzales(totals.productsSubtotalCents - totals.productsTotalCents),
    savings: centsToQuetzales(
      totals.servicesSubtotalCents + totals.productsSubtotalCents - totals.grandTotalCents,
    ),
  };
}
