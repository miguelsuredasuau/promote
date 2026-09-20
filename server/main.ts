import { projectEnvironment } from './environment.mjs';
import { createMaintenanceLoop, maintenanceProfiles } from './maintenance';
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
const environment = projectEnvironment(root);
const checkout = environment.PROMOTE_PROJECT_PATH;
const testCheckout = environment.PROMOTE_TEST_PROJECT_PATH ?? join(root, '../xarts-chat');
const database = environment.PROMOTE_DATABASE ?? join(root, '.local/controller.sqlite');
const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
mkdirSync(dirname(database), { recursive: true });
const store = new ControllerStore(database);
let orchestrating=false;
async function orchestrate(){if(orchestrating)return;orchestrating=true;try{await runOrchestrator(store,root,checkout);}finally{orchestrating=false;}}
let observing = false;
let providerState = '';
async function pollEngineering() {
  if (observing) return;
  observing = true;
  try {
    const config = loadDevin(root);
    if (config.adapter) {
      // Each observer owns its lock; historical engineering usage must not delay
      // live exploration deadline checks. Store writes remain synchronous.
      const observations=await Promise.allSettled([observeEngineering(store,config.adapter),observeExplorations(store,config.adapter)]);
      for(const result of observations)if(result.status==='rejected')console.error('Provider observation lane failed; other lane continued');
    }
    const running=store.engineeringReservations().filter(r=>r.state==='running');
    const candidate=executionBindings(root).some(b=>store.engineeringReservation(b.task.incidentId)?.candidateSha);
    const operating = store.operatingPolicy()?.policy;
    const autonomous = !!operating && !operating.paused && Date.parse(operating.expiresAt) > Date.now()
      && !!config.adapter && config.status.status !== 'awaiting_billing_verification';
    const budget = store.operatingBudget();
    const minimumDispatchAcu = operating ? Math.min(operating.sessionAcu,...(operating.approvedRepairs?maintenanceProfiles(root).map(profile=>profile.maxAcu??operating.sessionAcu):[])) : Infinity;
    const dispatchCapacity = !!operating && (budget.totalRemainingAcu??0)>=minimumDispatchAcu && (budget.remainingAcu??0)>=minimumDispatchAcu;
    const status = running.length ? {...config.status,status:'engineering_running',automaticDispatch:autonomous,
      paidDispatchEnabled:(autonomous && dispatchCapacity) || (!operating && config.status.paidDispatchEnabled),
      explanation:`${running.length} Devin sessions running. Promote independently checks returned candidates.`}
      : autonomous ? {...config.status,status:dispatchCapacity?'autonomous_review_active':'budget_reserved',automaticDispatch:true,paidDispatchEnabled:dispatchCapacity,
        explanation:dispatchCapacity?'Promote reviews scoped maintenance work and sandbox tests within the saved operating limits.':'Session ceilings occupy the campaign budget. Observation and QA continue; new paid sessions await budget reconciliation.'}
      : candidate ? {...config.status,status:'candidate_returned',explanation:'A historical candidate is recorded; no new autonomous session is running.'}
      : config.status;
    status.connectionVerified=store.engineeringReservations().some(r=>r.usageObservedAt && Date.now()-Date.parse(r.usageObservedAt)<60000);
    store.providerStatus(status);
    if (providerState !== status.status) {
      providerState = status.status;
      store.recordActivity('provider', 'Engineering provider readiness changed', status);
    }

    if(executionBindings(root).some(b=>{const r=store.engineeringReservation(b.task.incidentId);return r?.state==='stopped'&&r.candidateSha&&!store.workQueue().some(w=>w.payload?.proposalId===b.proposalId&&w.payload?.deliveryTask?.candidateSha===r.candidateSha&&w.payload?.deliveryTask?.attempt===b.delivery.attempt);}))void orchestrate().catch(()=>console.error('Proposal delivery scheduling failed; evidence retained'));
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
// Historical usage reconciliation must not hold the local UI offline at startup.
void pollEngineering().catch(() => console.error('Initial engineering observation failed; scheduled observation will retry'));
const maintenance = createMaintenanceLoop(store, root, testCheckout);
const heartbeat = createScheduledReview({
  due: () => {
    const prior = store.orchestratorHeartbeat();
    return !prior || Date.parse(prior.nextCheckAt) <= Date.now();
  },
  orchestrate,
  review: () => reviewProject(store, checkout, Date.now(), store.operatingPolicy()?.policy.reviewMinutes, maintenance.journal.all()),
  report: message => console.error(message),
});
// Verification can take minutes; the activity server must remain observable.
void heartbeat();
void maintenance.tick();
const maintenanceTimer = setInterval(() => { void maintenance.tick(); }, 10000);
const heartbeatTimer = setInterval(heartbeat, 30000);
const engineeringTimer = setInterval(() => { void pollEngineering().catch(() => console.error('Engineering observation failed')); }, 15000);
const inboxTimer = outbox ? setInterval(importFeedback, 3000) : null;
const server = createOperatorServer({ root, store, checkout: checkout, testCheckout });
server.listen(port, '127.0.0.1', () => console.log(`Promoted operator: http://127.0.0.1:${port} (owner planning decisions enabled)`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { clearInterval(maintenanceTimer); clearInterval(heartbeatTimer); clearInterval(engineeringTimer); if (inboxTimer) clearInterval(inboxTimer); server.close(() => { process.exit(0); }); });
}
