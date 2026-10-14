import { normalizeSearchText, type CatalogItem, type CatalogItemInput, type CatalogItemUpdate } from '@feria/shared';
import type { Pool } from 'pg';
import { ValidationError } from '../errors.js';

interface CatalogItemRow {
  id: string;
  type: 'service' | 'product';
  name: string;
  description: string | null;
  price_cents: number;
  active: boolean;
}

function toCatalogItem(row: CatalogItemRow): CatalogItem {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    active: row.active,
  };
}

// The catalog is small, so filtering happens here on the full list instead of in SQL:
// that makes matching accent-insensitive without the unaccent extension and means
// characters like % and _ are just text, not LIKE wildcards.
export async function listCatalog(pool: Pool, search?: string): Promise<CatalogItem[]> {
  const { rows } = await pool.query<CatalogItemRow>(
    `SELECT id, type, name, description, price_cents, active
     FROM catalog_items
     WHERE active = true
     ORDER BY type, name`,
  );
  const items = rows.map(toCatalogItem);

  const needle = normalizeSearchText(search ?? '');
  if (!needle) return items;
  return items.filter((item) => normalizeSearchText(item.name).includes(needle));
}

const UNIQUE_VIOLATION = '23505';

// catalog_items_name_unique_idx rejects a repeated name; surface it as a normal field error.
function rethrowDuplicateName(err: unknown): never {
  if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
    throw new ValidationError({ name: 'Ya existe un ítem con ese nombre' });
  }
  throw err;
}

// Admin view: retired items included, so they can be brought back.
export async function listAllCatalog(pool: Pool): Promise<CatalogItem[]> {
  const { rows } = await pool.query<CatalogItemRow>(
    `SELECT id, type, name, description, price_cents, active
     FROM catalog_items
     ORDER BY active DESC, type, name`,
  );
  return rows.map(toCatalogItem);
}

export async function createCatalogItem(pool: Pool, input: CatalogItemInput): Promise<CatalogItem> {
  try {
    const { rows } = await pool.query<CatalogItemRow>(
      `INSERT INTO catalog_items (type, name, price_cents)
       VALUES ($1, $2, $3)
       RETURNING id, type, name, description, price_cents, active`,
      [input.type, input.name, input.priceCents],
    );
    return toCatalogItem(rows[0]);
  } catch (err) {
    return rethrowDuplicateName(err);
  }
}

// Retiring an item is `active = false` rather than a DELETE: confirmed registrations point at
// catalog_items, and they keep the price they were confirmed with (price_cents_snapshot).
// Returns null when no item has that id.
export async function updateCatalogItem(
  pool: Pool,
  id: string,
  update: CatalogItemUpdate,
): Promise<CatalogItem | null> {
  try {
    const { rows } = await pool.query<CatalogItemRow>(
      `UPDATE catalog_items
       SET type = COALESCE($2, type),
           name = COALESCE($3, name),
           price_cents = COALESCE($4, price_cents),
           active = COALESCE($5, active)
       WHERE id = $1
       RETURNING id, type, name, description, price_cents, active`,
      [id, update.type ?? null, update.name ?? null, update.priceCents ?? null, update.active ?? null],
    );
    return rows[0] ? toCatalogItem(rows[0]) : null;
  } catch (err) {
    return rethrowDuplicateName(err);
  }
}
