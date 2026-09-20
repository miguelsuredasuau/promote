import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ControllerStore } from '../server/store';
import { createOperatorServer } from '../server/http';
import { scenarioBuilder } from '../fixtures/contracts/factories';
import { request, type Server } from 'node:http';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function setup(withLogo = false) {
  const root = mkdtempSync(join(tmpdir(), 'promote-operator-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'adapters/xarts'), { recursive: true });
  mkdirSync(join(root, 'web'));
  writeFileSync(join(root, 'docs/implementation-status.json'), JSON.stringify({ milestones: [], paidDispatchEnabled: false }));
  writeFileSync(join(root, 'adapters/xarts/gate-catalog.json'), JSON.stringify({ sourceRevision: 'a'.repeat(40), entries: [] }));
  writeFileSync(join(root, 'web/index.html'), '<!doctype html><title>Promoted</title>');
  writeFileSync(join(root, '.env'), 'PRIVATE_MARKER=must-never-be-served');
  const store = new ControllerStore(join(root, 'store.sqlite'));
  if (withLogo) writeFileSync(join(root, 'xarts.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>Test logo</text></svg>');
  const server: Server = createOperatorServer({ root, store, checkout: withLogo ? root : undefined });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close(); rmSync(root, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${address.port}`, store, root };
}

it('reports actual empty state and unconfigured project without fabricating sessions', async () => {
  const { base } = await setup();
  const response = await fetch(`${base}/api/overview`);
  expect(response.status).toBe(200);
  const snapshot = JSON.parse(await response.text());
  expect(snapshot.mode).toBe('live');
  expect(snapshot.project).toMatchObject({ configured: false, repositoryAvailable: false, providerStatus: 'not_connected', head: null });
  expect(snapshot.incidents).toEqual([]);
  expect(snapshot.operations).toEqual([]);
  expect(snapshot.events).toEqual([]);
  expect(snapshot.ownerReport.economics.reportedSpend).toBeNull();
  expect(snapshot.ownerReport.mandate.status).toBe('not_configured');
  expect(snapshot.ownerReport.feedback.status).toBe('not_connected');
});

it('projects persisted task and operation state while removing dispatch claim authority', async () => {
  const { base, store } = await setup();
  const incident = scenarioBuilder('operator-test', 'Operator test only').finish([]).incident;
  store.createIncident(incident);
  store.enqueueOperation({ id: 'test-operation', incidentId: incident.id, harnessId: 'test-provider' });
  const claimed = store.claimOperation('test-operation', 'test-worker')!;
  const response = await fetch(`${base}/api/overview`);
  const text = await response.text();
  expect(text).not.toContain(claimed.claimToken);
  const snapshot = JSON.parse(text);
  expect(snapshot.incidents[0].id).toBe(incident.id);
  expect(snapshot.operations[0].status).toBe('in_flight');
  expect(snapshot.events.map((e: { type: string }) => e.type)).toEqual(['incident.received', 'dispatch.pending']);
});

it('serves only allowlisted assets and GET routes with restrictive browser headers', async () => {
  const { base } = await setup();
  const page = await fetch(base);
  expect(page.status).toBe(200);
  expect(page.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
  expect(page.headers.get('X-Content-Type-Options')).toBe('nosniff');
  for (const path of ['/.env', '/server/store.ts', '/docs/implementation-status.json', '/%2e%2e/.env']) {
    const response = await fetch(base + path);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('PRIVATE_MARKER');
  }
  expect((await fetch(`${base}/api/overview`, { method: 'POST' })).status).toBe(405);
  expect((await fetch(`${base}/api/overview`, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403);
  const rejectedHost = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(`${base}/api/overview`, { headers: { Host: 'untrusted.example' } }, (res) => {
      res.resume(); resolve(res.statusCode);
    });
    req.on('error', reject); req.end();
  });
  expect(rejectedHost).toBe(403);
});

it('does not expose server paths or errors if snapshot data is unavailable', async () => {
  const { base, root } = await setup();
  rmSync(join(root, 'docs/implementation-status.json'));
  const response = await fetch(`${base}/api/overview`);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'snapshot_unavailable' });
});

it('serves only the configured local project logo with an isolated SVG policy', async () => {
  const unconfigured = await setup();
  expect((await fetch(`${unconfigured.base}/api/project/logo`)).status).toBe(404);
  const configured = await setup(true);
  const logo = await fetch(`${configured.base}/api/project/logo`);
  expect(logo.status).toBe(200);
  expect(logo.headers.get('Content-Type')).toBe('image/svg+xml');
  expect(logo.headers.get('Content-Security-Policy')).toContain('sandbox');
  expect(await logo.text()).toContain('Test logo');
  expect((await fetch(`${configured.base}/api/project/.env`)).status).toBe(404);
});

it('shows durable service activity and honest disconnected provider status', async () => {
  const { base, store } = await setup();
  store.recordActivity('service', 'Test service started');
  store.serviceHeartbeat({ status: 'watching', configured: true });
  const response = await fetch(`${base}/api/activity`);
  const data = JSON.parse(await response.text());
  expect(data.service.provider).toEqual({ status: 'not_connected', paidDispatchEnabled: false });
  expect(data.service.intake.status).toBe('watching');
  expect(data.events).toMatchObject([{ category: 'service', summary: 'Test service started' }]);
  expect(JSON.parse(await (await fetch(`${base}/api/activity?after=${data.nextCursor}`)).text()).events).toEqual([]);
  expect((await fetch(`${base}/api/activity?after=-1`)).status).toBe(400);
  expect((await fetch(`${base}/api/activity`, { method: 'POST' })).status).toBe(405);
});

it('exposes received demo records separately from engineering incidents', async () => {
  const { base, store } = await setup();
  store.ingest('fixture:run', 'a'.repeat(64), { schema:'fixture', kind:'rating', value:'down', note:'Synthetic feedback' }, null);
  const data = JSON.parse(await (await fetch(`${base}/api/inbox`)).text());
  expect(data.items[0]).toMatchObject({ kind:'rating', summary:'Synthetic feedback', incidentId:null });
  const activity = JSON.parse(await (await fetch(`${base}/api/activity`)).text());
  expect(activity.service.receivedRecords).toBe(1);
  expect(activity.service.incidents).toBe(0);
  expect(activity.events[0].category).toBe('intake');
});
it('serves only an incident-bound verification log and rejects changed bytes',async()=>{
 const {createHash}=await import('node:crypto');
 const {base,store,root}=await setup();
 const incident=scenarioBuilder('gate-log','Gate log only').finish([]).incident;store.createIncident(incident);
 const candidateSha='b'.repeat(40),bytes='Build failed: missing package export';
 const hash=createHash('sha256').update(bytes).digest('hex');
 const directory=join(root,'.local/xarts-validation',candidateSha,'artifacts');mkdirSync(directory,{recursive:true});writeFileSync(join(directory,hash),bytes);
 const at=new Date().toISOString();
 store.recordEvent(incident.id,'gate.finished',{result:{schemaVersion:1,id:'log-result',gateId:'build',gateVersion:1,candidateSha,evaluatorRevision:'a'.repeat(40),inputHash:'c'.repeat(64),outcome:'fail',reason:'build_failed',expected:null,actual:null,logArtifactId:`log:${hash}`,durationMs:1,runnerIdentity:'test',startedAt:at,finishedAt:at}});
 const url=`${base}/api/incidents/${incident.id}/gates/log-result/log`;
 const response=await fetch(url);expect(response.status).toBe(200);expect(await response.text()).toBe(bytes);expect(response.headers.get('content-type')).toContain('text/plain');
 expect((await fetch(`${base}/api/incidents/${incident.id}/gates/unknown/log`)).status).toBe(404);
 writeFileSync(join(directory,hash),'changed');expect((await fetch(url)).status).toBe(409);
});

it('persists exact owner decisions, queues planning only, and refuses stale or conflicting approval',async()=>{
 const {base,store}=await setup();
 const seed=(key:string)=>{store.ingest(key,'a'.repeat(64),{schema:'fixture',kind:'rating',note:'Chart axis is unreadable'},null);store.triageRecord(key,[{id:'proposal-test',title:'Make the axis readable',category:'feedback',priority:55,evidenceKey:'axis',nextAction:'Review the original render and propose an acceptance example.'}],'a'.repeat(64));};
 seed('source:one');
 const get=async()=> JSON.parse(await (await fetch(`${base}/api/overview`)).text()).ownerReport;
 const proposal=(await get()).decisions[0];
 const {token}=JSON.parse(await(await fetch(`${base}/api/owner-session`)).text());
 const body={proposalId:proposal.id,revision:proposal.revision,action:'approve_plan',feedback:'Preserve the palette'};
 const send=(value:unknown,headers:Record<string,string>={})=>fetch(`${base}/api/owner-decisions`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Owner-Token':token,...headers},body:JSON.stringify(value)});
 expect((await send(body,{'X-Owner-Token':'wrong'})).status).toBe(403);
 expect((await send(body,{Origin:'https://untrusted.example'})).status).toBe(403);
 expect((await send({...body,action:'request_changes',feedback:''})).status).toBe(400);
 expect((await send({...body,totalAcu:100})).status).toBe(400);
 seed('source:two');
 expect((await send(body)).status).toBe(409);
 body.revision=(await get()).decisions[0].revision;
 expect((await send(body)).status).toBe(200);
 expect((await send(body)).status).toBe(200);
 expect(store.workQueue()).toHaveLength(1);
 expect(store.workQueue()[0]).toMatchObject({kind:'proposal_assessment',role:'product',state:'queued'});
 expect(store.engineeringReservations()).toHaveLength(0);
 expect((await send({...body,action:'reject'})).status).toBe(409);
 const report=await get();
 expect(report.decisions[0].resolution.authority).toEqual({planningOnly:true,paidDispatch:false,repositoryWrites:false,release:false});
 expect(report.decisionHistory).toHaveLength(1);
 expect(store.activity().some(e=>e.category==='owner_decision')).toBe(true);
});

it('keeps requested changes and declined proposals without dispatching work',async()=>{
 const {store,base}=await setup();
 for(const id of ['change','decline']){
  store.ingest(id,'a'.repeat(64),{schema:'fixture'},null);
  store.triageRecord(id,[{id,title:id,category:'feature',priority:40,evidenceKey:id,nextAction:'Scope the request'}],'a'.repeat(64));
 }
 const report=JSON.parse(await(await fetch(`${base}/api/overview`)).text());
 for(const p of report.ownerReport.decisions)store.decideProposal({proposalId:p.id,revision:p.revision,action:p.id==='change'?'request_changes':'reject',feedback:'Keep existing behavior'});
 expect(store.ownerDecisions()).toHaveLength(2);expect(store.workQueue()).toHaveLength(0);
});

it('hands the owner session token only to same-origin fetches and refuses near-miss tokens',async()=>{
 const {base}=await setup();
 const okSite=async(site?:string)=>(await fetch(`${base}/api/owner-session`,{headers:site?{'Sec-Fetch-Site':site}:{}})).status;
 expect(await okSite()).toBe(200);
 expect(await okSite('same-origin')).toBe(200);
 expect(await okSite('none')).toBe(200);
 expect(await okSite('cross-site')).toBe(403);
 expect(await okSite('same-site')).toBe(403);
 const {token}=JSON.parse(await(await fetch(`${base}/api/owner-session`)).text());
 const post=(presented:string)=>fetch(`${base}/api/owner-decisions`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Owner-Token':presented},body:'{}'});
 expect((await post(token.slice(0,-1)+(token.endsWith('0')?'1':'0'))).status).toBe(403);
 expect((await post(token+'0')).status).toBe(403);
 expect((await post(token)).status).toBe(400);
});
