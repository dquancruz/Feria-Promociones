import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb, setTestEvent, testAttendAt } from '../test/db.js';

const ADMIN_KEY = 'test-admin-key';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('admin catalog management', () => {
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

  const api = () => request(createApp(pool));
  const asAdmin = (req: request.Test) => req.set('x-admin-key', ADMIN_KEY);

  async function create(body: object = { type: 'product', name: 'Abono orgánico', priceCents: 15000 }) {
    return asAdmin(api().post('/api/admin/catalog')).send(body);
  }

  it('rejects every catalog route without admin access', async () => {
    expect((await api().get('/api/admin/catalog')).status).toBe(401);
    expect((await api().post('/api/admin/catalog').send({})).status).toBe(401);
    expect((await api().patch(`/api/admin/catalog/${MISSING_ID}`).send({ active: false })).status).toBe(401);
    expect((await api().delete(`/api/admin/catalog/${MISSING_ID}`)).status).toBe(401);
  });

  it('creates an item that shows up in the public catalog', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'product', name: 'Abono orgánico', priceCents: 15000, active: true });

    const publicCatalog = await api().get('/api/catalog');
    expect(publicCatalog.body.items.map((item: { name: string }) => item.name)).toContain('Abono orgánico');
  });

  it('validates the input', async () => {
    const res = await create({ type: 'gadget', name: '  ', priceCents: -5.5 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fieldErrors).sort()).toEqual(['name', 'priceCents', 'type']);
  });

  it('updates only the fields that were sent', async () => {
    const { id } = (await create()).body;
    const res = await asAdmin(api().patch(`/api/admin/catalog/${id}`)).send({ priceCents: 18000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Abono orgánico', priceCents: 18000, active: true });
  });

  it('rejects a repeated name on create and on rename, ignoring case and spaces', async () => {
    await create({ type: 'product', name: 'Abono orgánico', priceCents: 15000 });

    const duplicate = await create({ type: 'service', name: '  ABONO ORGÁNICO ', priceCents: 100 });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.fieldErrors.name).toBeDefined();

    const { id } = (await create({ type: 'product', name: 'Otro', priceCents: 100 })).body;
    const rename = await asAdmin(api().patch(`/api/admin/catalog/${id}`)).send({ name: 'abono orgánico' });
    expect(rename.status).toBe(400);

    const samePatch = await asAdmin(api().patch(`/api/admin/catalog/${id}`)).send({ name: 'Otro', priceCents: 200 });
    expect(samePatch.status).toBe(200);
  });

  it('rejects an empty update and an unknown id', async () => {
    const { id } = (await create()).body;
    expect((await asAdmin(api().patch(`/api/admin/catalog/${id}`)).send({})).status).toBe(400);
    expect((await asAdmin(api().patch(`/api/admin/catalog/${MISSING_ID}`)).send({ active: false })).status).toBe(404);
    expect((await asAdmin(api().patch('/api/admin/catalog/not-a-uuid')).send({ active: false })).status).toBe(400);
  });

  it('retires an item on DELETE: hidden from the public catalog, still listed for the admin, and restorable', async () => {
    const { id } = (await create()).body;

    const del = await asAdmin(api().delete(`/api/admin/catalog/${id}`));
    expect(del.status).toBe(200);
    expect(del.body.active).toBe(false);

    const publicCatalog = await api().get('/api/catalog');
    expect(publicCatalog.body.items).toHaveLength(0);

    const adminList = await asAdmin(api().get('/api/admin/catalog'));
    expect(adminList.body.items).toHaveLength(1);
    expect(adminList.body.items[0].active).toBe(false);

    const restored = await asAdmin(api().patch(`/api/admin/catalog/${id}`)).send({ active: true });
    expect(restored.body.active).toBe(true);
    expect((await api().get('/api/catalog')).body.items).toHaveLength(1);
  });

  it('keeps the price a client confirmed with when the price changes later', async () => {
    await setTestEvent(pool);
    const { id } = (await create({ type: 'service', name: 'Diagnóstico', priceCents: 10000 })).body;

    const agent = request.agent(createApp(pool));
    const draft = {
      nombre: 'Ana',
      apellidos: 'López',
      email: 'ana@example.com',
      attendAt: testAttendAt(),
      selectedItemIds: [id],
    };
    expect((await agent.patch('/api/registrations/draft').send(draft)).status).toBe(200);
    const confirmed = await agent.post('/api/registrations/confirm');
    expect(confirmed.status).toBe(200);

    await asAdmin(api().patch(`/api/admin/catalog/${id}`)).send({ priceCents: 99900 });

    const { rows } = await pool.query<{ price_cents_snapshot: number }>(
      'SELECT price_cents_snapshot FROM registration_items WHERE catalog_item_id = $1',
      [id],
    );
    expect(rows[0].price_cents_snapshot).toBe(10000);
  });
});
