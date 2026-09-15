import connectPgSimple from 'connect-pg-simple';
import session, { type SessionOptions } from 'express-session';
import type { Pool } from 'pg';

export function createSessionMiddleware(pool: Pool): ReturnType<typeof session> {
  const PgSession = connectPgSimple(session);
  const isProduction = process.env.NODE_ENV === 'production';

  const options: SessionOptions = {
    store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    name: 'sid',
    secret: process.env.SESSION_SECRET ?? 'dev-secret',
    resave: false,
    saveUninitialized: true,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      // Frontend and backend live on separate Railway subdomains, which counts as
      // cross-site for cookie purposes — SameSite=Lax would silently drop the cookie
      // on fetch() calls in production, so it has to be None there (requires Secure).
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  };

  return session(options);
}
