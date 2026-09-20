import type { ControllerStore } from './store';
import { projectReadiness } from './overview';
import { isTerminal } from '../contracts/lifecycle';

export const HEARTBEAT_MS = 10 * 60 * 1000;

/** Review the controller's current evidence; never mint spending authority. */
export async function reviewProject(store: ControllerStore, checkout?: string, now = Date.now(), reviewMinutes = 10,
  maintenance: Array<{id:string;state:string;updatedAt:string;reason?:string}> = []) {
  const intervalMs = Math.max(1, Math.min(60, reviewMinutes)) * 60000;
  const prior = store.orchestratorHeartbeat();
  if (prior && Date.parse(prior.nextCheckAt) > now) return false;
  const project = await projectReadiness(checkout);
  const { incidents, pendingRecords, service } = store.reviewInputs();
  const actions: { kind: string; summary: string; incidentId?: string }[] = [];
  if (!project.repositoryAvailable) actions.push({ kind: 'project_unavailable', summary: 'Check project checkout access.' });
  else if (prior?.project?.head && prior.project.head !== project.head)
    actions.push({ kind: 'project_changed', summary: 'Project revision changed; refresh reproduction and acceptance evidence before repair.' });
  if (pendingRecords) actions.push({ kind: 'triage', summary: `${pendingRecords} received records need triage; reception alone does not establish a defect.` });
  if (service.intake.status !== 'watching' || !service.intake.checkedAt || now-Date.parse(service.intake.checkedAt)>60000)
    actions.push({ kind: 'intake_health', summary: 'Check intake health or stale intake polling.' });
  for (const incident of incidents) {
    if (isTerminal(incident.status)) continue;
    const job=maintenance.find(job=>job.id===incident.id);
    if(job){
      // Candidate-only maintenance has its own durable QA lifecycle. Its incident
      // remains engineering until a separate release decision; that is not a stall.
      if(['blocked','retryable'].includes(job.state))actions.push({kind:'maintenance_attention',incidentId:incident.id,summary:`Maintenance ${job.state}: ${job.reason??'review recorded verification evidence'}.`});
      else if(job.state==='verifying'&&now-Date.parse(job.updatedAt)>HEARTBEAT_MS)actions.push({kind:'stalled_verification',incidentId:incident.id,summary:'Independent maintenance verification has not reported progress for over 10 minutes.'});
      continue;
    }
    if (incident.status === 'blocked') actions.push({ kind: 'blocked_incident', incidentId: incident.id, summary: `Resolve incident blocker: ${incident.block?.reason ?? 'unknown'}.` });
    else if (now-Date.parse(incident.updatedAt)>HEARTBEAT_MS)
      actions.push({ kind: 'stalled_incident', incidentId: incident.id, summary: 'Review incident with no state transition for over 10 minutes.' });
  }
  for (const session of service.engineeringSpend.sessions) {
    if (session.state === 'held' || session.state === 'reserved') actions.push({ kind: 'reconcile_session', incidentId: session.incidentId, summary: 'Reconcile held or reserved session before further dispatch.' });
    if (session.state === 'running' && (!session.observedAt || now-Date.parse(session.observedAt)>60000))
      actions.push({ kind: 'stale_session', incidentId: session.incidentId, summary: 'Provider observation is stale; inspect the existing session.' });
  }
  for (const work of service.workQueue) if(work.state==='blocked') actions.push({kind:'work_blocked',summary:work.result?.nextAction??'Review the blocked work item before continuing.'});
  if (incidents.some(i=>!isTerminal(i.status)) && !service.provider.paidDispatchEnabled)
    actions.push({ kind: 'dispatch_blocked', summary: service.provider.explanation ?? 'Finalize provider and task authorization.' });
  return store.saveOrchestratorHeartbeat({ checkedAt:new Date(now).toISOString(),nextCheckAt:new Date(now+intervalMs).toISOString(),
    intervalMs,status:actions.length?'attention':'healthy',project,actions,
    stats:{receivedRecords:service.receivedRecords,progressEvents:service.progressEvents,pendingRecords,incidents:incidents.length,runningSessions:service.engineeringSpend.sessions.filter(s=>s.state==='running').length},
    executionMode:'local_review',paidCalls:0 });
}
