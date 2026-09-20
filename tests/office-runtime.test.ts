import {expect,it} from 'vitest';
import {createDemoState,createOfficeModel} from '../web/office-model.js';
import {applyOfficeRuntime,officeTickerValues,maintenanceProgress,maintenanceAttempts,operatingDispatchStatus,maintenancePipeline} from '../web/office-runtime.js';
const policy={configured:true,policy:{paused:false},budget:{totalCeilingAcu:400,totalCommittedAcu:75,totalRemainingAcu:325,remainingAcu:300},runtime:{engineering:[{id:'a',remoteId:'real-session',state:'running'},{id:'b',state:'held'}],explorations:[{id:'c',state:'running'}],heartbeat:{status:'reviewed'}}};
it('uses recorded sessions and ACU ceilings without pretending they are billed spend',()=>{
 const model=applyOfficeRuntime(createOfficeModel(null,'live'),policy,{jobs:[{state:'verifying'},{state:'verified'}]});
 expect(model.runtime).toMatchObject({engineering:1,testing:1,held:1,qaJobs:1,maintenanceJobs:2});
 expect(model.finance).toMatchObject({unit:'ACU',budget:400,reserved:75,remaining:325,spent:null});
 expect(model.engineering.lines.join(' ')).toContain('real-session');expect(officeTickerValues(model)).toContainEqual(['QA RUNNING',1]);
});
it('distinguishes unavailable maintenance from an empty queue and clears historical engineering status',()=>{
 const model=createOfficeModel(null,'live');model.engineering.status='stopped';
 const projected=applyOfficeRuntime(model,{...policy,runtime:{engineering:[],explorations:[]}},null);
 expect(model.engineering).toMatchObject({status:'idle',task:'No active Devin task'});expect(projected.runtime.qaJobs).toBeNull();
 expect(officeTickerValues(model)).toContainEqual(['QA RUNNING','—']);
});
it('keeps demo fixtures separate from real budgets and work',()=>{
 const model=createOfficeModel(null,'demo',createDemoState());const before=JSON.stringify(model);
 applyOfficeRuntime(model,policy,{jobs:[{state:'verifying'}]});expect(JSON.stringify(model)).toBe(before);
});
it('never shows a historical completed release as current engineering work',()=>{
 const model=createOfficeModel(null,'live');model.engineering.lines=['Verified release is active'];
 applyOfficeRuntime(model,policy,{jobs:[{id:'a',state:'running',title:'Current maintenance'}]});
 expect(model.engineering.task).toBe('Current maintenance');
 expect(model.engineering.lines.join(' ')).not.toContain('Verified release is active');
});
it('renders the empty native scene before the first controller snapshot arrives',()=>{
 expect(()=>officeTickerValues({})).not.toThrow();
 expect(officeTickerValues({})).toContainEqual(['SPEND','—']);
});

it('joins engineering titles to observed running sessions instead of stale journal state',()=>{
 const model=applyOfficeRuntime(createOfficeModel(null,'live'),policy,{jobs:[
  {id:'old',state:'running',title:'Already stopped'},
  {id:'a',state:'running',title:'Actual active task'},
 ]});
 expect(model.engineering.task).toBe('Actual active task');
});
it('does not attribute stale engineering work to a running exploration',()=>{
 const model=applyOfficeRuntime(createOfficeModel(null,'live'),{...policy,runtime:{engineering:[{id:'old',state:'stopped'}],explorations:[{id:'test',state:'running'}]}},{jobs:[{id:'old',state:'running',title:'Already stopped'}]});
 expect(model.engineering.task).toBe('0 engineering · 1 sandbox tests');
});
it('puts the actual maintenance candidate on the moving line without inventing gate results',()=>{
 const model=applyOfficeRuntime(createOfficeModel(null,'live'),policy,{jobs:[{id:'qa',state:'verifying',candidateSha:'abc123',attempt:2,title:'Import validation'}]});
 expect(model.qa).toMatchObject({executionMode:'maintenance',candidateId:'abc123',attempt:2,status:'running',headline:'Independent checks running',task:'Import validation'});
 expect(model.qa.stages).toHaveLength(4);
 expect(model.qa.stages.every((stage:{outcome:string})=>stage.outcome==='not_run')).toBe(true);
 expect(model.runtime.qaTask).toBe('Import validation');
});
it('does not invent a candidate when a verification record has no source revision',()=>{
 const model=createOfficeModel(null,'live');const before=model.qa;
 applyOfficeRuntime(model,policy,{jobs:[{state:'verifying',title:'Incomplete record'}]});
 expect(model.qa).toBe(before);
});

it('projects the observed verification stage without marking acceptance gates passed',()=>{
 const model=applyOfficeRuntime(createOfficeModel(null,'live'),policy,{jobs:[{state:'verifying',candidateSha:'abc123',title:'Import validation',progress:{stage:'regressions',label:'Running 14 import tests',updatedAt:'2026-09-20T14:00:00Z'}}]});
 expect(model.qa.headline).toBe('Running 14 import tests');
 expect(model.runtime.qaProgress).toBe('Running 14 import tests');
 expect(model.qa.progress.next).toContain('release remains a separate decision');
 expect(model.qa.stages.every((stage:{outcome:string})=>stage.outcome==='not_run')).toBe(true);
});
it('explains continuation and keeps verified candidates separate from a release',()=>{
 expect(maintenanceProgress({state:'retryable',progress:{stage:'failed'}}).next).toContain('within attempt and budget limits');
 expect(maintenanceProgress({state:'verified',progress:{stage:'passed'}})).toMatchObject({label:'Candidate checks passed',next:'Candidate verified; no release or merge is implied.'});
 expect(maintenanceProgress({state:'awaiting_verification'}).label).toBe('Queued for independent checks');
 expect(maintenanceProgress({state:'held'}).next).toContain('Reconcile');
});
it('does not display an unrecognized stage as verified evidence',()=>{
 expect(maintenanceProgress({state:'verifying',progress:{stage:'released',label:'Release passed'}})).toMatchObject({stage:null,label:'Independent checks running'});
});

