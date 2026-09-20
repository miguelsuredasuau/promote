import { ControllerStore } from './store';
import {rolePrompt} from './role-prompts';
import type { HarnessAdapter } from '../contracts/adapters';

/** Reservations and intent commit before a network call. This boundary does not authorize release. */
export async function dispatchEngineering(store:ControllerStore, adapter:HarnessAdapter, mandate:unknown, task:unknown) {
  const reservation=store.reserveEngineering(mandate,task);
  const claim=store.claimOperation(reservation.operationId,'engineering-dispatch');
  if(!claim)return {status:'already_dispatched_or_held',incidentId:reservation.incidentId};
  const prompt=rolePrompt('engineer');
  store.recordActivity('provider','Sending Devin session creation',{incidentId:reservation.incidentId,operationId:reservation.operationId,promptVersion:prompt.version,promptHash:prompt.hash});
  let outcome;
  try{outcome=await adapter.start(reservation.task,reservation.operationId);}
  catch{outcome={kind:'unknown_outcome' as const,reason:'transport_unknown'};}
  store.completeOperation(reservation.operationId,claim.claimToken!,outcome);
  if(outcome.kind==='created')store.updateEngineering(reservation.incidentId,{state:'running',remoteId:outcome.remoteId});
  else store.updateEngineering(reservation.incidentId,{state:'held',reason:outcome.reason});
  return outcome;
}

export async function observeEngineering(store:ControllerStore, adapter:HarnessAdapter) {
  for(const reservation of store.engineeringReservations()){
    if(!reservation.remoteId){
      const operation=store.getOperation(reservation.operationId);
      if(operation?.outcome?.kind==='created'){
        reservation.remoteId=operation.outcome.remoteId;
        store.updateEngineering(reservation.incidentId,{remoteId:reservation.remoteId,state:'running'});
      }else continue;
    }
    try{
      if(reservation.state==='stopped'){
        // Billing may arrive after termination. Read it without resuming work.
        const observation=await adapter.inspect(reservation.remoteId);
        store.updateEngineering(reservation.incidentId,{usageAcu:observation.usage?.amount??null,usageObservedAt:observation.observedAt});
        continue;
      }
      const incident=store.getIncident(reservation.incidentId)!;
      if(incident.cancellation || Date.parse(reservation.task.deadline)<=Date.now()){
        const result=await adapter.cancel(reservation.remoteId,`cancel:${reservation.incidentId}`);
        store.updateEngineering(reservation.incidentId,{state:result.kind==='confirmed'?'stopped':'held',reason:result.kind==='confirmed'?'termination_confirmed':'termination_pending'});
        continue;
      }
      const observation=await adapter.inspect(reservation.remoteId);
      store.updateEngineering(reservation.incidentId,{usageAcu:observation.usage?.amount??null,usageObservedAt:observation.observedAt,
        candidateSha:observation.candidateSha,state:observation.state==='unknown'?'held':'running'});
      if(observation.candidateSha || ['finished','failed','cancelled'].includes(observation.state)){
        const termination=await adapter.cancel(reservation.remoteId,`stop:${reservation.incidentId}`);
        store.updateEngineering(reservation.incidentId,{state:termination.kind==='confirmed'?'stopped':'held',reason:observation.candidateSha?'candidate_awaiting_independent_evaluation':'session_ended_without_candidate'});
        // Stop spending while candidate transport/evaluation is pending. No success/release claim.
      }
    }catch{
      if(reservation.state!=='stopped')store.updateEngineering(reservation.incidentId,{state:'held',reason:'provider_observation_unavailable'});
    }
  }
}
