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
