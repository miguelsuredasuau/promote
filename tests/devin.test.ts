import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DevinAdapter } from '../adapters/devin/client';
import { authorizeEngineering } from '../contracts/mandate';
import { hashCanonical } from '../contracts/hash';
import { ControllerStore } from '../server/store';
import { dispatchEngineering, observeEngineering } from '../server/engineering';
import { loadDevin } from '../server/devin-config';
import { scenarioBuilder } from '../fixtures/contracts/factories';
const roots:string[]=[],stores:ControllerStore[]=[];
afterEach(()=>{stores.splice(0).forEach(s=>s.close());roots.splice(0).forEach(r=>rmSync(r,{recursive:true,force:true}));});
function setup(){
 const dir=mkdtempSync(join(tmpdir(),'devin-test-'));roots.push(dir);
 const store=new ControllerStore(join(dir,'db.sqlite'));stores.push(store);
 const incident=scenarioBuilder('devin','Synthetic provider test').finish([]).incident;
 store.createIncident(incident);
 const context={now:new Date().toISOString(),activeRemoteSessions:0,activeLocalProcesses:0};
 store.advance(incident.id,0,'reproducing',context);store.advance(incident.id,1,'engineering',context);
 const task={incidentId:incident.id,repo:'example/library',baseSha:incident.baseCommit,reproductionArtifactIds:[],contractSummary:'Fix the SDK build',allowedPaths:['src'],protectedPaths:['policy'],resultSchemaId:'candidate-v1',deadline:new Date(Date.now()+60000).toISOString(),providerExtension:{maxAcu:2,branch:'promote/test'}};
 const mandate={schemaVersion:1 as const,id:'test-mandate',approvedBy:'test',approvedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+120000).toISOString(),taskHashes:{[incident.id]:hashCanonical(task)},incidentIds:[incident.id],repository:task.repo,maxSessionAcu:2,totalAcu:2,maxConcurrentSessions:1 as const,releaseDestination:'candidate_branch_only' as const};
 return{dir,store,task,mandate};
}
function adapter(fetcher:ReturnType<typeof vi.fn>){return new DevinAdapter({organizationId:'org-test',apiKey:'synthetic-test-key'},fetcher as typeof fetch);}
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
it('sends a native ceiling and correlation ID without credentials in the task',async()=>{
 const s=setup(),fetcher=vi.fn().mockResolvedValue(response({session_id:'session',status:'new'}));
 expect(await adapter(fetcher).start(s.task,'create:test')).toEqual({kind:'created',remoteId:'devin-session'});
 const [url,options]=fetcher.mock.calls[0],body=JSON.parse(options.body);
 expect(url).toBe('https://api.devin.ai/v3/organizations/org-test/sessions');
 expect(body.max_acu_limit).toBe(2);expect(body.tags).toContain('promote-operation:create:test');
 expect(options.body).not.toContain('synthetic-test-key');expect(options.redirect).toBe('error');
});
it.each([500,408])('holds HTTP %s without retries',async status=>{
 const s=setup(),fetcher=vi.fn().mockResolvedValue(response({},status));
 expect((await adapter(fetcher).start(s.task,'create:test')).kind).toBe('unknown_outcome');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('holds malformed creation responses',async()=>{
 const s=setup(),fetcher=vi.fn().mockResolvedValue(response({}));
 expect((await adapter(fetcher).start(s.task,'create:test')).kind).toBe('unknown_outcome');
});
it('distinguishes zero usage from missing usage and rejects a different session identity',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response({session_id:'s',status:'running',acus_consumed:0})).mockResolvedValueOnce(response({session_id:'s',status:'running'})).mockResolvedValueOnce(response({session_id:'other',status:'running'}));
 const a=adapter(fetcher);expect((await a.inspect('devin-s')).usage?.amount).toBe(0);
 expect((await a.inspect('devin-s')).usage?.amount).toBeNull();await expect(a.inspect('devin-s')).rejects.toThrow('identity');
});
it('requires observed exit before confirming termination',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({session_id:'s',status:'running'})).mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({session_id:'s',status:'exit'}));
 const a=adapter(fetcher);expect((await a.cancel('devin-s','stop:test')).kind).toBe('requested');expect((await a.cancel('devin-s','stop:test')).kind).toBe('confirmed');
});
it('binds authorization to the exact task, scope, deadline and ACU amount',()=>{
 const s=setup();expect(authorizeEngineering(s.mandate,s.task).task).toEqual(s.task);
 expect(()=>authorizeEngineering(s.mandate,{...s.task,contractSummary:'Other work'})).toThrow('not_approved');
 expect(()=>authorizeEngineering({...s.mandate,repository:'other/repo'},s.task)).toThrow('scope');
 expect(()=>authorizeEngineering({...s.mandate,maxSessionAcu:1},s.task)).toThrow('budget_mismatch');
 expect(()=>authorizeEngineering(s.mandate,s.task,Date.now()+180000)).toThrow('expired');
});
it('dispatches once across repeated calls and reopening, with durable reservation before network',async()=>{
 const s=setup(),fetcher=vi.fn().mockImplementation(async()=>{expect(s.store.engineeringSpend().committedCeilings).toBe(2);return response({session_id:'s',status:'new'});});
 const a=adapter(fetcher);await dispatchEngineering(s.store,a,s.mandate,s.task);
 const reopened=new ControllerStore(join(s.dir,'db.sqlite'));stores.push(reopened);
 await dispatchEngineering(reopened,a,s.mandate,s.task);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(reopened.engineeringSpend().reportedUsage).toBeNull();expect(reopened.engineeringSpend().dollarCost).toBeNull();
});
it('keeps uncertain creation held and never resends',async()=>{
 const s=setup(),fetcher=vi.fn().mockRejectedValue(new Error('network failure'));const a=adapter(fetcher);
 await dispatchEngineering(s.store,a,s.mandate,s.task);await dispatchEngineering(s.store,a,s.mandate,s.task);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(s.store.engineeringReservation(s.task.incidentId).state).toBe('held');
});
it('does not call a provider without valid authorization',async()=>{
 const s=setup(),fetcher=vi.fn();await expect(dispatchEngineering(s.store,adapter(fetcher),{},s.task)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
it('never adds repeated cumulative usage and stops when a candidate is returned',async()=>{
 const s=setup();s.store.reserveEngineering(s.mandate,s.task);s.store.updateEngineering(s.task.incidentId,{state:'running',remoteId:'devin-s'});
 for(const n of [1.2,1.2,0.9])s.store.updateEngineering(s.task.incidentId,{usageAcu:n});expect(s.store.engineeringSpend().reportedUsage).toBe(1.2);
 const fetcher=vi.fn().mockResolvedValueOnce(response({session_id:'s',status:'running',acus_consumed:1.5,structured_output:{candidateSha:'a'.repeat(40)}})).mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({session_id:'s',status:'exit'}));
 await observeEngineering(s.store,adapter(fetcher));expect(s.store.engineeringSpend().reportedUsage).toBe(1.5);expect(s.store.engineeringReservation(s.task.incidentId).state).toBe('stopped');
 expect(s.store.getIncident(s.task.incidentId)?.status).toBe('engineering');
});
it('reports missing credentials without exposing local configuration',()=>{
 const s=setup();expect(loadDevin(s.dir,{}).status).toMatchObject({status:'credentials_missing',paidDispatchEnabled:false,connectionVerified:false});
});
it('blocks another incident while a reservation is unresolved and enforces the total ceiling after stop',()=>{
 const s=setup();const incident=scenarioBuilder('second-devin','Second synthetic task').finish([]).incident;
 s.store.createIncident(incident);const ctx={now:new Date().toISOString(),activeRemoteSessions:0,activeLocalProcesses:0};
 s.store.advance(incident.id,0,'reproducing',ctx);s.store.advance(incident.id,1,'engineering',ctx);
 const task={...s.task,incidentId:incident.id,baseSha:incident.baseCommit};
 const mandate={...s.mandate,incidentIds:[s.task.incidentId,incident.id],taskHashes:{...s.mandate.taskHashes,[incident.id]:hashCanonical(task)}};
 s.store.reserveEngineering(mandate,s.task);
 expect(()=>s.store.reserveEngineering(mandate,task)).toThrow('slot');
 s.store.updateEngineering(s.task.incidentId,{state:'stopped',usageAcu:0});
 expect(()=>s.store.reserveEngineering(mandate,task)).toThrow('budget');
});
it('recovers a persisted creation result after a crash before reservation update',async()=>{
 const s=setup(),r=s.store.reserveEngineering(s.mandate,s.task),claim=s.store.claimOperation(r.operationId,'test-worker')!;
 s.store.completeOperation(r.operationId,claim.claimToken!,{kind:'created',remoteId:'devin-s'});
 const fetcher=vi.fn().mockResolvedValue(response({session_id:'s',status:'running',acus_consumed:0.5}));
 await observeEngineering(s.store,adapter(fetcher));expect(fetcher.mock.calls[0][1].method).toBe('GET');
 expect(s.store.engineeringReservation(s.task.incidentId)).toMatchObject({remoteId:'devin-s',state:'running',usageAcu:0.5});
});
it('continues collecting delayed billing after confirmed termination',async()=>{
 const s=setup();s.store.reserveEngineering(s.mandate,s.task);s.store.updateEngineering(s.task.incidentId,{state:'stopped',remoteId:'devin-s',usageAcu:1});
 const fetcher=vi.fn().mockResolvedValue(response({session_id:'s',status:'exit',acus_consumed:1.8}));
 await observeEngineering(s.store,adapter(fetcher));expect(s.store.engineeringSpend().reportedUsage).toBe(1.8);
 expect(s.store.engineeringReservation(s.task.incidentId).state).toBe('stopped');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('recognizes observed termination when an already exited session rejects DELETE',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response({},409)).mockResolvedValueOnce(response({session_id:'s',status:'exit'}));
 expect((await adapter(fetcher).cancel('devin-s','stop:test')).kind).toBe('confirmed');
});

it('requires a Norma report in new task output and includes the advisory workflow',async()=>{
 const s=setup();const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(String(init.body));
 expect(body.prompt).toContain('Norma quality review (advisory)');expect(body.structured_output_schema.required).toContain('normaReview');
 return Response.json({session_id:'new-review',status:'new'});
 });await adapter(fetcher).start(s.task,'test-review');
});
it('marks a reduced-coverage agent claim pending and binds it to the candidate',async()=>{
 const candidateSha='a'.repeat(40);const fetcher=vi.fn(async()=>Response.json({session_id:'review',status:'exit',structured_output:{candidateSha,normaReview:{candidateSha,status:'clean',checkedFiles:['a.ts'],findings:[],coverageReduced:true,limitations:[]}}}));
 const observation=await adapter(fetcher).inspect('review');expect(observation.qualityReview?.status).toBe('pending');expect(observation.qualityReview?.candidateSha).toBe(candidateSha);
});

