import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Incident } from '../contracts/records';
import { ControllerStore, StoreConflictError } from '../server/store';

const incident = (id = 'test-incident'): Incident => ({
  schemaVersion: 1, id, revision: 0, targetLibrary: 'test-library',
  trigger: { kind: 'http', idempotencyKey: id, receivedAt: '2026-01-01T00:00:00.000Z' },
  requestedOutcome: { kind: 'repair', summary: 'Synthetic test repair' },
  requestHash: 'a'.repeat(64), inputsHash: 'b'.repeat(64), sourceArtifacts: [],
  baseCommit: 'c'.repeat(40), acceptanceContractHash: 'd'.repeat(64),
  evaluatorRevision: 'e'.repeat(40), policyRevision: 'test-v1', status: 'received',
  block: null, cancellation: null, acceptedIdentity: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

const directories: string[] = [];
const stores = new Set<ControllerStore>();
function open(path?: string) {
  if (!path) {
    const dir = mkdtempSync(join(tmpdir(), 'promote-store-test-'));
    directories.push(dir);
    path = join(dir, 'controller.sqlite');
  }
  const store = new ControllerStore(path);
  stores.add(store);
  return { store, path };
}
function close(store: ControllerStore) { store.close(); stores.delete(store); }
afterEach(() => {
  vi.useRealTimers();
  for (const store of stores) store.close();
  stores.clear();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('durable controller intake', () => {
  it('persists exact metadata and one received event across reopening and canonical retries', () => {
    const { store, path } = open();
    const original = incident();
    const returned = store.createIncident(original);
    returned.policyRevision = 'caller-mutation';
    close(store);
    const reopened = open(path).store;
    const retry = { ...original, id: 'retry-id', createdAt: '2026-02-01T00:00:00.000Z',
      trigger: { receivedAt: '2026-02-01T00:00:00.000Z', idempotencyKey: original.trigger.idempotencyKey, kind: 'http' } };
    expect(reopened.createIncident(retry)).toEqual(original);
    expect(reopened.getIncident(original.id)).toEqual(original);
    expect(reopened.getIncident('retry-id')).toBeNull();
    expect(reopened.eventsAfter(0)).toMatchObject([{ sequence: 1, type: 'incident.received', incidentId: original.id }]);
  });

  it('compares request content and frozen metadata even when supplied requestHash is unchanged', () => {
    const { store, path } = open();
    const other = open(path).store;
    const original = incident();
    store.createIncident(original);
    for (const change of [
      { requestedOutcome: { kind: 'repair', summary: 'Different request' } },
      { inputsHash: 'f'.repeat(64) }, { policyRevision: 'other-policy' },
      { evaluatorRevision: 'f'.repeat(40) }, { acceptanceContractHash: 'f'.repeat(64) },
    ]) expect(() => other.createIncident({ ...original, ...change })).toThrow(StoreConflictError);
    expect(() => other.createIncident({ ...incident(), trigger: { ...original.trigger, idempotencyKey: 'other-key' } }))
      .toThrow(StoreConflictError);
    expect(other.createIncident(original)).toEqual(original);
    expect(store.eventsAfter(0)).toHaveLength(1);
  });

  it('rejects malformed and noninitial incidents before persistence', () => {
    const { store } = open();
    for (const change of [{ surprise: true }, { requestHash: 'bad' }, { status: 'engineering' },
      { revision: 1 }, { cancellation: { requestedAt: incident().createdAt, requestedBy: 'test' } }]) {
      expect(() => store.createIncident({ ...incident(), ...change })).toThrow();
    }
    expect(store.getIncident(incident().id)).toBeNull();
    expect(store.eventsAfter(0)).toEqual([]);
    expect(() => store.eventsAfter(-1)).toThrow();
    expect(() => store.eventsAfter(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(() => store.eventsAfter(0, 1001)).toThrow();
    expect(() => store.eventsAfter(0, 0)).toThrow();
  });

  it('rolls back incident insertion when the event insert fails', () => {
    const { store, path } = open();
    const db = new DatabaseSync(path);
    try {
      db.exec("CREATE TRIGGER fail_events BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'test event failure'); END;");
      expect(() => store.createIncident(incident())).toThrow('test event failure');
      expect(store.getIncident(incident().id)).toBeNull();
      expect(store.eventsAfter(0)).toEqual([]);
      db.exec('DROP TRIGGER fail_events');
      expect(store.createIncident(incident())).toEqual(incident());
    } finally { db.close(); }
  });

  it('allocates global event sequence across incidents, connections and restarts', () => {
    const { store, path } = open();
    const other = open(path).store;
    store.createIncident(incident('first'));
    other.createIncident(incident('second'));
    close(store);
    const reopened = open(path).store;
    reopened.createIncident(incident('third'));
    expect(other.eventsAfter(0).map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(reopened.eventsAfter(1).map((event) => event.incidentId)).toEqual(['second', 'third']);
    expect(reopened.eventsAfter(1, 1).map((event) => event.incidentId)).toEqual(['second']);
  });
});

describe('durable dispatch claims', () => {
  const intent = { id: 'test-operation', incidentId: 'test-incident', harnessId: 'test-harness' };

  it('commits and deduplicates intent before a unique claim across two connections', () => {
    const { store, path } = open();
    const other = open(path).store;
    store.createIncident(incident());
    const pending = store.enqueueOperation(intent);
    expect(other.getOperation(intent.id)).toEqual(pending);
    expect(other.enqueueOperation(intent)).toEqual(pending);
    expect(() => other.enqueueOperation({ ...intent, harnessId: 'different' })).toThrow(StoreConflictError);
    const claim = store.claimOperation(intent.id, 'worker-one')!;
    expect(claim).toMatchObject({ status: 'in_flight', workerId: 'worker-one' });
    expect(claim.claimToken).toBeTruthy();
    expect(other.claimOperation(intent.id, 'worker-two')).toBeNull();
    expect(store.claimOperation(intent.id, 'worker-one')).toBeNull();
    expect(store.eventsAfter(0).map((event) => event.type)).toEqual(['incident.received', 'dispatch.pending']);
  });

  it('leaves a crashed or stale in-flight send blocked indefinitely', () => {
    const { store, path } = open();
    store.createIncident(incident());
    store.enqueueOperation(intent);
    const claim = store.claimOperation(intent.id, 'worker-one');
    close(store);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    const reopened = open(path).store;
    expect(reopened.claimOperation(intent.id, 'worker-two')).toBeNull();
    expect(reopened.getOperation(intent.id)).toEqual(claim);
    expect(reopened.enqueueOperation(intent)).toEqual(claim);
  });

  it.each([
    { kind: 'created', remoteId: 'test-remote' },
    { kind: 'unknown_outcome', reason: 'Response lost after send' },
    { kind: 'rejected', reason: 'Provider authoritatively rejected creation' },
  ] as const)('persists $kind, requires ownership, and never implicitly redispatches', (outcome) => {
    const { store, path } = open();
    store.createIncident(incident());
    store.enqueueOperation(intent);
    const claim = store.claimOperation(intent.id, 'worker-one')!;
    expect(() => store.completeOperation(intent.id, 'wrong-token', outcome)).toThrow(StoreConflictError);
    const result = store.completeOperation(intent.id, claim.claimToken!, outcome);
    close(store);
    const reopened = open(path).store;
    expect(reopened.getOperation(intent.id)).toEqual(result);
    expect(reopened.completeOperation(intent.id, claim.claimToken!, outcome)).toEqual(result);
    expect(reopened.claimOperation(intent.id, 'worker-two')).toBeNull();
    expect(() => reopened.completeOperation(intent.id, claim.claimToken!, { kind: 'created', remoteId: 'different' }))
      .toThrow(StoreConflictError);
    expect(reopened.eventsAfter(0)).toHaveLength(outcome.kind === 'created' ? 3 : 2);
  });

  it('rolls back intent and completion if their event cannot be persisted', () => {
    const { store, path } = open();
    store.createIncident(incident());
    const db = new DatabaseSync(path);
    const fail = () => db.exec("CREATE TRIGGER fail_events BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'test event failure'); END;");
    try {
      fail();
      expect(() => store.enqueueOperation(intent)).toThrow();
      expect(store.getOperation(intent.id)).toBeNull();
      db.exec('DROP TRIGGER fail_events');
      store.enqueueOperation(intent);
      const claim = store.claimOperation(intent.id, 'worker-one')!;
      fail();
      expect(() => store.completeOperation(intent.id, claim.claimToken!, { kind: 'created', remoteId: 'test-remote' })).toThrow();
      expect(store.getOperation(intent.id)).toEqual(claim);
    } finally { db.close(); }
  });

  it('requires an incident and validates all operation inputs', () => {
    const { store } = open();
    expect(() => store.enqueueOperation(intent)).toThrow();
    expect(store.getOperation(intent.id)).toBeNull();
    store.createIncident(incident());
    expect(() => store.enqueueOperation({ ...intent, extra: true })).toThrow();
    store.enqueueOperation(intent);
    expect(() => store.claimOperation(intent.id, '')).toThrow();
    expect(() => store.completeOperation(intent.id, 'token', { kind: 'created', remoteId: '' })).toThrow();
    expect(store.getOperation(intent.id)?.status).toBe('pending');
  });
});

it('persists the service log across reopening without inventing repeated intake', () => {
  const {store,path}=open();
  store.ingest('fixture:run','a'.repeat(64),{kind:'run'},null);
  const sequence=store.activity()[0].sequence;
  close(store);
  const reopened=open(path).store;
  expect(reopened.ingest('fixture:run','a'.repeat(64),{kind:'run'},null).duplicate).toBe(true);
  expect(reopened.activity()).toHaveLength(1);
  expect(reopened.activity()[0].sequence).toBe(sequence);
});

it('rolls back incident and service events together when evidence is malformed', () => {
  const {store}=open();const input=incident();store.createIncident(input);
  const prior=store.activity().length;
  expect(()=>store.advance(input.id,0,'reproducing',{now:input.createdAt,activeRemoteSessions:0,activeLocalProcesses:0},
    [{type:'gate.finished',payload:{result:{}}}])).toThrow();
  expect(store.getIncident(input.id)?.status).toBe('received');
  expect(store.activity()).toHaveLength(prior);
});
