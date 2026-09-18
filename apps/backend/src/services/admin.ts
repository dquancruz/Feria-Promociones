import { calculateDiscounts, type AdminRegistration } from '@feria/shared';
import type { Pool } from 'pg';
import { centsToQuetzales } from '../utils/money.js';

interface RegistrationRow {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  attend_at: Date | null;
  confirmed_at: Date;
}

interface ItemRow {
  registration_id: string;
  catalog_item_id: string;
  name: string;
  type: 'service' | 'product';
  price_cents: number;
}

export async function listConfirmedRegistrations(
  pool: Pool,
  { limit, offset }: { limit: number; offset: number },
): Promise<{ registrations: AdminRegistration[]; total: number }> {
  const [{ rows: registrationRows }, countResult] = await Promise.all([
    pool.query<RegistrationRow>(
      `SELECT id, nombre, apellidos, email, attend_at, confirmed_at
       FROM registrations
       WHERE status = 'confirmed'
       ORDER BY confirmed_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query<{ count: string }>("SELECT COUNT(*) FROM registrations WHERE status = 'confirmed'"),
  ]);

  const registrationIds = registrationRows.map((row) => row.id);
  const itemRows = registrationIds.length
    ? (
        await pool.query<ItemRow>(
          `SELECT ri.registration_id, ri.catalog_item_id, ci.name, ci.type, ri.price_cents_snapshot AS price_cents
           FROM registration_items ri
           JOIN catalog_items ci ON ci.id = ri.catalog_item_id
           WHERE ri.registration_id = ANY($1::uuid[])`,
          [registrationIds],
        )
      ).rows
    : [];

  const itemsByRegistration = new Map<string, ItemRow[]>();
  for (const item of itemRows) {
    const list = itemsByRegistration.get(item.registration_id) ?? [];
    list.push(item);
    itemsByRegistration.set(item.registration_id, list);
  }

  const registrations = registrationRows.map((registration): AdminRegistration => {
    const items = itemsByRegistration.get(registration.id) ?? [];
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
      items: items.map((item) => item.name),
      serviceDiscountPct: totals.serviceDiscountPct,
      productDiscountPct: totals.productDiscountPct,
      servicesTotal: centsToQuetzales(totals.servicesTotalCents),
      productsTotal: centsToQuetzales(totals.productsTotalCents),
      grandTotal: centsToQuetzales(totals.grandTotalCents),
    };
  });

  return { registrations, total: Number(countResult.rows[0].count) };
}
