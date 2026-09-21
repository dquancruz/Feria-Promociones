import { addDays, todayInEventTimezone } from '@feria/shared';
import type { Pool } from 'pg';

export interface SeedItem {
  type: 'service' | 'product';
  name: string;
  priceCents: number;
}

// Prices are invented for the demo; a couple of services sit above Q.750 on purpose so
// two of them together can cross the Q.1,500 services discount threshold live.
export const SEED_ITEMS: SeedItem[] = [
  { type: 'service', name: 'Diagnóstico de suelos', priceCents: 10_000 },
  { type: 'service', name: 'Asesoría agronómica básica', priceCents: 5_030 },
  { type: 'service', name: 'Instalación de sistema de riego', priceCents: 75_000 },
  { type: 'service', name: 'Mantenimiento anual de riego', priceCents: 90_000 },
  { type: 'service', name: 'Consultoría agronómica premium', priceCents: 120_000 },
  { type: 'service', name: 'Capacitación para productores', priceCents: 30_000 },
  { type: 'product', name: 'Semilla de maíz híbrido', priceCents: 4_999 },
  { type: 'product', name: 'Fertilizante 15-15-15', priceCents: 8_050 },
  { type: 'product', name: 'Kit de riego por goteo', priceCents: 35_000 },
  { type: 'product', name: 'Bomba de agua de 1 HP', priceCents: 50_000 },
  { type: 'product', name: 'Insecticida orgánico', priceCents: 12_000 },
  { type: 'product', name: 'Herbicida selectivo', priceCents: 7_525 },
  { type: 'product', name: 'Fungicida sistémico', priceCents: 22_000 },
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

const SAMPLE_EVENT_DAYS = 3;
const SAMPLE_EVENT_LEAD_DAYS = 30;

// Without an event the public form would show "registration closed", so the very first
// start creates a sample one: open, three consecutive days a month from now, 09:00-18:00.
// It is only a starting point for the admin to edit; it is never recreated afterwards.
export async function seedEvent(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('INSERT INTO event_settings (id) VALUES (1) ON CONFLICT DO NOTHING');
    if (rowCount) {
      const firstDay = addDays(todayInEventTimezone(), SAMPLE_EVENT_LEAD_DAYS);
      const days = Array.from({ length: SAMPLE_EVENT_DAYS }, (_, index) => addDays(firstDay, index));
      await client.query(
        `INSERT INTO event_days (day, opens_at, closes_at)
         SELECT day, '09:00', '18:00' FROM unnest($1::date[]) AS day`,
        [days],
      );
      console.log(`No event was configured: created a sample one on ${days.join(', ')}. Edit it from the admin.`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
