import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const mocks=vi.hoisted(()=>({dispatch:vi.fn(),provider:vi.fn(),evaluate:vi.fn(),explore:vi.fn(),target:vi.fn(),git:vi.fn(),identity:vi.fn()}));
vi.mock('../server/exploration',()=>({launchExploration:mocks.explore,explorationTarget:mocks.target}));
vi.mock('../server/devin-config',()=>({loadDevin:mocks.provider}));
vi.mock('../server/engineering',()=>({dispatchEngineering:mocks.dispatch}));
vi.mock('../server/maintenance-evaluator',()=>({evaluateMaintenance:mocks.evaluate}));
vi.mock('../server/repo-identity',()=>({originMatchesRepo:async(...args:unknown[])=>{mocks.identity(...args);return true;}}));
vi.mock('node:child_process',()=>{
 const execFile=()=>{};
 Object.defineProperty(execFile,Symbol.for('nodejs.util.promisify.custom'),{value:async(_cmd:string,args:string[],options:unknown)=>{mocks.git(args,options);return {stdout:args[0]==='ls-remote'?'a'.repeat(40)+'\trefs/heads/main':'a'.repeat(40),stderr:''};}});
 return {execFile};
});
import { buildMaintenanceJob, createMaintenanceLoop, MaintenanceProfile, maintenanceProfiles } from '../server/maintenance';
import { ControllerStore } from '../server/store';
import { defaultOperatingPolicy } from '../server/operating-policy';
const cleanup:(()=>void)[]=[];
afterEach(()=>{for(const f of cleanup.splice(0))f();vi.useRealTimers();vi.clearAllMocks();});
const profile=()=>MaintenanceProfile.parse({id:'runtime',title:'Runtime quality',repo:'example/app',checkout:'/unused',objective:'Reproduce and fix actual runtime errors with behavioral regression coverage.',allowedPaths:['core','tests/unit/maintenance.test.ts'],protectedPaths:['package.json'],tests:['tests/unit/maintenance.test.ts'],maxAttempts:2});
function setup(active=true,testCheckout?:string){const root=mkdtempSync(join(tmpdir(),'maintenance-test-'));const store=new ControllerStore(join(root,'store.db'));const loop=createMaintenanceLoop(store,root,testCheckout);cleanup.push(()=>{loop.journal.close();store.close();rmSync(root,{recursive:true,force:true});});
 if(active)store.saveOperatingPolicy({revision:0,policy:{...defaultOperatingPolicy(),paused:false,totalAcu:100,dailyAcu:100,sessionAcu:5}});
 mocks.provider.mockReturnValue({adapter:{},status:{status:'ready'}});writeFileSync(join(root,'.local/maintenance-profiles.json'),JSON.stringify([profile()]));return {root,store,loop};}
