import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ControllerStore } from './store';
import { overview } from './overview';

const assets: Record<string, { file: string; mime: string }> = {
  '/activity': { file: 'activity.html', mime: 'text/html; charset=utf-8' },
  '/activity.js': { file: 'activity.js', mime: 'text/javascript; charset=utf-8' },
  '/operations-model.js': { file: 'operations-model.js', mime: 'text/javascript; charset=utf-8' },
  '/activity.css': { file: 'activity.css', mime: 'text/css; charset=utf-8' },
  '/': { file: 'index.html', mime: 'text/html; charset=utf-8' },
  '/qa-prototype': { file: 'qa-prototype.html', mime: 'text/html; charset=utf-8' },
  '/qa-prototype.js': { file: 'qa-prototype.js', mime: 'text/javascript; charset=utf-8' },
  '/qa-prototype.css': { file: 'qa-prototype.css', mime: 'text/css; charset=utf-8' },
  '/office-model.js': { file: 'office-model.js', mime: 'text/javascript; charset=utf-8' },
  '/office-materials.js': { file: 'office-materials.js', mime: 'text/javascript; charset=utf-8' },
  '/office-furniture.js': { file: 'office-furniture.js', mime: 'text/javascript; charset=utf-8' },
  '/assets/studio/studio-small-09.hdr': { file: 'assets/studio/studio-small-09.hdr', mime: 'application/octet-stream' },
  '/office-scene.js': { file: 'office-scene.js', mime: 'text/javascript; charset=utf-8' },
  '/app.js': { file: 'app.js', mime: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', mime: 'text/css; charset=utf-8' },
};
export function createOperatorServer(options: { root: string; store: ControllerStore; checkout?: string }) {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
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
      if (url.pathname === '/api/activity') {
        const after = Number(url.searchParams.get('after') ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) { res.writeHead(400).end('Invalid cursor'); return; }
        const events = options.store.activity(after);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ service: options.store.serviceSnapshot(), events, nextCursor: events.at(-1)?.sequence ?? after })); return;
      }
      const chatProgressRoute = url.pathname.match(/^\/api\/chat-progress\/([0-9TZ]+-[a-f0-9]{8})$/);
      if (chatProgressRoute) {
        const after = Number(url.searchParams.get('after') ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) { res.writeHead(400).end('Invalid cursor'); return; }
        const events = options.store.chatProgress(chatProgressRoute[1], after);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ events, nextCursor: events.at(-1)?.ordinal ?? after })); return;
      }
      if (url.pathname === '/api/inbox') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ items: options.store.inboxSnapshot() })); return;
      }
      const incidentRoute = url.pathname.match(/^\/api\/incidents\/([^/]+)$/);
      if (incidentRoute) {
        const id = decodeURIComponent(incidentRoute[1]);
        const incident = options.store.getIncident(id);
        if (!incident) { res.writeHead(404).end('Not found'); return; }
        const after = Number(url.searchParams.get('after') ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) { res.writeHead(400).end('Invalid cursor'); return; }
        const events = options.store.incidentEvents(id, after);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ incident, events, nextCursor: events.at(-1)?.sequence ?? after })); return;
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
      if (url.pathname === '/api/office-assets') {
        res.setHeader('Content-Type','application/json');
        try { res.end(await readFile(join(options.root,'.local/asset-studio/office-assets.json'))); }
        catch { res.end(JSON.stringify({entries:[]})); } return;
      }
      if (/^\/assets\/generated\/(model-[0-9a-f-]{36}\.glb|item-[0-9a-f-]{36}\.png)$/.test(url.pathname)) {
        res.setHeader('Content-Type',url.pathname.endsWith('.png')?'image/png':'model/gltf-binary');
        res.end(await readFile(join(options.root,'.local/asset-studio',url.pathname.split('/').at(-1)!))); return;
      }
      if (/^\/assets\/generated\/(chair|engineer)\.glb$/.test(url.pathname)) {
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.end(await readFile(join(options.root, '.local/asset-studio', url.pathname.split('/').at(-1)!))); return;
      }
      const gltfModules: Record<string, string> = {
        '/vendor/GLTFLoader.js': 'loaders/GLTFLoader.js',
        '/vendor/BufferGeometryUtils.js': 'utils/BufferGeometryUtils.js',
        '/vendor/SkeletonUtils.js': 'utils/SkeletonUtils.js',
      };
      if (gltfModules[url.pathname]) {
        const source = await readFile(join(options.root, 'node_modules/three/examples/jsm', gltfModules[url.pathname]), 'utf8');
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(source.replaceAll("from 'three'", "from '/vendor/three.module.js'").replaceAll("'../utils/BufferGeometryUtils.js'", "'/vendor/BufferGeometryUtils.js'").replaceAll("'../utils/SkeletonUtils.js'", "'/vendor/SkeletonUtils.js'")); return;
      }
      if (url.pathname === '/vendor/HDRLoader.js') {
        const source = await readFile(join(options.root, 'node_modules/three/examples/jsm/loaders/HDRLoader.js'), 'utf8');
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(source.replace("from 'three'", "from '/vendor/three.module.js'")); return;
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
