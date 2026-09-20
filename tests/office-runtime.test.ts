import {expect,it} from 'vitest';
import {createDemoState,createOfficeModel} from '../web/office-model.js';
import {applyOfficeRuntime,officeTickerValues} from '../web/office-runtime.js';
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
