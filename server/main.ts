import {executionBindings} from './improvements';
import { createScheduledReview } from './scheduled-review';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ControllerStore } from './store';
import { importChatCycle } from './chat-intake';
import { createOperatorServer } from './http';
import { loadDevin } from './devin-config';
import { observeExplorations } from './exploration';
import { observeEngineering } from './engineering';
import { reviewProject } from './heartbeat';
import { runOrchestrator } from './orchestrator';

const root = fileURLToPath(new URL('../', import.meta.url));
const database = process.env.PROMOTE_DATABASE ?? join(root, '.local/controller.sqlite');
const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
mkdirSync(dirname(database), { recursive: true });
const store = new ControllerStore(database);
let orchestrating=false;
async function orchestrate(){if(orchestrating)return;orchestrating=true;try{await runOrchestrator(store,root,process.env.PROMOTE_PROJECT_PATH);}finally{orchestrating=false;}}
let observing = false;
let providerState = '';
async function pollEngineering() {
  if (observing) return;
  observing = true;
  try {
    const config = loadDevin(root);
    const running=store.engineeringReservations().filter(r=>r.state==='running');
    store.providerStatus(running.length?{...config.status,status:'engineering_running',explanation:'Devin is working on an authorized task. Usage is reported by the provider; release still requires independent verification.'}:config.status);
    if (providerState !== config.status.status) {
      providerState = config.status.status;
      store.recordActivity('provider', 'Engineering provider readiness changed', config.status);
    }
    if (config.adapter) { await observeEngineering(store, config.adapter); await observeExplorations(store,config.adapter); }
    if(executionBindings(root).some(b=>{const r=store.engineeringReservation(b.task.incidentId);return r?.state==='stopped'&&r.candidateSha&&!store.workQueue().some(w=>w.payload?.proposalId===b.proposalId&&w.payload?.deliveryTask?.candidateSha===r.candidateSha);}))void orchestrate().catch(()=>console.error('Proposal delivery scheduling failed; evidence retained'));
  } finally { observing = false; }
}
let importing = false;
let intakeFailure = '';
const configPath = join(root, '.local/integration.json');
const localConfig = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const outbox = process.env.PROMOTE_CHAT_OUTBOX ?? localConfig.chatOutbox;
async function importFeedback() {
  if (!outbox || importing) return;
  importing = true;
  try {
    const result = await importChatCycle(store, outbox, join(dirname(database), 'chat-receipts'));
    store.serviceHeartbeat(result);
    const failure = JSON.stringify(result.failures);
    if (result.failures.length) {
      if (failure !== intakeFailure) {
        store.recordActivity('error', 'Chat intake source failed; other sources continue', { failures: result.failures });
        console.error(JSON.stringify({ event: 'chat_intake_failed', failures: result.failures }));
      }
      intakeFailure = failure;
    } else {
      if (intakeFailure) store.recordActivity('service', 'Chat intake recovered');
      intakeFailure = '';
    }
    if (result.records?.imported || result.diagnostics || result.progress) console.log(JSON.stringify({ at: new Date().toISOString(), event: 'chat_intake', ...result }));
  }
  catch {
    console.error(JSON.stringify({ event: 'chat_intake_failed', reason: 'intake_status_persistence_failed' }));
    intakeFailure = 'intake_status_persistence_failed';
  }
  finally { importing = false; }
}
store.recordActivity('service', 'Promoted service started', { intakeConfigured: !!outbox, providerConnected: false, paidDispatchEnabled: false });
if (!outbox) store.serviceHeartbeat({ status: 'not_configured', configured: false });
await importFeedback();
await pollEngineering();
const heartbeat = createScheduledReview({
  due: () => {
    const prior = store.orchestratorHeartbeat();
    return !prior || Date.parse(prior.nextCheckAt) <= Date.now();
  },
  orchestrate,
  review: () => reviewProject(store, process.env.PROMOTE_PROJECT_PATH),
  report: message => console.error(message),
});
// Verification can take minutes; the activity server must remain observable.
void heartbeat();
const heartbeatTimer = setInterval(heartbeat, 30000);
const engineeringTimer = setInterval(() => { void pollEngineering().catch(() => console.error('Engineering observation failed')); }, 15000);
const inboxTimer = outbox ? setInterval(importFeedback, 3000) : null;
const server = createOperatorServer({ root, store, checkout: process.env.PROMOTE_PROJECT_PATH, testCheckout:process.env.PROMOTE_TEST_PROJECT_PATH ?? join(root,"../xarts-chat") });
server.listen(port, '127.0.0.1', () => console.log(`Promoted operator: http://127.0.0.1:${port} (owner planning decisions enabled)`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { clearInterval(heartbeatTimer); clearInterval(engineeringTimer); if (inboxTimer) clearInterval(inboxTimer); server.close(() => { process.exit(0); }); });
}
