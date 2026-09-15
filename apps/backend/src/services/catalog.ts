import type { CatalogItem } from '@feria/shared';
import type { Pool } from 'pg';

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

export async function listCatalog(pool: Pool, search?: string): Promise<CatalogItem[]> {
  const { rows } = await pool.query<CatalogItemRow>(
    `SELECT id, type, name, description, price_cents, active
     FROM catalog_items
     WHERE active = true AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
     ORDER BY type, name`,
    [search ?? null],
  );
  return rows.map(toCatalogItem);
}
