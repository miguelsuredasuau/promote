import { evaluationSnapshots } from './qa';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ControllerStore } from './store';
import { ownerReport } from './owner-report';

const exec = promisify(execFile);
export async function projectReadiness(checkout: string | undefined) {
  if (!checkout) return { configured: false, repositoryAvailable: false, head: null };
  try {
    const { stdout } = await exec('git', ['rev-parse', '--show-toplevel', 'HEAD'], { cwd: checkout, timeout: 2000 });
    const head = stdout.trim().split('\n').at(-1)!;
    return { configured: true, repositoryAvailable: /^[a-f0-9]{40,64}$/.test(head), head };
  } catch {
    // Do not expose filesystem paths, environment or Git error output to the browser.
    return { configured: true, repositoryAvailable: false, head: null };
  }
}
export async function overview(root: string, store: ControllerStore, checkout?: string) {
  const [implementation, catalog, readiness] = await Promise.all([
    readFile(join(root, 'docs/implementation-status.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'adapters/xarts/gate-catalog.json'), 'utf8').then(JSON.parse),
    projectReadiness(checkout),
  ]);
  const snapshot = store.operatorSnapshot();
  const inbox = store.inboxSnapshot();
  const report = ownerReport(snapshot.incidents);
  return {
    orchestrator: store.orchestratorHeartbeat(), operationsOverview: store.serviceSnapshot(), inbox, chatActivity: store.chatActivity(), evaluations: evaluationSnapshots(store),
    ownerReport: { ...report, feedback: { status: inbox.length ? 'receiving' : 'not_connected', items: inbox } },
    mode: 'live', observedAt: new Date().toISOString(), implementation,
    project: {
      id: 'xarts', name: 'Xarts', ...readiness, adapterStatus: 'catalog_only',
      providerStatus: store.serviceSnapshot().provider.status, revisionMatchesCatalog: readiness.head !== null && readiness.head === catalog.sourceRevision,
      catalog,
    },
    ...snapshot,
  };
}