it.each([
 ['error','finished','failed'], ['exit','user_request','cancelled'], ['exit','waiting_for_user','finished'],
 ['running','finished','finished'], ['running','waiting_for_user','waiting'], ['new','waiting_for_approval','waiting'],
 ['running',null,'running'], ['resuming',null,'running'], ['claimed',null,'running'], ['new',null,'queued'], ['future',null,'unknown'],
])('preserves provider status precedence for %s / %s',async(status,status_detail,expected)=>{
 const fetcher=vi.fn().mockResolvedValue(response({session_id:'s',status,status_detail}));
 expect((await adapter(fetcher).inspect('devin-s')).state).toBe(expected);
});

it.each([
 [{status:'clean'},'clean'],
 [{status:'clean',findings:['needs review']},'issues'],
 [{status:'clean',findings:['needs review'],coverageReduced:true},'pending'],
 [{status:'clean',checkedFiles:[]},'pending'],
 [{status:'pending'},'pending'],
 [{status:'issues',findings:['needs review']},'issues'],
 [{candidateSha:'b'.repeat(40)},'pending'],
 [{status:'invalid'},'pending'],
])('never promotes incomplete or mismatched agent quality evidence: %j',async(patch,expected)=>{
 const candidateSha='a'.repeat(40);
 const normaReview={candidateSha,status:'clean',checkedFiles:['source.ts'],findings:[],coverageReduced:false,limitations:[],...patch};
 const fetcher=vi.fn().mockResolvedValue(response({session_id:'s',status:'exit',structured_output:{candidateSha,normaReview}}));
 expect((await adapter(fetcher).inspect('s')).qualityReview?.status).toBe(expected);
});
it('keeps missing quality evidence pending and absent candidates without a review',async()=>{
 const candidateSha='a'.repeat(40);
 const fetcher=vi.fn().mockResolvedValueOnce(response({session_id:'s',status:'exit',structured_output:{candidateSha}}))
  .mockResolvedValueOnce(response({session_id:'s',status:'running'}));
 const a=adapter(fetcher);
 expect((await a.inspect('s')).qualityReview).toMatchObject({status:'pending',candidateSha,coverageReduced:true});
 expect((await a.inspect('s')).qualityReview).toBeUndefined();
});

