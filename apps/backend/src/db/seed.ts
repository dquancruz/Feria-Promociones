import type { Pool } from 'pg';

interface SeedItem {
  type: 'service' | 'product';
  name: string;
  priceCents: number;
}

// Prices match the wireframe's example figures where it gave them (docs/wireframe-notes.md);
// the rest are invented, and a couple sit above Q.750 so two of them together can cross the
// Q.1,500 services discount threshold in the demo.
const SEED_ITEMS: SeedItem[] = [
  { type: 'service', name: 'Servicio 1 - Diagnóstico inicial', priceCents: 10_000 },
  { type: 'service', name: 'Servicio 2 - Soporte básico', priceCents: 5_030 },
  { type: 'service', name: 'Servicio 3 - Instalación', priceCents: 75_000 },
  { type: 'service', name: 'Servicio 4 - Mantenimiento anual', priceCents: 90_000 },
  { type: 'service', name: 'Servicio 5 - Consultoría premium', priceCents: 120_000 },
  { type: 'service', name: 'Servicio 6 - Capacitación', priceCents: 30_000 },
  { type: 'product', name: 'Producto 1', priceCents: 4_999 },
  { type: 'product', name: 'Producto 2', priceCents: 8_050 },
  { type: 'product', name: 'Producto 3', priceCents: 35_000 },
  { type: 'product', name: 'Producto 4', priceCents: 50_000 },
  { type: 'product', name: 'Producto 5', priceCents: 12_000 },
  { type: 'product', name: 'Producto 6', priceCents: 7_525 },
  { type: 'product', name: 'Producto 7', priceCents: 22_000 },
];

export async function seedCatalog(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text FROM catalog_items');
  if (Number(rows[0].count) > 0) return;

  for (const item of SEED_ITEMS) {
    await pool.query('INSERT INTO catalog_items (type, name, price_cents) VALUES ($1, $2, $3)', [
      item.type,
      item.name,
      item.priceCents,
    ]);
  }
}
