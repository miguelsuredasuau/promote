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
async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'promote-operator-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'adapters/xarts'), { recursive: true });
  mkdirSync(join(root, 'web'));
  writeFileSync(join(root, 'docs/implementation-status.json'), JSON.stringify({ milestones: [], paidDispatchEnabled: false }));
  writeFileSync(join(root, 'adapters/xarts/gate-catalog.json'), JSON.stringify({ sourceRevision: 'a'.repeat(40), entries: [] }));
  writeFileSync(join(root, 'web/index.html'), '<!doctype html><title>Promoted</title>');
  writeFileSync(join(root, '.env'), 'PRIVATE_MARKER=must-never-be-served');
  const store = new ControllerStore(join(root, 'store.sqlite'));
  const server: Server = createOperatorServer({ root, store });
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