it('propagates inspection failures with safe boundary context and no implicit retry',async()=>{
 const {failureBoundaries}=await import('../server/serial-work');
 const failure=new Error('private transport details');const fetcher=vi.fn().mockRejectedValue(failure);
 await expect(adapter(fetcher).inspect('s')).rejects.toBe(failure);
 expect(failureBoundaries(failure)).toEqual(['devin_read','devin_inspect']);expect(fetcher).toHaveBeenCalledTimes(1);
});

async function waitingEngineering(detail='waiting_for_user') {
 const s=setup();
 s.task.deadline=new Date(Date.now()+600000).toISOString();
 s.mandate.expiresAt=new Date(Date.now()+900000).toISOString();
 s.mandate.taskHashes[s.task.incidentId]=hashCanonical(s.task);
 const {defaultOperatingPolicy}=await import('../server/operating-policy');
 s.store.saveOperatingPolicy({revision:0,policy:{...defaultOperatingPolicy(),paused:false,totalAcu:10,dailyAcu:10,sessionAcu:2}});
 s.store.reserveEngineering(s.mandate,s.task);s.store.updateEngineering(s.task.incidentId,{state:'running',remoteId:'devin-s'});
 let stopped=false;
 const fetcher=vi.fn(async(_url:string,options:RequestInit)=>{
  if(options.method==='DELETE')stopped=true;
  return response({session_id:'s',status:stopped?'exit':'running',status_detail:detail,acus_consumed:0.5});
 });
 return {...s,fetcher,a:adapter(fetcher)};
}
it('continues the same engineering task with durable intent, cooldown and a two-message limit',async()=>{
 const s=await waitingEngineering(),original=s.a.continueTask.bind(s.a),now=Date.now();
 const resume=vi.spyOn(s.a,'continueTask').mockImplementation(async(...args)=>{
  expect(s.store.engineeringReservation(s.task.incidentId).continuations.at(-1).outcome).toBe('pending');return original(...args);
 });
 await Promise.all([observeEngineering(s.store,s.a,now),observeEngineering(s.store,s.a,now)]);
 expect(resume).toHaveBeenCalledTimes(1);
 expect(s.store.engineeringReservation(s.task.incidentId)).toMatchObject({state:'held',reason:'continuation_sent_awaiting_observation'});
 await observeEngineering(s.store,s.a,now+1000);expect(resume).toHaveBeenCalledTimes(1);
 await observeEngineering(s.store,s.a,now+120001);expect(resume).toHaveBeenCalledTimes(2);
 await observeEngineering(s.store,s.a,now+240002);expect(resume).toHaveBeenCalledTimes(2);
 expect(s.store.engineeringReservation(s.task.incidentId).reason).toBe('continuation_limit_reached');
 const body=JSON.parse(String(s.fetcher.mock.calls.find(([,o])=>o.method==='POST')![1].body));
 expect(body.message).toContain(s.task.baseSha);expect(body.message).toContain('promote/test');expect(body.message).toContain('Never bypass an approval');
});
it('holds approval requests without sending a continuation',async()=>{
 const s=await waitingEngineering('waiting_for_approval');await observeEngineering(s.store,s.a);
 expect(s.store.engineeringReservation(s.task.incidentId)).toMatchObject({state:'held',reason:'provider_approval_required'});
 expect(s.fetcher.mock.calls.some(([,o])=>o.method==='POST')).toBe(false);
});
it('never resends uncertain engineering continuation after reopening the store',async()=>{
 const s=await waitingEngineering();vi.spyOn(s.a,'continueTask').mockResolvedValue({kind:'unknown_outcome',reason:'timeout'});
 await observeEngineering(s.store,s.a);
 const reopened=new ControllerStore(join(s.dir,'db.sqlite'));stores.push(reopened);
 await observeEngineering(reopened,s.a,Date.now()+120001);
 expect(s.a.continueTask).toHaveBeenCalledTimes(1);expect(reopened.engineeringReservation(s.task.incidentId).reason).toBe('continuation_outcome_uncertain');
});
it.each(['paused','policy_expired','mandate_expired','task_changed','acu_exhausted','candidate'])('does not resume unauthorized or complete engineering work: %s',async condition=>{
 const s=await waitingEngineering();let now=Date.now();
 if(condition==='paused'||condition==='policy_expired'){
  const p=s.store.operatingPolicy()!;
  s.store.saveOperatingPolicy({revision:p.revision,policy:{...p.policy,paused:condition==='paused',expiresAt:condition==='policy_expired'?new Date(now+1000).toISOString():p.policy.expiresAt}});
  if(condition==='policy_expired')now+=2000;
 } else if(condition==='mandate_expired')now+=1000000;
 else if(condition==='task_changed')vi.spyOn(s.store,'engineeringMandate').mockReturnValue({...s.mandate,taskHashes:{[s.task.incidentId]:'0'.repeat(64)}});
 else if(condition==='acu_exhausted')s.store.updateEngineering(s.task.incidentId,{usageAcu:2});
 else s.store.updateEngineering(s.task.incidentId,{candidateSha:'a'.repeat(40),state:'held'});
 await observeEngineering(s.store,s.a,now);
 expect(s.fetcher.mock.calls.some(([,o])=>o.method==='POST')).toBe(false);
 if(condition==='candidate')expect(s.store.engineeringReservation(s.task.incidentId).candidateSha).toBe('a'.repeat(40));
});

