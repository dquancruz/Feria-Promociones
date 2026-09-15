import { Pool } from 'pg';
import { runMigrations } from '../db/migrate.js';

export async function createTestPool(): Promise<Pool> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await runMigrations(pool);
  return pool;
}

export async function resetDb(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE registration_items, registrations, catalog_items RESTART IDENTITY CASCADE');
}
