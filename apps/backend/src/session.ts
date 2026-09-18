import connectPgSimple from 'connect-pg-simple';
import session, { type SessionOptions } from 'express-session';
import type { Pool } from 'pg';
import { config } from './config.js';

export function createSessionMiddleware(pool: Pool): ReturnType<typeof session> {
  const PgSession = connectPgSimple(session);

  const options: SessionOptions = {
    store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    name: 'sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      // The browser reaches the API through the frontend's own origin (/api is proxied),
      // so this is a first-party cookie. Lax is enough, and unlike SameSite=None it is
      // not blocked by Safari's or private windows' third-party cookie rules.
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  };

  return session(options);
}