it('binds budget and deadline in an immutable persisted job',()=>{
 const {loop}=setup();const now=Date.now(),expiry=new Date(now+20*60000).toISOString();const job=buildMaintenanceJob(profile(),'a'.repeat(40),1,{sessionAcu:7,expiresAt:expiry},undefined,now);
 expect(job.task.deadline).toBe(expiry);expect(job.mandate.maxSessionAcu).toBe(7);expect(job.task.providerExtension.maxAcu).toBe(7);expect(loop.journal.insert(job)).toBe(true);
 expect(()=>loop.journal.update(job.id,{task:{...job.task,deadline:new Date().toISOString()}} as never)).toThrow('immutable');expect(loop.journal.all()[0].task).toEqual(job.task);
 expect(()=>buildMaintenanceJob(profile(),'a'.repeat(40),3,{sessionAcu:7,expiresAt:expiry})).toThrow('attempt');
});
it.each(['missing','paused','expired'])('does not dispatch when policy is %s',async state=>{
 vi.useFakeTimers();const {loop,store}=setup(state!=='missing');if(state==='paused')store.saveOperatingPolicy({revision:1,policy:{...store.operatingPolicy()!.policy,paused:true}});if(state==='expired')vi.setSystemTime(Date.now()+2*86400000);
 await loop.tick(true);expect(mocks.dispatch).not.toHaveBeenCalled();
});
it('an ambiguous create is held and never automatically resent',async()=>{
 const {loop}=setup();mocks.dispatch.mockResolvedValue({kind:'unknown_outcome',reason:'timeout'});await loop.tick(true);await loop.tick(true);
 expect(mocks.dispatch).toHaveBeenCalledTimes(1);expect(loop.journal.all()[0].state).toBe('held');
});
it('expired planned jobs are blocked without reconstructing their task',async()=>{
 vi.useFakeTimers();const {loop}=setup();const job=buildMaintenanceJob(profile(),'a'.repeat(40),1,{sessionAcu:5,expiresAt:new Date(Date.now()+1000).toISOString()});loop.journal.insert(job);vi.setSystemTime(Date.now()+2000);await loop.tick(true);
 expect(loop.journal.all()[0]).toMatchObject({state:'blocked',reason:'planned_task_expired',task:job.task});expect(mocks.dispatch).not.toHaveBeenCalled();
});
it('only failed-check retryable jobs get another bounded attempt',async()=>{
 const {loop}=setup();const job=buildMaintenanceJob(profile(),'a'.repeat(40),1,{sessionAcu:5,expiresAt:new Date(Date.now()+600000).toISOString()});loop.journal.insert(job);loop.journal.update(job.id,{state:'retryable',result:{status:'failed',reason:'tests_failed',candidateSha:'b'.repeat(40),log:'assertion failed'} as never});mocks.dispatch.mockResolvedValue({kind:'created'});
 await loop.tick(true);expect(mocks.dispatch).toHaveBeenCalledTimes(1);const second=loop.journal.all()[1];expect(second.attempt).toBe(2);expect(second.task.contractSummary).toContain('PRIOR ATTEMPT FAILED');
 loop.journal.update(second.id,{state:'retryable',result:{status:'failed',reason:'tests_failed'} as never});await loop.tick(true);expect(mocks.dispatch).toHaveBeenCalledTimes(1);expect(loop.journal.all()[1].reason).toBe('attempt_limit_reached');
});

it('a retryable label without failed-check evidence is not enough to spend again',async()=>{
 const {loop}=setup();const job=buildMaintenanceJob(profile(),'a'.repeat(40),1,{sessionAcu:5,expiresAt:new Date(Date.now()+600000).toISOString()});loop.journal.insert(job);loop.journal.update(job.id,{state:'retryable'});await loop.tick(true);expect(mocks.dispatch).not.toHaveBeenCalled();expect(loop.journal.all()[0].reason).toBe('retry_missing_failed_check_evidence');
});

it('launches distinct testing profiles but never duplicates an unresolved profile',async()=>{
 const {root,store,loop}=setup(true,'/sandbox');
 store.saveOperatingPolicy({revision:1,policy:{...store.operatingPolicy()!.policy,approvedRepairs:false,proactiveTests:true,testRepository:'example/app',maxConcurrentSessions:2}});
 writeFileSync(join(root,'.local/exploration-profiles.json'),JSON.stringify(['Accessibility exploration','Failure recovery exploration','Overflow exploration']));
 mocks.target.mockResolvedValue({repository:'example/app',baseSha:'a'.repeat(40),dirty:false});
 const active:any[]=[];vi.spyOn(store,'explorations').mockImplementation(()=>active);
 mocks.explore.mockImplementation(async(_store,_root,_checkout,input)=>{active.push({state:'running',spec:{...input,createdAt:new Date().toISOString()}});});
 await loop.tick(true);await loop.tick(true);
 expect(mocks.explore).toHaveBeenCalledTimes(2);
 expect(active.map(r=>r.spec.focus)).toEqual(['Accessibility exploration','Failure recovery exploration']);
});

