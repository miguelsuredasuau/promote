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
