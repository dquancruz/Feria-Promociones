import {
  calculateDiscounts,
  type RegistrationConfirmation,
  type RegistrationDraft,
  type RegistrationDraftUpdate,
} from '@feria/shared';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ValidationError } from '../errors.js';
import { centsToQuetzales } from '../utils/money.js';

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
  type: 'service' | 'product';
  priceCents: number;
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
  const { rows } = await db.query<{ id: string; type: 'service' | 'product'; price_cents: number }>(
    `SELECT ci.id, ci.type, ri.price_cents_snapshot AS price_cents
     FROM registration_items ri
     JOIN catalog_items ci ON ci.id = ri.catalog_item_id
     WHERE ri.registration_id = $1`,
    [registrationId],
  );
  return rows.map((row) => ({ id: row.id, type: row.type, priceCents: row.price_cents }));
}

export async function updateDraft(
  pool: Pool,
  registrationId: string,
  patch: RegistrationDraftUpdate,
): Promise<RegistrationRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
        const { rows: catalogRows } = await client.query<{ id: string; price_cents: number }>(
          'SELECT id, price_cents FROM catalog_items WHERE id = ANY($1::uuid[]) AND active = true',
          [patch.selectedItemIds],
        );
        for (const row of catalogRows) {
          await client.query(
            'INSERT INTO registration_items (registration_id, catalog_item_id, price_cents_snapshot) VALUES ($1, $2, $3)',
            [registrationId, row.id, row.price_cents],
          );
        }
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

    const { rows: selectedIds } = await client.query<{ catalog_item_id: string }>(
      'SELECT catalog_item_id FROM registration_items WHERE registration_id = $1',
      [registrationId],
    );
    // Re-read current, active catalog prices rather than trusting whatever was snapshotted
    // during earlier drafting — this is the authoritative recalculation the client can't tamper with.
    const { rows: currentItems } = await client.query<{
      id: string;
      type: 'service' | 'product';
      price_cents: number;
    }>('SELECT id, type, price_cents FROM catalog_items WHERE id = ANY($1::uuid[]) AND active = true', [
      selectedIds.map((row) => row.catalog_item_id),
    ]);

    const fieldErrors: Record<string, string> = {};
    if (!registration.nombre.trim()) fieldErrors.nombre = 'Nombre es requerido';
    if (!registration.apellidos.trim()) fieldErrors.apellidos = 'Apellidos son requeridos';
    if (!z.string().email().safeParse(registration.email).success) fieldErrors.email = 'Email inválido';
    if (!registration.attend_at) fieldErrors.attendAt = 'Fecha y hora son requeridas';
    if (currentItems.length === 0) {
      fieldErrors.selectedItemIds = 'Selecciona al menos un servicio o producto';
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError(fieldErrors);
    }

    for (const item of currentItems) {
      await client.query(
        'UPDATE registration_items SET price_cents_snapshot = $1 WHERE registration_id = $2 AND catalog_item_id = $3',
        [item.price_cents, registrationId, item.id],
      );
    }

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
    serviceDiscountPct: totals.serviceDiscountPct,
    productDiscountPct: totals.productDiscountPct,
    servicesTotal: centsToQuetzales(totals.servicesTotalCents),
    productsTotal: centsToQuetzales(totals.productsTotalCents),
    grandTotal: centsToQuetzales(totals.grandTotalCents),
  };
}
