import { normalizeSearchText, type CatalogItem } from '@feria/shared';
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