it.each(['paused','expired','provider_unavailable'])('continues local QA when paid dispatch is %s',async state=>{
 const {loop,store}=setup();
 const job=buildMaintenanceJob(profile(),'a'.repeat(40),1,{sessionAcu:5,expiresAt:new Date(Date.now()+600000).toISOString()});
 loop.journal.insert(job);loop.journal.update(job.id,{state:'awaiting_verification'});
 vi.spyOn(store,'engineeringReservation').mockReturnValue({state:'stopped',candidateSha:'b'.repeat(40)} as never);
 if(state==='paused')store.saveOperatingPolicy({revision:1,policy:{...store.operatingPolicy()!.policy,paused:true}});
 if(state==='expired'){vi.useFakeTimers();vi.setSystemTime(Date.now()+2*86400000);}
 if(state==='provider_unavailable')mocks.provider.mockReturnValue({adapter:null,status:{status:'unavailable'}});
 mocks.evaluate.mockResolvedValue({status:'passed',reason:'independent_maintenance_checks_passed',candidateSha:'b'.repeat(40),changedPaths:[]});
 await loop.tick(true);await Promise.resolve();
 expect(mocks.evaluate).toHaveBeenCalledTimes(1);
 expect(loop.journal.all()[0].state).toBe('verified');
 expect(mocks.dispatch).not.toHaveBeenCalled();
});

it('retains failed verification evidence when the same candidate is queued for infrastructure recheck',()=>{
 const {loop}=setup();
 const job=buildMaintenanceJob(profile(),'a'.repeat(40),1,{sessionAcu:5,expiresAt:new Date(Date.now()+600000).toISOString()});
 loop.journal.insert(job);
 const result={status:'failed',reason:'maintenance_checks_failed',candidateSha:'b'.repeat(40),changedPaths:[],log:'Original bounded evidence'} as const;
 loop.journal.update(job.id,{state:'retryable',result:{...result,changedPaths:[]}});
 const recheck=loop.journal.recheck(job.id,'baseline_fixture_restored');
 expect(recheck.state).toBe('awaiting_verification');
 expect(recheck.task).toEqual(job.task);
 expect(recheck.attempt).toBe(1);
 expect(recheck.verificationHistory).toHaveLength(1);
 expect(recheck.verificationHistory![0].result).toEqual(result);
 expect(()=>loop.journal.recheck(job.id,'duplicate')).toThrow('requires_failed_or_blocked');
});

it('supports 500 scoped profiles and bounds individual task ceilings by policy',()=>{
 const {root}=setup();writeFileSync(join(root,'.local/maintenance-profiles.json'),JSON.stringify(Array.from({length:500},(_,i)=>({...profile(),id:`task-${i}`}))));
 expect(maintenanceProfiles(root)).toHaveLength(500);
 for(const [requested,expected] of [[2,2],[20,5]]){
  const job=buildMaintenanceJob({...profile(),maxAcu:requested},'a'.repeat(40),1,{sessionAcu:5,expiresAt:new Date(Date.now()+600000).toISOString()});
  expect(job.mandate.maxSessionAcu).toBe(expected);expect(job.mandate.totalAcu).toBe(expected);expect(job.task.providerExtension.maxAcu).toBe(expected);
 }
});

it('skips unaffordable profiles and dispatches a smaller task within remaining authorization',async()=>{
 const {root,store,loop}=setup();writeFileSync(join(root,'.local/maintenance-profiles.json'),JSON.stringify([profile(),{...profile(),id:'small',maxAcu:2}]));
 vi.spyOn(store,'operatingBudget').mockReturnValue({remainingAcu:2,totalRemainingAcu:2} as never);
 mocks.dispatch.mockResolvedValue({kind:'created'});await loop.tick(true);
 expect(mocks.dispatch).toHaveBeenCalledTimes(1);expect(mocks.dispatch.mock.calls[0][2].maxSessionAcu).toBe(2);
});

it('gives repairs first access while preserving one exploration slot',async()=>{
 const {root,store,loop}=setup(true,'/sandbox');
 store.saveOperatingPolicy({revision:1,policy:{...store.operatingPolicy()!.policy,proactiveTests:true,testRepository:'example/app',maxConcurrentSessions:3}});
 writeFileSync(join(root,'.local/maintenance-profiles.json'),JSON.stringify(Array.from({length:4},(_,i)=>({...profile(),id:`repair-${i}`}))));
 mocks.target.mockResolvedValue({repository:'example/app',baseSha:'a'.repeat(40),dirty:false});
 const active:any[]=[];const explorations:any[]=[];const order:string[]=[];
 vi.spyOn(store,'operatingBudget').mockReturnValue({remainingAcu:100,totalRemainingAcu:100} as never);
 vi.spyOn(store,'engineeringReservations').mockImplementation(()=>active);vi.spyOn(store,'explorations').mockImplementation(()=>explorations);
 mocks.dispatch.mockImplementation(async()=>{active.push({state:'running'});order.push('repair');return{kind:'created'};});
 mocks.explore.mockImplementation(async()=>{explorations.push({state:'running'});order.push('explore');});
 await loop.tick(true);expect(order).toEqual(['repair','repair','explore']);
});

