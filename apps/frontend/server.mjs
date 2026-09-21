// Production web server for the frontend image: serves the built SPA and forwards
// /api and /health to the backend, so the browser only ever talks to one origin.
// Same-origin requests keep the session cookie first-party, which Safari and
// private windows require.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const PROXY_TIMEOUT_MS = 30_000;

// Only for what this server itself serves; proxied /api responses carry the backend's own
// headers. Fonts are self-hosted and the bundle has no inline scripts, so everything can
// come from 'self'. Styles keep 'unsafe-inline' because React writes style attributes.
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'content-security-policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function isProxied(pathname) {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/health' ||
    pathname.startsWith('/health/')
  );
}

function sendJson(res, status, body) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function proxy(req, res, target) {
  if (!target) {
    sendJson(res, 502, { error: 'bad_gateway', message: 'El servicio no está disponible.' });
    return;
  }

  const client = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };
  // Hop-by-hop: each side of the proxy manages its own connection. The forwarding
  // headers (x-forwarded-*) are passed through untouched so the backend keeps
  // seeing the original client address and protocol.
  delete headers.connection;

  const upstream = client.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: req.method,
      path: req.url,
      headers,
      timeout: PROXY_TIMEOUT_MS,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', () => {
    sendJson(res, 502, { error: 'bad_gateway', message: 'El servicio no está disponible.' });
  });
  res.on('close', () => upstream.destroy());

  req.pipe(upstream);
}

async function findFile(distDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const resolved = path.resolve(distDir, `.${decoded}`);
  if (resolved !== distDir && !resolved.startsWith(distDir + path.sep)) return null;
  try {
    const info = await stat(resolved);
    return info.isFile() ? { file: resolved, size: info.size } : null;
  } catch {
    return null;
  }
}

async function serveStatic(req, res, distDir, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...SECURITY_HEADERS, allow: 'GET, HEAD' });
    res.end();
    return;
  }

  let found = await findFile(distDir, pathname);
  const isAsset = pathname.startsWith('/assets/');
  // Anything that is not a real file is a client-side route: hand it to the SPA.
  // A missing file under /assets/ is a real 404 instead, so a stale hashed bundle
  // is not answered with HTML.
  if (!found && !isAsset && !path.extname(pathname)) {
    found = await findFile(distDir, '/index.html');
  }
  if (!found) {
    res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(found.file).toLowerCase();
  const headers = {
    ...SECURITY_HEADERS,
    'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
    'content-length': found.size,
    // Hashed bundles never change; the HTML entry point must always be revalidated
    // so a new deploy is picked up.
    'cache-control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(found.file)
    .on('error', () => res.destroy())
    .pipe(res);
}

export function createServer({ distDir, proxyTarget }) {
  const root = path.resolve(distDir);
  const target = proxyTarget ? new URL(proxyTarget) : null;

  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (isProxied(pathname)) {
      proxy(req, res, target);
      return;
    }
    serveStatic(req, res, root, pathname).catch(() => sendJson(res, 500, { error: 'internal_error' }));
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT ?? 4173);
  const proxyTarget = process.env.API_PROXY_TARGET;
  if (!proxyTarget) {
    console.warn('API_PROXY_TARGET is not set: /api and /health requests will answer 502.');
  }
  const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
  // No host argument: listens on both IPv4 and IPv6, which Railway's private
  // network needs.
  createServer({ distDir, proxyTarget }).listen(port, () => {
    console.log(`Frontend listening on :${port}${proxyTarget ? `, proxying API to ${proxyTarget}` : ''}`);
  });
}
