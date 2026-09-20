import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {ControllerStore} from '../server/store';
import {createOperatorServer} from '../server/http';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0))await close();});
async function setup(){
 const root=mkdtempSync(join(tmpdir(),'promote-policy-http-'));const store=new ControllerStore(join(root,'store.sqlite'));const server=createOperatorServer({root,store});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('Missing port');
 cleanup.push(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();rmSync(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${address.port}`;const {token}=await(await fetch(base+'/api/owner-session')).json() as {token:string};
 const headers={'Content-Type':'application/json','X-Owner-Token':token,Origin:base};
 return{base,store,headers};
}
it('exposes paused defaults without writing or dispatching',async()=>{
 const {base,store}=await setup();const response=await fetch(base+'/api/operating-policy');expect(response.status).toBe(200);
 const data=await response.json() as any;expect(data).toMatchObject({configured:false,revision:0,policy:{paused:true,dailyAcu:0,maxConcurrentSessions:1},runtime:{engineering:[],explorations:[]}});
 expect(store.operatingPolicy()).toBeNull();expect(response.headers.get('cache-control')).toBe('no-store');
});
it('requires owner session, same origin, JSON and bounded input',async()=>{
 const {base,headers}=await setup();const url=base+'/api/operating-policy';
 expect((await fetch(url,{method:'POST',body:'{}'})).status).toBe(403);
 expect((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:'{}'})).status).toBe(403);
 expect((await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'})).status).toBe(415);
 expect((await fetch(url,{method:'POST',headers,body:'x'.repeat(12001)})).status).toBe(413);
 expect((await fetch(url,{method:'POST',headers,body:'{'})).status).toBe(400);
});
it('saves paused policy durably, rejects stale revisions and invalid limits',async()=>{
 const {base,headers,store}=await setup();const url=base+'/api/operating-policy';const data=await(await fetch(url)).json() as any;
 const input={revision:data.revision,policy:{...data.policy,dailyAcu:40,sessionAcu:5,reviewMinutes:1}};
 const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(input)});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({configured:true,revision:1,policy:{paused:true,dailyAcu:40}});
 expect(store.engineeringReservations()).toEqual([]);expect(store.explorations()).toEqual([]);
 expect((await fetch(url,{method:'POST',headers,body:JSON.stringify(input)})).status).toBe(409);
 expect((await fetch(url,{method:'POST',headers,body:JSON.stringify({revision:1,policy:{...input.policy,sessionAcu:0}})})).status).toBe(400);
 expect(store.operatingPolicy()?.revision).toBe(1);
});
