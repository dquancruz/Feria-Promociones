// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from './server.mjs';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('frontend server', () => {
  let distDir;
  let upstream;
  let web;
  let base;
  let lastUpstreamRequest;

  beforeAll(async () => {
    distDir = await mkdtemp(path.join(os.tmpdir(), 'feria-dist-'));
    await mkdir(path.join(distDir, 'assets'));
    await writeFile(path.join(distDir, 'index.html'), '<!doctype html><div id="root"></div>');
    await writeFile(path.join(distDir, 'assets', 'app-abc123.js'), 'console.log(1)');

    upstream = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        lastUpstreamRequest = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() };
        const { pathname } = new URL(req.url, 'http://upstream');
        if (pathname === '/api/echo') {
          res.writeHead(201, { 'content-type': 'application/json', 'set-cookie': 'sid=abc; Path=/; HttpOnly' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (pathname === '/health') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"status":"ok"}');
          return;
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end('{"error":"not_found"}');
      });
    });
    const upstreamPort = await listen(upstream);

    web = createServer({ distDir, proxyTarget: `http://127.0.0.1:${upstreamPort}` });
    base = `http://127.0.0.1:${await listen(web)}`;
  });

  afterAll(async () => {
    await close(web);
    await close(upstream);
    await rm(distDir, { recursive: true, force: true });
  });

  describe('static files', () => {
    it('serves index.html at the root without caching it', async () => {
      const response = await fetch(`${base}/`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(await response.text()).toContain('id="root"');
    });

    it('caches hashed assets for a year', async () => {
      const response = await fetch(`${base}/assets/app-abc123.js`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/javascript');
      expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('sends the security headers with the page and with the assets', async () => {
      for (const url of [`${base}/`, `${base}/admin`, `${base}/assets/app-abc123.js`]) {
        const response = await fetch(url);

        expect(response.headers.get('x-frame-options'), url).toBe('DENY');
        expect(response.headers.get('referrer-policy'), url).toBe('same-origin');
        expect(response.headers.get('x-content-type-options'), url).toBe('nosniff');
        expect(response.headers.get('content-security-policy'), url).toBe(
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        );
      }
    });

    it('sends the security headers on a static 404 too', async () => {
      const response = await fetch(`${base}/assets/old-bundle.js`);

      expect(response.status).toBe(404);
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    });

    it('falls back to index.html for client-side routes', async () => {
      const response = await fetch(`${base}/admin`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('id="root"');
    });

    it('answers 404 for a missing asset instead of returning HTML', async () => {
      const response = await fetch(`${base}/assets/old-bundle.js`);

      expect(response.status).toBe(404);
    });

    it('does not serve files outside the dist folder', async () => {
      const response = await fetch(`${base}/..%2Fpackage.json`);

      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('@feria/frontend');
    });

    it('rejects methods other than GET and HEAD on static paths', async () => {
      const response = await fetch(`${base}/`, { method: 'POST' });

      expect(response.status).toBe(405);
    });

    it('answers HEAD without a body', async () => {
      const response = await fetch(`${base}/`, { method: 'HEAD' });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    });
  });

  describe('proxy', () => {
    it('forwards API requests with method, path, query, body and cookies', async () => {
      const response = await fetch(`${base}/api/echo?x=1`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: 'sid=abc' },
        body: JSON.stringify({ nombre: 'Ana' }),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ok: true });
      expect(lastUpstreamRequest).toMatchObject({
        method: 'PATCH',
        url: '/api/echo?x=1',
        body: '{"nombre":"Ana"}',
      });
      expect(lastUpstreamRequest.headers.cookie).toBe('sid=abc');
    });

    it('returns the upstream Set-Cookie to the browser on the same origin', async () => {
      const response = await fetch(`${base}/api/echo`);

      expect(response.headers.get('set-cookie')).toBe('sid=abc; Path=/; HttpOnly');
    });

    it('rewrites Host to the upstream and leaves the forwarding headers untouched', async () => {
      await fetch(`${base}/api/echo`, {
        headers: { 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https' },
      });

      expect(lastUpstreamRequest.headers.host).not.toBe(new URL(base).host);
      expect(lastUpstreamRequest.headers['x-forwarded-for']).toBe('203.0.113.7');
      expect(lastUpstreamRequest.headers['x-forwarded-proto']).toBe('https');
    });

    it('leaves proxied responses with whatever headers the backend set', async () => {
      const api = await fetch(`${base}/api/echo`);
      const health = await fetch(`${base}/health`);

      for (const response of [api, health]) {
        expect(response.headers.get('content-security-policy')).toBeNull();
        expect(response.headers.get('x-frame-options')).toBeNull();
        expect(response.headers.get('referrer-policy')).toBeNull();
      }
    });

    it('forwards the health endpoints', async () => {
      const response = await fetch(`${base}/health`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    });

    it('passes upstream error statuses through', async () => {
      const response = await fetch(`${base}/api/unknown`);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not_found' });
    });

    it('answers 502 JSON when the backend is unreachable', async () => {
      const dead = http.createServer();
      const deadPort = await listen(dead);
      await close(dead);
      const orphan = createServer({ distDir, proxyTarget: `http://127.0.0.1:${deadPort}` });
      const orphanBase = `http://127.0.0.1:${await listen(orphan)}`;

      const response = await fetch(`${orphanBase}/api/echo`);
      await close(orphan);

      expect(response.status).toBe(502);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect((await response.json()).error).toBe('bad_gateway');
    });

    it('answers 502 JSON when no proxy target is configured', async () => {
      const bare = createServer({ distDir, proxyTarget: undefined });
      const bareBase = `http://127.0.0.1:${await listen(bare)}`;

      const response = await fetch(`${bareBase}/api/echo`);
      const page = await fetch(`${bareBase}/`);
      await close(bare);

      expect(response.status).toBe(502);
      expect(page.status).toBe(200);
    });
  });
});