it.each(['policy','task'])('rechecks %s expiry after a slow provider observation before continuing',async boundary=>{
 const s=await waitingEngineering();let now=Date.now();
 const policy=s.store.operatingPolicy()!;
 s.store.saveOperatingPolicy({revision:policy.revision,policy:{...policy.policy,expiresAt:new Date(now+1000).toISOString()}});
 const inspect=s.a.inspect.bind(s.a);
 vi.spyOn(s.a,'inspect').mockImplementation(async id=>{const result=await inspect(id);now=boundary==='task'?Date.parse(s.task.deadline)+1:now+2000;return result;});
 const resume=vi.spyOn(s.a,'continueTask');
 await observeEngineering(s.store,s.a,()=>now);
 expect(resume).not.toHaveBeenCalled();
 expect(s.store.engineeringReservation(s.task.incidentId)).toMatchObject(boundary==='task'?{state:'stopped',reason:'deadline_reached'}:{state:'held',reason:'continuation_not_authorized'});
});

it('collects late candidate and usage before closing an expired session without resuming it',async()=>{
 const s=setup();s.store.reserveEngineering(s.mandate,s.task);s.store.updateEngineering(s.task.incidentId,{state:'held',remoteId:'devin-s',reason:'termination_pending'});
 const candidateSha='c'.repeat(40);
 const fetcher=vi.fn().mockResolvedValueOnce(response({session_id:'s',status:'suspended',status_detail:'inactivity',acus_consumed:1.5,structured_output:{candidateSha}}))
  .mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({session_id:'s',status:'exit'}));
 await observeEngineering(s.store,adapter(fetcher),Date.parse(s.task.deadline)+1);
 expect(s.store.engineeringReservation(s.task.incidentId)).toMatchObject({state:'stopped',candidateSha,usageAcu:1.5,reason:'termination_confirmed'});
 expect(fetcher.mock.calls.map(([,o])=>o.method)).toEqual(['GET','DELETE','GET']);
 expect(s.store.engineeringSpend().committedCeilings).toBe(2);
});
it('still requests termination when expired result collection fails and exposes refusal',async()=>{
 const s=setup();s.store.reserveEngineering(s.mandate,s.task);s.store.updateEngineering(s.task.incidentId,{state:'held',remoteId:'devin-s',candidateSha:'a'.repeat(40)});
 const fetcher=vi.fn().mockRejectedValueOnce(new Error('read unavailable'))
  .mockResolvedValueOnce(response({},403)).mockResolvedValueOnce(response({session_id:'s',status:'running'}));
 await observeEngineering(s.store,adapter(fetcher),Date.parse(s.task.deadline)+1);
 expect(s.store.engineeringReservation(s.task.incidentId)).toMatchObject({state:'held',reason:'provider_http_403',candidateSha:'a'.repeat(40)});
 expect(fetcher.mock.calls.map(([,o])=>o.method)).toEqual(['GET','DELETE','GET']);
});

