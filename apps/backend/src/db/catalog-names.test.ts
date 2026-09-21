import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPool, resetDb } from '../test/db.js';
import { SEED_ITEMS } from './seed.js';

// What the demo catalog was called before it got real names, in the same order as SEED_ITEMS.
const PLACEHOLDER_NAMES = [
  'Servicio 1 - Diagnóstico inicial',
  'Servicio 2 - Soporte básico',
  'Servicio 3 - Instalación',
  'Servicio 4 - Mantenimiento anual',
  'Servicio 5 - Consultoría premium',
  'Servicio 6 - Capacitación',
  'Producto 1',
  'Producto 2',
  'Producto 3',
  'Producto 4',
  'Producto 5',
  'Producto 6',
  'Producto 7',
];

describe('demo catalog names', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
  });

  it('seeds real names, not numbered placeholders', () => {
    for (const item of SEED_ITEMS) {
      expect(item.name).not.toMatch(/^(Servicio|Producto)\b/);
    }
    expect(new Set(SEED_ITEMS.map((item) => item.name)).size).toBe(SEED_ITEMS.length);
  });

  it('renames a catalog that still has the placeholders to the seeded names, keeping the prices', async () => {
    for (const [index, item] of SEED_ITEMS.entries()) {
      await pool.query('INSERT INTO catalog_items (type, name, price_cents) VALUES ($1, $2, $3)', [
        item.type,
        PLACEHOLDER_NAMES[index],
        item.priceCents,
      ]);
    }

    const migration = await readFile(path.resolve(process.cwd(), 'migrations', '0003_catalog_names.sql'), 'utf8');
    await pool.query(migration);

    const { rows } = await pool.query<{ type: string; name: string; price_cents: number }>(
      'SELECT type, name, price_cents FROM catalog_items ORDER BY price_cents',
    );
    const expected = [...SEED_ITEMS]
      .sort((a, b) => a.priceCents - b.priceCents)
      .map((item) => ({ type: item.type, name: item.name, price_cents: item.priceCents }));
    expect(rows).toEqual(expected);
  });

  it('only renames placeholders and leaves items named by hand alone', async () => {
    await pool.query(
      `INSERT INTO catalog_items (type, name, price_cents) VALUES
       ('service', 'Riego a la medida', 40000),
       ('product', 'Producto 3', 35000)`,
    );

    const migration = await readFile(path.resolve(process.cwd(), 'migrations', '0003_catalog_names.sql'), 'utf8');
    await pool.query(migration);

    const { rows } = await pool.query<{ name: string }>('SELECT name FROM catalog_items ORDER BY price_cents');
    expect(rows.map((row) => row.name)).toEqual(['Kit de riego por goteo', 'Riego a la medida']);
  });
});
