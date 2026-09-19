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
