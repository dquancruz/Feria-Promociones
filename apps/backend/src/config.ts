import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

// Falling back silently to a dev secret is fine on a laptop, but doing that in
// production means the deploy "works" while being misconfigured in a way nobody
// notices until it's a security incident — so those are required there.
const requiredInProduction = isProduction ? z.string().min(1) : z.string().min(1).optional();

const envSchema = z.object({
  DATABASE_URL: requiredInProduction,
  SESSION_SECRET: requiredInProduction,
  // Only needed when a browser app on another origin calls the API directly. The
  // bundled frontend proxies /api, so it is same-origin and needs no CORS.
  CORS_ORIGIN: z.string().min(1).optional(),
  // Optional in every environment: the admin router simply doesn't mount without it.
  ADMIN_API_KEY: z.string().min(1).optional(),
  PORT: z.string().optional(),
  // How many reverse proxies sit in front of the backend (only applied in production).
  TRUST_PROXY_HOPS: z
    .string()
    .regex(/^\d+$/, 'must be a non-negative integer')
    .optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const invalid = result.error.issues.map((issue) => issue.path.join('.'));
  throw new Error(`Missing or invalid environment variables: ${invalid.join(', ')}`);
}

export const config = {
  isProduction,
  port: Number(result.data.PORT ?? 4000),
  databaseUrl: result.data.DATABASE_URL,
  sessionSecret: result.data.SESSION_SECRET ?? 'dev-secret',
  corsOrigin: result.data.CORS_ORIGIN,
  adminApiKey: result.data.ADMIN_API_KEY,
  trustProxyHops: Number(result.data.TRUST_PROXY_HOPS ?? 1),
};
