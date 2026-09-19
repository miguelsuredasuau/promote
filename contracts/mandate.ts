import { z } from 'zod';
import { EngineeringTask } from './adapters';
import { hashCanonical } from './hash';
import { Id, Timestamp, Sha256 } from './primitives';

/** Native ACU authority, not an inferred USD exchange rate. No default budget. */
export const EngineeringMandate = z.object({
  schemaVersion:z.literal(1),id:Id,approvedBy:z.string().min(1),approvedAt:Timestamp,expiresAt:Timestamp,
  taskHashes:z.record(Sha256),incidentIds:z.array(Id).min(1),repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  maxSessionAcu:z.number().int().positive(),totalAcu:z.number().int().positive(),maxConcurrentSessions:z.literal(1),
  releaseDestination:z.literal('candidate_branch_only'),
}).strict().refine(m=>m.totalAcu>=m.maxSessionAcu&&Date.parse(m.expiresAt)>Date.parse(m.approvedAt),'invalid mandate limits');
export type EngineeringMandate = z.infer<typeof EngineeringMandate>;
export function authorizeEngineering(input:unknown,taskInput:unknown,now=Date.now()) {
  const mandate=EngineeringMandate.parse(input),task=EngineeringTask.parse(taskInput);
  if(now<Date.parse(mandate.approvedAt)||now>=Date.parse(mandate.expiresAt))throw new Error('mandate_expired_or_not_active');
  if(!mandate.incidentIds.includes(task.incidentId)||mandate.repository!==task.repo)throw new Error('outside_mandate_scope');
  if(Date.parse(task.deadline)>Date.parse(mandate.expiresAt)||Date.parse(task.deadline)<=now)throw new Error('task_deadline_outside_mandate');
  if(mandate.taskHashes[task.incidentId]!==hashCanonical(task))throw new Error('task_revision_not_approved');
  if(task.providerExtension.maxAcu!==mandate.maxSessionAcu)throw new Error('session_budget_mismatch');
  return {mandate,task};
}
