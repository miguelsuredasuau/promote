import {executeImprovement,projectImprovements} from './improvements';
import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ControllerStore, StoreConflictError } from './store';
import { z, ZodError } from 'zod';
import { explorationTarget, launchExploration } from './exploration';
import { overview } from './overview';
import { GateResult } from '../contracts/records';
import { listPullRequests, loadPullRequestConfig, mergePullRequest } from './pull-requests';
import { expungedArtifact, RETENTION_POLICY } from './retention';

const assets: Record<string, { file: string; mime: string }> = {
  '/testing': {file:'testing.html',mime:'text/html; charset=utf-8'},
  '/testing.js': {file:'testing.js',mime:'text/javascript; charset=utf-8'},
  '/testing.css': {file:'testing.css',mime:'text/css; charset=utf-8'},
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
  '/decision-demo.js': { file: 'decision-demo.js', mime: 'text/javascript; charset=utf-8' },
  '/assets/decisions/xarts-formatting.png': { file: 'assets/decisions/xarts-formatting.png', mime: 'image/png' },
  '/assets/decisions/xarts-layout.png': { file: 'assets/decisions/xarts-layout.png', mime: 'image/png' },
  '/assets/decisions/xarts-accessibility.png': { file: 'assets/decisions/xarts-accessibility.png', mime: 'image/png' },
  '/assets/decisions/xarts-preflight.png': { file: 'assets/decisions/xarts-preflight.png', mime: 'image/png' },
  '/decision-desk.js': { file: 'decision-desk.js', mime: 'text/javascript; charset=utf-8' },
  '/decision-desk.css': { file: 'decision-desk.css', mime: 'text/css; charset=utf-8' },
  '/pull-requests.js': { file: 'pull-requests.js', mime: 'text/javascript; charset=utf-8' },
  '/app.js': { file: 'app.js', mime: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', mime: 'text/css; charset=utf-8' },
};
export function createOperatorServer(options: { root: string; store: ControllerStore; checkout?: string; testCheckout?:string }) {
  const ownerToken = randomBytes(32).toString('hex');
  const ownerAuthorized = (req: IncomingMessage, host: string, origin: string | undefined, requireOrigin = true) => {
    const presented = req.headers['x-owner-token'];
    return (origin === `http://${host}` || (!requireOrigin && origin === undefined)) && typeof presented === 'string' && /^[a-f0-9]{64}$/.test(presented)
      && timingSafeEqual(Buffer.from(presented), Buffer.from(ownerToken));
  };
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
    if(req.method==='POST' && (req.url==='/api/explorations'||req.url==='/api/explorations/stop')) {
      if(!ownerAuthorized(req, host, origin)){res.writeHead(403).end('Owner session required');return;}
      if(req.headers['content-type']!=='application/json'){res.writeHead(415).end('JSON required');return;}
      try {

        let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>12000){res.writeHead(413).end('Request too large');return;}}
        let record;
        if(req.url==='/api/explorations/stop'){
          const {id}=z.object({id:z.string().uuid()}).strict().parse(JSON.parse(body));
          record=options.store.explorations().find(r=>r.spec.id===id);
          if(!record)throw Error('Unknown test');
          if(!['stopped','rejected'].includes(record.state))record=options.store.updateExploration(id,{state:'stopping',reason:'owner_requested_stop'});
        }else{
          if(!options.testCheckout)throw Error('Test checkout is not configured');
          record=await launchExploration(options.store,options.root,options.testCheckout,JSON.parse(body));
        }
        res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(record));
      }catch(error){res.writeHead(error instanceof ZodError||error instanceof SyntaxError?400:409,{'Content-Type':'application/json'}).end(JSON.stringify({error:error instanceof Error?error.message:'Test unavailable'}));}
      return;
    }
    if (req.method === 'POST' && req.url === '/api/improvements/execute') {
      if (!ownerAuthorized(req, host, origin)) { res.writeHead(403).end('Owner session required'); return; }
      if(req.headers['content-type']!=='application/json'){res.writeHead(415).end('JSON required');return;}
      try { let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>4000){res.writeHead(413).end();return;}}
        const result=await executeImprovement(options.root,options.store,JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));
      }catch(error){res.writeHead(error instanceof StoreConflictError?409:400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error instanceof StoreConflictError?error.message:'Execution could not start; inspect the activity journal.'}));}return;
    }
    if (req.method === 'POST' && req.url === '/api/owner-decisions') {
      if (!ownerAuthorized(req, host, origin)) { res.writeHead(403).end('Owner session required'); return; }
      if (req.headers['content-type'] !== 'application/json') { res.writeHead(415).end('JSON required'); return; }
      try {
        let body = '';
        for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 12000) { res.writeHead(413).end('Request too large'); return; } }
        const decision = options.store.decideProposal(JSON.parse(body));
        res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify(decision));
      } catch (error) {
        const status = error instanceof StoreConflictError ? 409 : error instanceof ZodError || error instanceof SyntaxError ? 400 : 503;
        res.writeHead(status, {'Content-Type':'application/json'}).end(JSON.stringify({error:status===409?'Decision changed; refresh and review again.':status===400?'Invalid decision or missing feedback.':'Decision could not be saved.'}));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/api/pull-requests/merge') {
      if (!ownerAuthorized(req, host, origin)) { res.writeHead(403).end('Owner session required'); return; }
      if (req.headers['content-type'] !== 'application/json') { res.writeHead(415).end('JSON required'); return; }
      const config = loadPullRequestConfig(options.root);
      if (!config) { res.writeHead(409, {'Content-Type':'application/json'}).end(JSON.stringify({error:'Set PROMOTE_GITHUB_TOKEN and PROMOTE_MERGE_REPOS in .env to merge from the office.'})); return; }
      try {
        let body = '';
        for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 4000) { res.writeHead(413).end('Request too large'); return; } }
        const outcome = await mergePullRequest(config, options.store, JSON.parse(body));
        res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify(outcome));
      } catch (error) {
        const status = error instanceof ZodError || error instanceof SyntaxError ? 400 : 503;
        const github = error instanceof Error && /^github_(\d+)/.exec(error.message)?.[1];
        res.writeHead(status, {'Content-Type':'application/json'}).end(JSON.stringify({error:status===400?'Invalid merge request.':github?`GitHub answered ${github}; check the token's scopes.`:'Merge could not be completed; the branch was left untouched unless reported otherwise.'}));
      }
      return;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET'); res.writeHead(405).end('Read-only operator surface'); return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${host}`);
      const gateLogRoute=url.pathname.match(/^\/api\/incidents\/([A-Za-z0-9._:-]+)\/gates\/([A-Za-z0-9._:-]+)\/log$/);
      if(gateLogRoute){
        const result=options.store.incidentEvents(gateLogRoute[1],0,1000).filter(e=>e.type==='gate.finished').map(e=>GateResult.parse(e.payload.result)).find(r=>r.id===gateLogRoute[2]);
        if(!result||!/^log:[a-f0-9]{64}$/.test(result.logArtifactId??'')){res.writeHead(404).end('Verification log unavailable');return;}
        const sha=result.logArtifactId!.slice(4);
        const gone=expungedArtifact(options.root,result.candidateSha,sha);
        if(gone){res.setHeader('Content-Type','application/json');res.writeHead(410).end(JSON.stringify({expunged:true,policy:RETENTION_POLICY,sha256:gone.sha256,bytes:gone.bytes,expungedAt:gone.expungedAt}));return;}
        const bytes=await readFile(join(options.root,'.local/xarts-validation',result.candidateSha,'artifacts',sha));
        if(bytes.length>4*1024*1024||createHash('sha256').update(bytes).digest('hex')!==sha){res.writeHead(409).end('Verification log failed its integrity check');return;}
        res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(bytes);return;
      }
      if(url.pathname==='/api/explorations'){
        let target=null;try{if(options.testCheckout)target=await explorationTarget(options.testCheckout);}catch{/* Show explicit unavailable target, retain history. */}
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({target,runs:options.store.explorations()}));return;
      }
      if (url.pathname === '/api/owner-session') {
        const site = req.headers['sec-fetch-site'];
        if (site !== undefined && site !== 'same-origin' && site !== 'none') { res.writeHead(403).end('Owner session is same-origin only'); return; }
        res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({token:ownerToken})); return;
      }
      if (url.pathname === '/api/improvements') {res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({projectId:'xarts',items:projectImprovements(options.root,options.store)}));return;}
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
      if (url.pathname === '/api/pull-requests') {
        // Fans out to GitHub; Origin-less loads (<img>, navigations) must not be able to trigger it.
        if (!ownerAuthorized(req, host, origin, false)) { res.writeHead(403).end('Owner session required'); return; }
        const config = loadPullRequestConfig(options.root);
        res.setHeader('Content-Type', 'application/json');
        if (!config) { res.end(JSON.stringify({ configured: false, repos: [], items: [] })); return; }
        try { res.end(JSON.stringify({ configured: true, repos: config.repos, items: await listPullRequests(config) })); }
        catch { res.writeHead(503).end(JSON.stringify({ error: 'GitHub unavailable or token rejected.' })); }
        return;
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
