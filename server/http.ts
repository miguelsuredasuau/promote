import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ControllerStore } from './store';
import { overview } from './overview';

const assets: Record<string, { file: string; mime: string }> = {
  '/': { file: 'index.html', mime: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', mime: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', mime: 'text/css; charset=utf-8' },
};
export function createOperatorServer(options: { root: string; store: ControllerStore; checkout?: string }) {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    // Loopback-only dev surface: reject remote Host/Origin values (including DNS rebinding).
    const host = req.headers.host ?? '';
    const allowedHost = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host);
    const origin = req.headers.origin;
    if (!allowedHost || (origin && origin !== `http://${host}`)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET'); res.writeHead(405).end('Read-only operator surface'); return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (url.pathname === '/api/overview') {
        const data = await overview(options.root, options.store, options.checkout);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data)); return;
      }
      const asset = assets[url.pathname];
      if (!asset) { res.writeHead(404).end('Not found'); return; }
      const body = await readFile(join(options.root, 'web', asset.file));
      res.setHeader('Content-Type', asset.mime); res.end(body);
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'snapshot_unavailable' }));
    }
  });
}