it('does not reuse a failed worker stage for a queued retry or a later blocker',()=>{
 expect(maintenanceProgress({state:'awaiting_verification',progress:{stage:'regressions',label:'Running old tests'}})).toMatchObject({stage:null,label:'Queued for independent checks'});
 expect(maintenanceProgress({state:'blocked',progress:{stage:'failed',label:'Checks failed'}})).toMatchObject({stage:null,label:'Work blocked'});
 expect(maintenanceProgress({state:'verifying',progress:{stage:'passed',label:'All passed'}})).toMatchObject({stage:null,label:'Independent checks running'});
});
it('identifies superseded retries without mixing repositories or source revisions',()=>{
 const jobs=maintenanceAttempts([
  {id:'old',profileId:'repair',repo:'a/b',baseSha:'base',attempt:1,state:'retryable'},
  {id:'next',profileId:'repair',repo:'a/b',baseSha:'base',attempt:2,state:'running'},
  {id:'other-base',profileId:'repair',repo:'a/b',baseSha:'different',attempt:3,state:'running'},
 ]);
 expect(jobs[0].supersededBy).toEqual({id:'next',attempt:2});
 expect(maintenanceProgress(jobs[0]).next).toBe('Historical attempt; continued in attempt 2.');
 expect(jobs[1].supersededBy).toBeNull();
 expect(maintenanceProgress({state:'retryable',attempt:2,maxAttempts:2}).next).toContain('Attempt limit reached');
});
it('replaces a finished QA run with its recorded result and clears it if status disappears',()=>{
 const model=applyOfficeRuntime(createOfficeModel(null,'live'),policy,{jobs:[{state:'verifying',candidateSha:'abc123'}]});
 applyOfficeRuntime(model,policy,{jobs:[{state:'verified',candidateSha:'abc123'}]});
 expect(model.qa).toMatchObject({status:'completed',historical:true,headline:'Candidate checks passed'});
 expect(model.runtime.qaJobs).toBe(0);
 expect(model.qa.stages.every((stage:{outcome:string})=>stage.outcome==='not_run')).toBe(true);
 applyOfficeRuntime(model,policy,null);
 expect(model.qa).toMatchObject({candidateId:null,status:'idle',headline:'Verification status unavailable'});
});

it('shows dispatch limits independently of already running sessions',()=>{
 expect(operatingDispatchStatus(policy)).toBe('Authorized');
 expect(operatingDispatchStatus({...policy,runtime:{...policy.runtime,provider:{paidDispatchEnabled:false}}})).toBe('Provider blocked');
 expect(operatingDispatchStatus({...policy,budget:{...policy.budget,totalRemainingAcu:0}})).toBe('Budget held');
 expect(operatingDispatchStatus({...policy,policy:{paused:true}})).toBe('Paused');
 expect(operatingDispatchStatus({...policy,policy:{expiresAt:'2020-01-01'}})).toBe('Expired');
});

it('counts approved profiles awaiting first dispatch without counting historical attempts twice',()=>{
 const model=applyOfficeRuntime(createOfficeModel(null,'live'),policy,{profiles:[{id:'started'},{id:'queued'}],jobs:[{profileId:'started',attempt:1,state:'retryable'},{profileId:'started',attempt:2,state:'running'}]});
 expect(model.runtime.pendingProfiles).toBe(1);
 applyOfficeRuntime(model,policy,{jobs:[]});
 expect(model.runtime.pendingProfiles).toBeNull();
});

it('projects all approved profiles once and preserves historical proposals separately',()=>{
 const profiles=Array.from({length:200},(_,i)=>({id:`task-${i}`,title:`Task ${i}`}));
 const maintenance={profiles,jobs:[{id:'old',profileId:'task-0',state:'retryable',attempt:1,createdAt:'2026-09-19'},{id:'a',profileId:'task-0',state:'running',attempt:2,createdAt:'2026-09-20'},{id:'verified',profileId:'task-1',state:'verified',attempt:1}]};
 const initial=createOfficeModel(null,'live'),previous=initial.kanban;
 const model=applyOfficeRuntime(initial,policy,maintenance);
 expect(model.proposalKanban).toBe(previous);
 expect(model.maintenancePipeline).toMatchObject({total:200,active:1,verified:1,queued:198});
 expect(model.kanban.columns.flatMap((column:{cards:unknown[]})=>column.cards)).toHaveLength(200);
 expect(model.engineering.sessions[0].title).toBe('real-session');
});
it('does not present a stale running maintenance record as observed active work',()=>{
 const pipeline=maintenancePipeline({profiles:[{id:'repair',title:'Repair'}],jobs:[{id:'old',profileId:'repair',state:'running'}]},[{id:'old',state:'stopped'}]);
 expect(pipeline).toMatchObject({active:0,attention:1,review:1});
 expect(pipeline?.columns[2].cards[0].detail).toContain('Provider activity not confirmed');
});

it('uses scoped dispatch minimum and explains exhausted budget before provider readiness',()=>{
 expect(operatingDispatchStatus({...policy,policy:{sessionAcu:20},budget:{remainingAcu:5,totalRemainingAcu:5},runtime:{minimumDispatchAcu:5}})).toBe('Authorized');
 expect(operatingDispatchStatus({...policy,budget:{remainingAcu:0,totalRemainingAcu:0},runtime:{provider:{paidDispatchEnabled:false}}})).toBe('Budget held');
});
