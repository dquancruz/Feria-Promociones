import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws a clear error when SESSION_SECRET is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.CORS_ORIGIN = 'https://example.com';
    delete process.env.SESSION_SECRET;

    await expect(import('./config.js')).rejects.toThrow('SESSION_SECRET');
  });

  it('does not require CORS_ORIGIN in production, since the API is same-origin', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.SESSION_SECRET = 'a-real-secret';
    delete process.env.CORS_ORIGIN;

    const { config } = await import('./config.js');

    expect(config.isProduction).toBe(true);
    expect(config.corsOrigin).toBeUndefined();
  });

  it('trusts one proxy hop by default and lets TRUST_PROXY_HOPS override it', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    expect((await import('./config.js')).config.trustProxyHops).toBe(1);

    vi.resetModules();
    process.env.TRUST_PROXY_HOPS = '2';
    expect((await import('./config.js')).config.trustProxyHops).toBe(2);
  });

  it('rejects a TRUST_PROXY_HOPS that is not a number', async () => {
    process.env.TRUST_PROXY_HOPS = 'many';

    await expect(import('./config.js')).rejects.toThrow('TRUST_PROXY_HOPS');
  });

  it('falls back to development defaults when nothing is set outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    delete process.env.SESSION_SECRET;
    delete process.env.CORS_ORIGIN;

    const { config } = await import('./config.js');

    expect(config.isProduction).toBe(false);
    expect(config.sessionSecret).toBe('dev-secret');
    expect(config.corsOrigin).toBeUndefined();
  });
});