it.each([true,false])('suppresses repeated findings only at their recorded base (same base: %s)',async sameBase=>{
 const {store,loop}=setup(true,'/sandbox');const policy=store.operatingPolicy()!.policy;
 vi.spyOn(store,'operatingBudget').mockReturnValue({remainingAcu:100,totalRemainingAcu:100} as never);
 store.saveOperatingPolicy({revision:1,policy:{...policy,approvedRepairs:false,proactiveTests:true,testRepository:'example/app'}});
 vi.spyOn(store,'explorations').mockReturnValue([{state:'stopped',spec:{repository:'example/app',focus:policy.testFocus,baseSha:'a'.repeat(40),createdAt:'2020-01-01T00:00:00Z'},report:{findings:[{title:'Needs reproduction'}]}}]);
 mocks.target.mockResolvedValue({repository:'example/app',baseSha:(sameBase?'a':'b').repeat(40),dirty:false});
 await loop.tick(true);expect(mocks.explore).toHaveBeenCalledTimes(sameBase?0:1);
});

it('an unavailable exploration checkout does not block scoped repairs',async()=>{
 const {store,loop}=setup(true,'/sandbox');store.saveOperatingPolicy({revision:1,policy:{...store.operatingPolicy()!.policy,proactiveTests:true,testRepository:'example/app'}});
 mocks.target.mockRejectedValue(new Error('checkout unavailable'));mocks.dispatch.mockResolvedValue({kind:'created'});
 await loop.tick(true);expect(mocks.dispatch).toHaveBeenCalledTimes(1);
});

it('uses persisted repair history to give exploration the next single slot',async()=>{
 const {store,loop}=setup(true,'/sandbox');
 store.saveOperatingPolicy({revision:1,policy:{...store.operatingPolicy()!.policy,proactiveTests:true,testRepository:'example/app'}});
 const job=buildMaintenanceJob(profile(),'a'.repeat(40),1,{sessionAcu:5,expiresAt:new Date(Date.now()+600000).toISOString()});
 loop.journal.insert(job);loop.journal.update(job.id,{state:'verified'});
 mocks.target.mockResolvedValue({repository:'example/app',baseSha:'a'.repeat(40),dirty:false});
 const active:any[]=[];vi.spyOn(store,'explorations').mockImplementation(()=>active);
 vi.spyOn(store,'operatingBudget').mockReturnValue({remainingAcu:100,totalRemainingAcu:100} as never);
 mocks.explore.mockImplementation(async()=>{active.push({state:'running'});});
 await loop.tick(true);expect(mocks.explore).toHaveBeenCalledTimes(1);expect(mocks.dispatch).not.toHaveBeenCalled();
});

it('resolves and fetches each repository once per tick across both repair passes',async()=>{
 const {root,loop}=setup();
 const profiles=Array.from({length:100},(_,i)=>({...profile(),id:`profile-${i}`,checkout:i===99?'/other':'/unused'}));
 writeFileSync(join(root,'.local/maintenance-profiles.json'),JSON.stringify(profiles));
 for(const p of profiles){const job=buildMaintenanceJob(p,'a'.repeat(40),1,{sessionAcu:5,expiresAt:new Date(Date.now()+600000).toISOString()});loop.journal.insert(job);loop.journal.update(job.id,{state:'verified'});}
 await loop.tick(true);
 expect(mocks.identity).toHaveBeenCalledTimes(2);
 expect(mocks.git.mock.calls.filter(([args])=>args[0]==='ls-remote')).toHaveLength(2);
 expect(mocks.git.mock.calls.filter(([args])=>args[0]==='fetch')).toHaveLength(2);
 expect(mocks.dispatch).not.toHaveBeenCalled();
 await loop.tick(true);
 expect(mocks.git.mock.calls.filter(([args])=>args[0]==='fetch')).toHaveLength(4);
});
