import { serialWork, markFailure } from './serial-work';
import { ControllerStore } from './store';
import {rolePrompt} from './role-prompts';
import type { FeedbackOutcome, HarnessAdapter } from '../contracts/adapters';
import { authorizeEngineering } from '../contracts/mandate';
import { observationQueue } from './observation-queue';

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

const observing=new WeakSet<ControllerStore>();
export async function observeEngineering(store:ControllerStore, adapter:HarnessAdapter, clock:number|(()=>number)=Date.now) {
  if(observing.has(store))return;
  observing.add(store);
  const currentTime=typeof clock==='function'?clock:()=>clock;
  try {
  const rows=observationQueue(store,store.engineeringReservations(),currentTime(),r=>({key:`engineering:${r.incidentId}`,terminal:r.state==='stopped',remoteId:r.remoteId,observedAt:r.usageObservedAt}));
  await serialWork(rows, async reservation => {
    let now=currentTime();
    if(!reservation.remoteId){
      const operation=store.getOperation(reservation.operationId);
      if(operation?.outcome?.kind==='created'){
        reservation.remoteId=operation.outcome.remoteId;
        store.updateEngineering(reservation.incidentId,{remoteId:reservation.remoteId,state:'running'});
      }else return;
    }
    try{
      if(reservation.state==='stopped'){
        // Billing may arrive after termination. Read it without resuming work.
        const observation=await adapter.inspect(reservation.remoteId);
        store.updateEngineering(reservation.incidentId,{usageAcu:observation.usage?.amount??null,usageObservedAt:observation.observedAt});
        return;
      }
      const incident=store.getIncident(reservation.incidentId)!;
      if(incident.cancellation || Date.parse(reservation.task.deadline)<=now){
        // Expiry forbids continuation, not collection. Preserve a candidate that
        // arrived while the controller was offline before closing its session.
        try {
          const observation=await adapter.inspect(reservation.remoteId);
          store.updateEngineering(reservation.incidentId,{usageAcu:observation.usage?.amount??null,usageObservedAt:observation.observedAt,
            candidateSha:observation.candidateSha??reservation.candidateSha});
        } catch { /* A failed result read must not prevent the stop request. */ }
        const result=await adapter.cancel(reservation.remoteId,`cancel:${reservation.incidentId}`);
        store.updateEngineering(reservation.incidentId,{state:result.kind==='confirmed'?'stopped':'held',reason:result.kind==='confirmed'?'termination_confirmed':result.kind==='failed'?result.reason:'termination_pending'});
        return;
      }
      const observation=await adapter.inspect(reservation.remoteId);
      now=currentTime();
      store.updateEngineering(reservation.incidentId,{usageAcu:observation.usage?.amount??null,usageObservedAt:observation.observedAt,
        candidateSha:observation.candidateSha??reservation.candidateSha,state:['unknown','waiting'].includes(observation.state)?'held':'running'});
      if(observation.qualityReview)store.recordActivity('verification','Devin reported Norma diagnostics (not independent acceptance)',{incidentId:reservation.incidentId,review:observation.qualityReview,evidenceSource:'engineering_agent'});
      const expired=Date.parse(reservation.task.deadline)<=now;
      const exhausted=Math.max(reservation.usageAcu??0,observation.usage?.amount??0)>=reservation.maxAcu;
      if(observation.candidateSha || reservation.candidateSha || expired || exhausted || ['finished','failed','cancelled'].includes(observation.state)){
        const termination=await adapter.cancel(reservation.remoteId,`stop:${reservation.incidentId}`);
        store.updateEngineering(reservation.incidentId,{state:termination.kind==='confirmed'?'stopped':'held',reason:termination.kind==='failed'?termination.reason:termination.kind!=='confirmed'?'termination_pending':observation.candidateSha||reservation.candidateSha?'candidate_awaiting_independent_evaluation':expired?'deadline_reached':exhausted?'acu_ceiling_reached':'session_ended_without_candidate'});
        // Stop spending while candidate transport/evaluation is pending. No success/release claim.
      } else if(observation.state==='waiting') {
        const hold=(reason:string)=>store.updateEngineering(reservation.incidentId,{state:'held',reason});
        if(observation.waitingReason==='approval'){hold('provider_approval_required');return;}
        if(observation.waitingReason!=='user'||!adapter.continueTask){hold('continuation_unsupported');return;}
        // The frozen mandate binds repository, task hash, paths, deadline and original ceiling.
        try{authorizeEngineering(store.engineeringMandate(reservation.mandateId),reservation.task,now);}
        catch{hold('continuation_mandate_invalid');return;}
        const policy=store.operatingPolicy()?.policy,budget=store.operatingBudget(now);
        if(!policy||policy.paused||!policy.approvedRepairs||Date.parse(policy.expiresAt)<=now||policy.sessionAcu<reservation.maxAcu||policy.dailyAcu<budget.committedAcu||policy.totalAcu<budget.totalCommittedAcu){hold('continuation_not_authorized');return;}
        const currentIncident=store.getIncident(reservation.incidentId);
        if(!currentIncident||currentIncident.cancellation||currentIncident.status!=='engineering'){hold('continuation_incident_not_engineering');return;}
        const attempts:Array<{id:string;at:string;outcome:string}>=store.engineeringReservation(reservation.incidentId).continuations??[];
        if(attempts.some(a=>!['delivered','rejected'].includes(a.outcome))){hold('continuation_outcome_uncertain');return;}
        if(attempts.length>=2){hold('continuation_limit_reached');return;}
        const previous=attempts.at(-1);
        if(previous&&(!Number.isFinite(Date.parse(previous.at))||now-Date.parse(previous.at)<120000)){hold('continuation_cooldown');return;}
        const intent={id:`continue:engineering:${reservation.incidentId}:${attempts.length+1}`,at:new Date(now).toISOString(),outcome:'pending'};
        store.updateEngineering(reservation.incidentId,{continuations:[...attempts,intent],reason:'continuation_pending'});
        let result:FeedbackOutcome;
        try{result=await adapter.continueTask(reservation.remoteId,reservation.task,intent.id);}
        catch{result={kind:'unknown_outcome',reason:'continuation_transport_uncertain'};}
        store.updateEngineering(reservation.incidentId,{continuations:[...attempts,{...intent,outcome:result.kind}],reason:result.kind==='delivered'?'continuation_sent_awaiting_observation':result.reason});
      }
    }catch{
      if(reservation.state!=='stopped')store.updateEngineering(reservation.incidentId,{state:'held',reason:'provider_observation_unavailable'});
    }
  });
  } catch(error) { throw markFailure(error, 'observeEngineering'); }
  finally {observing.delete(store);}
}
