import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ControllerStore } from './store';
import { overview } from './overview';

const assets: Record<string, { file: string; mime: string }> = {
  '/': { file: 'index.html', mime: 'text/html; charset=utf-8' },
  '/qa-prototype': { file: 'qa-prototype.html', mime: 'text/html; charset=utf-8' },
  '/qa-prototype.js': { file: 'qa-prototype.js', mime: 'text/javascript; charset=utf-8' },
  '/qa-prototype.css': { file: 'qa-prototype.css', mime: 'text/css; charset=utf-8' },
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
      if (url.pathname === '/api/project/logo') {
        if (!options.checkout) { res.writeHead(404).end('Logo unavailable'); return; }
        try {
          const logo = await readFile(join(options.checkout, 'xarts.svg'));
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
          res.end(logo);
        } catch { res.writeHead(404).end('Logo unavailable'); }
        return;
      }
      const vendorFiles: Record<string,string> = {
        '/vendor/three.module.js': 'three.module.js', '/vendor/three.core.js': 'three.core.js',
      };
      if (vendorFiles[url.pathname]) {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(await readFile(join(options.root, 'node_modules/three/build', vendorFiles[url.pathname]))); return;
      }
      const asset = assets[url.pathname];
      if (!asset) { res.writeHead(404).end('Not found'); return; }
      let body = await readFile(join(options.root, 'web', asset.file));
      if (asset.file === 'index.html' && body.includes('<!--OFFICE_SCENE-->')) {
        const scene = await readFile(join(options.root, 'web/office.svg'), 'utf8');
        body = Buffer.from(body.toString('utf8').replace('<!--OFFICE_SCENE-->', scene));
      }
      res.setHeader('Content-Type', asset.mime); res.end(body);
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'snapshot_unavailable' }));
    }
  });
}
