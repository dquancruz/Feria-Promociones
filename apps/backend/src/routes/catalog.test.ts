import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb } from '../test/db.js';

describe('GET /api/catalog', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
    await pool.query(
      `INSERT INTO catalog_items (type, name, price_cents, active) VALUES
       ('service', 'Servicio 1', 10000, true),
       ('service', 'Servicio Inactivo', 5000, false),
       ('product', 'Producto Especial', 3500, true)`,
    );
  });

  it('returns only active items, services and products together', async () => {
    const response = await request(createApp(pool)).get('/api/catalog');
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.map((item: { name: string }) => item.name).sort()).toEqual([
      'Producto Especial',
      'Servicio 1',
    ]);
  });

  it('filters by a case-insensitive substring match on name', async () => {
    const response = await request(createApp(pool)).get('/api/catalog').query({ search: 'especial' });
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].name).toBe('Producto Especial');
  });
});
