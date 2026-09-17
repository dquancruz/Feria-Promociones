import { Pool } from 'pg';

const isProduction = process.env.NODE_ENV === 'production';

export function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    // Railway's managed Postgres requires TLS from outside its private network, but
    // signs with a cert chain `pg` doesn't have in its trust store — this matches
    // Railway's own documented connection settings for that case.
    ssl: isProduction ? { rejectUnauthorized: false } : undefined,
  });
}
