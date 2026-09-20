import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const mocks=vi.hoisted(()=>({dispatch:vi.fn(),provider:vi.fn(),evaluate:vi.fn()}));
vi.mock('../server/devin-config',()=>({loadDevin:mocks.provider}));
vi.mock('../server/engineering',()=>({dispatchEngineering:mocks.dispatch}));
vi.mock('../server/maintenance-evaluator',()=>({evaluateMaintenance:mocks.evaluate}));
vi.mock('../server/repo-identity',()=>({originMatchesRepo:async()=>true}));
vi.mock('node:child_process',()=>{
 const execFile=()=>{};
 Object.defineProperty(execFile,Symbol.for('nodejs.util.promisify.custom'),{value:async(_cmd:string,args:string[])=>({stdout:args[0]==='ls-remote'?'a'.repeat(40)+'\trefs/heads/main':'a'.repeat(40),stderr:''})});
 return {execFile};
});
import { buildMaintenanceJob, createMaintenanceLoop, MaintenanceProfile } from '../server/maintenance';
import { ControllerStore } from '../server/store';
import { defaultOperatingPolicy } from '../server/operating-policy';
const cleanup:(()=>void)[]=[];
afterEach(()=>{for(const f of cleanup.splice(0))f();vi.useRealTimers();vi.clearAllMocks();});
const profile=()=>MaintenanceProfile.parse({id:'runtime',title:'Runtime quality',repo:'example/app',checkout:'/unused',objective:'Reproduce and fix actual runtime errors with behavioral regression coverage.',allowedPaths:['core','tests/unit/maintenance.test.ts'],protectedPaths:['package.json'],tests:['tests/unit/maintenance.test.ts'],maxAttempts:2});
function setup(active=true){const root=mkdtempSync(join(tmpdir(),'maintenance-test-'));const store=new ControllerStore(join(root,'store.db'));const loop=createMaintenanceLoop(store,root);cleanup.push(()=>{loop.journal.close();store.close();rmSync(root,{recursive:true,force:true});});
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
