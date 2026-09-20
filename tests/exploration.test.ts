import {defaultOperatingPolicy} from '../server/operating-policy';
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {ControllerStore} from '../server/store';
import {DevinAdapter} from '../adapters/devin/client';
import {observeExplorations} from '../server/exploration';
import {ExplorationSpec} from '../contracts/exploration';
import {createOperatorServer} from '../server/http';
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(f=>f()));
const setup=()=>{const dir=mkdtempSync(join(tmpdir(),'explore-test-'));const store=new ControllerStore(join(dir,'db'));cleanup.push(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {store,dir};};
const spec=()=>ExplorationSpec.parse({schemaVersion:1,id:randomUUID(),repository:'example/app',baseSha:'a'.repeat(40),maxAcu:2,minutes:5,focus:'Test saved history',createdAt:new Date().toISOString(),deadline:new Date(Date.now()+300000).toISOString(),mode:'ui-fixture',promptHash:createHash('sha256').update(readFileSync(new URL('../prompts/explorer-v1.md',import.meta.url))).digest('hex')});
const adapter=(fetcher:ReturnType<typeof vi.fn>)=>new DevinAdapter({organizationId:'org-test',apiKey:'synthetic-key'},fetcher as typeof fetch);
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
it('reserves once, persists after reopen, and holds capacity after ambiguous dispatch',()=>{
 const {store,dir}=setup(),s=spec();expect(store.reserveExploration(s).claimed).toBe(true);expect(store.reserveExploration(s).claimed).toBe(false);
 expect(()=>store.reserveExploration({...s,maxAcu:3})).toThrow('changed');
 const reopened=new ControllerStore(join(dir,'db'));expect(reopened.explorations()[0].spec).toEqual(s);reopened.close();
 store.updateExploration(s.id,{state:'held'});expect(()=>store.reserveExploration(spec())).toThrow('occupied');
});
it('uses exact commit, prompt identity, native ACU ceiling and report-only schema',async()=>{
 const fetcher=vi.fn().mockResolvedValue(response({session_id:'abc',status:'new'})),s=spec();
 expect((await adapter(fetcher).startExploration(s)).kind).toBe('created');
 const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.max_acu_limit).toBe(2);expect(body.prompt).toContain(s.baseSha);expect(body.prompt).toContain('Do not modify');expect(body.structured_output_schema.properties.candidateSha).toBeUndefined();expect(body).not.toHaveProperty('secret_ids');
 expect((await adapter(fetcher).startExploration({...s,promptHash:'0'.repeat(64)})).kind).toBe('rejected');expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([408,500])('never retries an uncertain creation (%s)',async status=>{
 const fetcher=vi.fn().mockResolvedValue(response({},status));expect((await adapter(fetcher).startExploration(spec())).kind).toBe('unknown_outcome');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects a report for another commit and waits for confirmed termination',async()=>{
 const {store}=setup(),s=spec();store.reserveExploration(s);store.updateExploration(s.id,{state:'running',remoteId:'devin-abc'});
 const session={session_id:'abc',status:'exit',acus_consumed:1,structured_output:{baseSha:'b'.repeat(40),mode:'ui-fixture',summary:'Done',coverage:[],findings:[],limitations:[]}};
 const fetcher=vi.fn().mockImplementation(async()=>response(session));await observeExplorations(store,adapter(fetcher));expect(store.explorations()[0]).toMatchObject({state:'stopped',report:null,usageAcu:1,reason:'report_missing_or_wrong_commit'});
 expect(store.getIncident(s.id)).toBeNull();
});
it('serves reports without allowing an unauthenticated paid launch',async()=>{
 const {store,dir}=setup();const server=createOperatorServer({root:dir,store});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 expect((await fetch(base+'/api/explorations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(403);
 expect(await fetch(base+'/api/explorations').then(r=>r.json())).toEqual({target:null,runs:[]});
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
it('counts exploratory ceilings and reported usage in the office finances',()=>{
 const {store}=setup(),s=spec();store.reserveExploration(s);expect(store.engineeringSpend().committedCeilings).toBe(2);expect(store.engineeringSpend().reportedUsage).toBeNull();
 store.updateExploration(s.id,{usageAcu:1.2});store.updateExploration(s.id,{usageAcu:0.8});expect(store.engineeringSpend().reportedUsage).toBe(1.2);
});

it('test findings enter discovery as unverified observations, never candidate acceptance',async()=>{
 const {classifyRecord}=await import('../server/orchestrator');
 const proposals=classifyRecord({schema:'promote/exploration@1',repository:'example/app',baseSha:'a'.repeat(40),report:{findings:[{title:'History loses selection',severity:'high',steps:['Open','Reload']}]}});
 expect(proposals[0].category).toBe('feedback');expect(proposals[0].nextAction).toContain('Independently reproduce');
});
it('deadline termination proceeds even when report retrieval fails',async()=>{
 const {store}=setup(),s={...spec(),deadline:new Date(Date.now()-1000).toISOString()};store.reserveExploration(s);store.updateExploration(s.id,{state:'running',remoteId:'devin-abc'});
 const fetcher=vi.fn().mockResolvedValueOnce(response({session_id:'abc',status:'running'})).mockRejectedValueOnce(Error('report unavailable')).mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({session_id:'abc',status:'exit'}));
 await observeExplorations(store,adapter(fetcher));expect(store.explorations()[0].state).toBe('stopped');
});

function waitingSetup(detail='waiting_for_user',overrides:Record<string,unknown>={}) {
 const {store,dir}=setup(),s=spec();
 store.saveOperatingPolicy({revision:0,policy:{...defaultOperatingPolicy(),paused:false,proactiveTests:true,testRepository:s.repository,totalAcu:10,dailyAcu:10,sessionAcu:2}});
 store.reserveExploration(s);store.updateExploration(s.id,{state:'running',remoteId:'devin-abc'});
 let stopped=false;
 const fetcher=vi.fn(async(_url:string,options:RequestInit)=>{
  if(options.method==='DELETE')stopped=true;
  return response({session_id:'abc',status:stopped?'exit':'running',status_detail:detail,acus_consumed:0.5,...overrides});
 });
 return {store,dir,s,fetcher};
}
it('durably records a bounded continuation before transport and observes held until provider resumes',async()=>{
 const {store,s,fetcher}=waitingSetup();const a=adapter(fetcher);
 const original=a.continueExploration.bind(a);
 const resume=vi.spyOn(a,'continueExploration').mockImplementation(async(...args)=>{
  expect(store.explorations()[0].continuations.at(-1).outcome).toBe('pending');return original(...args);
 });
 const now=Date.now();await observeExplorations(store,a,now);
 expect(store.explorations()[0]).toMatchObject({state:'held',reason:'continuation_sent_awaiting_observation'});
 await observeExplorations(store,a,now+1000);expect(resume).toHaveBeenCalledTimes(1);
 await observeExplorations(store,a,now+120001);expect(resume).toHaveBeenCalledTimes(2);
 await observeExplorations(store,a,now+240002);expect(resume).toHaveBeenCalledTimes(2);
 expect(store.explorations()[0].reason).toBe('continuation_limit_reached');
 const message=fetcher.mock.calls.find(([,o])=>o.method==='POST')![1];
 expect(JSON.parse(String(message.body)).message).toContain(s.baseSha);
 expect(JSON.parse(String(message.body)).message).toContain('Never bypass an approval');
});
it('never automatically approves provider approval requests',async()=>{
 const {store,fetcher}=waitingSetup('waiting_for_approval');await observeExplorations(store,adapter(fetcher));
 expect(store.explorations()[0]).toMatchObject({state:'held',reason:'provider_approval_required'});
 expect(fetcher.mock.calls.some(([,o])=>o.method==='POST')).toBe(false);
});
it('stops and ingests an already complete report instead of restarting finished tests',async()=>{
 const {store,s,fetcher}=waitingSetup('waiting_for_user',{structured_output:{baseSha:'a'.repeat(40),mode:'ui-fixture',summary:'Finished sandbox review',coverage:['history'],findings:[],limitations:[]}});
 await observeExplorations(store,adapter(fetcher));
 expect(store.explorations()[0]).toMatchObject({state:'stopped',reason:'report_received_unverified'});
 expect(store.explorations()[0].report.baseSha).toBe(s.baseSha);
 expect(fetcher.mock.calls.some(([,o])=>o.method==='POST')).toBe(false);
});
it('does not resend uncertain continuation after store reopen',async()=>{
 const {store,dir,fetcher}=waitingSetup();const a=adapter(fetcher);
 vi.spyOn(a,'continueExploration').mockResolvedValue({kind:'unknown_outcome',reason:'timeout'});
 await observeExplorations(store,a);
 const reopened=new ControllerStore(join(dir,'db'));
 try{await observeExplorations(reopened,a,Date.now()+120001);expect(a.continueExploration).toHaveBeenCalledTimes(1);expect(reopened.explorations()[0].reason).toBe('continuation_outcome_uncertain');}finally{reopened.close();}
});
it.each(['paused','acu_exhausted','budget'])('does not resume outside original authorization: %s',async condition=>{
 const {store,s,fetcher}=waitingSetup();
 if(condition==='acu_exhausted')store.updateExploration(s.id,{usageAcu:2});
 else {const p=store.operatingPolicy()!;store.saveOperatingPolicy({revision:p.revision,policy:{...p.policy,paused:condition==='paused',sessionAcu:condition==='budget'?1:2}});}
 await observeExplorations(store,adapter(fetcher));
 expect(fetcher.mock.calls.some(([,o])=>o.method==='POST')).toBe(false);
 if(condition==='acu_exhausted')expect(store.explorations()[0].reason).toBe('acu_ceiling_reached');
});
it('does not resume when waiting report retrieval failed',async()=>{
 const {store,fetcher}=waitingSetup();const a=adapter(fetcher);vi.spyOn(a,'explorationWaitingState').mockRejectedValue(Error('unavailable'));
 await observeExplorations(store,a);expect(store.explorations()[0]).toMatchObject({state:'held',reason:'waiting_report_unavailable'});
 expect(fetcher.mock.calls.some(([,o])=>o.method==='POST')).toBe(false);
});

it.each(['policy','task'])('rechecks %s expiry after reading a waiting exploration report',async boundary=>{
 const {store,s,fetcher}=waitingSetup();const a=adapter(fetcher);let now=Date.now();
 const policy=store.operatingPolicy()!;
 store.saveOperatingPolicy({revision:policy.revision,policy:{...policy.policy,expiresAt:new Date(now+1000).toISOString()}});
 const waiting=a.explorationWaitingState.bind(a);
 vi.spyOn(a,'explorationWaitingState').mockImplementation(async id=>{const result=await waiting(id);now=boundary==='task'?Date.parse(s.deadline)+1:now+2000;return result;});
 const resume=vi.spyOn(a,'continueExploration');
 await observeExplorations(store,a,()=>now);
 expect(resume).not.toHaveBeenCalled();
 expect(store.explorations()[0]).toMatchObject(boundary==='task'?{state:'stopped',reason:'deadline_reached'}:{state:'held',reason:'continuation_not_authorized'});
});
