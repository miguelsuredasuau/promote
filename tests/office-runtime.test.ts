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
