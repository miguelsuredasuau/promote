import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerStore } from '../server/store';
import { reviewProject, HEARTBEAT_MS } from '../server/heartbeat';
const roots:string[]=[],stores:ControllerStore[]=[];
afterEach(()=>{stores.splice(0).forEach(s=>s.close());roots.splice(0).forEach(r=>rmSync(r,{recursive:true,force:true}));});
function setup(){const root=mkdtempSync(join(tmpdir(),'heartbeat-'));roots.push(root);const path=join(root,'db');const store=new ControllerStore(path);stores.push(store);return{store,path};}
it('reviews immediately, persists the next check across restart and runs every ten minutes',async()=>{
 const {store,path}=setup(),now=Date.now();
 expect(await reviewProject(store,undefined,now)).toBe(true);
 const reopened=new ControllerStore(path);stores.push(reopened);
 expect(await reviewProject(reopened,undefined,now+HEARTBEAT_MS-1)).toBe(false);
 expect(await reviewProject(reopened,undefined,now+HEARTBEAT_MS)).toBe(true);
 expect(reopened.activity().filter(e=>e.summary==='Scheduled project review completed')).toHaveLength(2);
 expect(reopened.orchestratorHeartbeat()).toMatchObject({executionMode:'local_review',paidCalls:0,status:'attention'});
});
it('concurrent reviews commit only one heartbeat and do not create work',async()=>{
 const {store}=setup();const now=Date.now();
 expect((await Promise.all([reviewProject(store,undefined,now),reviewProject(store,undefined,now)])).filter(Boolean)).toHaveLength(1);
 expect(store.engineeringReservations()).toHaveLength(0);expect(store.operatorSnapshot().operations).toHaveLength(0);
 expect(store.orchestratorHeartbeat().actions).toEqual(expect.arrayContaining([expect.objectContaining({kind:'project_unavailable'}),expect.objectContaining({kind:'intake_health'})]));
});