it.each(['suspended','error','exit'])('accepts an identity-bound archived %s termination acknowledgement without another poll',async status=>{
 const fetcher=vi.fn().mockResolvedValue(response({session_id:'s',status,is_archived:true}));
 expect(await adapter(fetcher).cancel('devin-s','stop:test')).toMatchObject({kind:'confirmed'});
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0][0]).toContain('?archive=true');
 expect(fetcher.mock.calls[0][1].method).toBe('DELETE');
});
it.each([
 [200,'suspended',false,'requested'],[200,'running',true,'requested'],
 [200,'resuming',true,'requested'],[200,'future',true,'requested'],
 [403,'suspended',true,'failed'],[409,'suspended',true,'failed'],
])('keeps the slot for DELETE %s and %s archived=%s',async(status,state,is_archived,expected)=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response({session_id:'s',status:state,is_archived},status))
  .mockResolvedValueOnce(response({session_id:'s',status:state,is_archived}));
 expect((await adapter(fetcher).cancel('devin-s','stop:test')).kind).toBe(expected);
});
it('holds a mismatched termination acknowledgement',async()=>{
 const fetcher=vi.fn().mockResolvedValue(response({session_id:'another',status:'suspended',is_archived:true}));
 expect(await adapter(fetcher).cancel('devin-s','stop:test')).toEqual({kind:'failed',reason:'termination_identity_mismatch'});
});
it('confirms a successful termination with a subsequent archived inactive observation',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response({}))
  .mockResolvedValueOnce(response({session_id:'s',status:'suspended',is_archived:true}));
 expect((await adapter(fetcher).cancel('devin-s','stop:test')).kind).toBe('confirmed');
});
it('does not free a slot when termination transport is uncertain',async()=>{
 const fetcher=vi.fn().mockRejectedValue(new Error('network failure'));
 expect(await adapter(fetcher).cancel('devin-s','stop:test')).toEqual({kind:'failed',reason:'termination_unconfirmed'});
});
it('automatically releases an expired archived suspension, preserves its candidate, and stops deleting on later polls',async()=>{
 const s=setup();s.store.reserveEngineering(s.mandate,s.task);s.store.updateEngineering(s.task.incidentId,{state:'held',remoteId:'devin-s',reason:'termination_pending'});
 const candidateSha='d'.repeat(40);
 const fetcher=vi.fn(async(_url:string,options:RequestInit)=>response({session_id:'s',status:'suspended',status_detail:'inactivity',is_archived:options.method==='DELETE',acus_consumed:1,structured_output:{candidateSha}}));
 const a=adapter(fetcher),now=Date.parse(s.task.deadline)+1;
 await observeEngineering(s.store,a,now);
 expect(s.store.engineeringReservation(s.task.incidentId)).toMatchObject({state:'stopped',candidateSha,usageAcu:1});
 expect(s.store.engineeringReservations().filter(r=>r.state!=='stopped')).toHaveLength(0);
 await observeEngineering(s.store,a,now+61000);
 expect(fetcher.mock.calls.filter(([,o])=>o.method==='DELETE')).toHaveLength(1);
 expect(s.store.engineeringSpend().committedCeilings).toBe(2);
});
