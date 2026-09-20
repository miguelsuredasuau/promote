import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { importChatOutbox } from '../server/chat-intake';
import { ControllerStore } from '../server/store';
const roots:string[]=[];const stores:ControllerStore[]=[];
afterEach(()=>{for(const s of stores.splice(0))s.close();for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});});
function setup(){const root=mkdtempSync(join(tmpdir(),'promote-inbox-'));roots.push(root);const outbox=join(root,'outbox'),receipts=join(root,'receipts');mkdirSync(outbox);const store=new ControllerStore(join(root,'db'));stores.push(store);return{root,outbox,receipts,store};}
const record=()=>({schema:'xarts-chat/run-record@1',runId:'test-run',conversationId:'test-conversation',startedAt:'2026-09-19T10:00:00.000Z',finishedAt:'2026-09-19T10:01:00.000Z',request:{message:'Synthetic request',messageHash:createHash('sha256').update('Synthetic request').digest('hex')},dataset:{sha256:'a'.repeat(64),nature:'synthetic'},release:{kind:'baseline',sourceSha:'b'.repeat(40),packageHash:'c'.repeat(64)},agent:{completion:'confirmed'},outcome:'rendered',renders:[],signals:[]});
it('durably imports a run once and acknowledges it without inventing an incident',async()=>{
 const s=setup();writeFileSync(join(s.outbox,'test-run.json'),JSON.stringify(record()));
 expect(await importChatOutbox(s.store,s.outbox,s.receipts)).toEqual({imported:1,duplicates:0,quarantined:0});
 const other=new ControllerStore(join(s.root,'db'));stores.push(other);
 expect(await importChatOutbox(other,s.outbox,s.receipts)).toEqual({imported:0,duplicates:1,quarantined:0});
 expect(other.inboxSnapshot()).toHaveLength(1);expect(other.operatorSnapshot().incidents).toHaveLength(0);
 expect(JSON.parse(readFileSync(join(s.receipts,'test-run.json'),'utf8'))).toMatchObject({status:'received',disposition:'awaiting_triage'});
});
it('quarantines modified records and never overwrites original evidence',async()=>{
 const s=setup();writeFileSync(join(s.outbox,'test-run.json'),JSON.stringify(record()));await importChatOutbox(s.store,s.outbox,s.receipts);
 writeFileSync(join(s.outbox,'test-run.json'),JSON.stringify({...record(),outcome:'changed'}));
 expect((await importChatOutbox(s.store,s.outbox,s.receipts)).quarantined).toBe(1);
 expect(s.store.inboxSnapshot()[0].outcome).toBe('rendered');
});
it('ignores atomic temporary files and rejects forged message hashes',async()=>{
 const s=setup();writeFileSync(join(s.outbox,'pending.tmp'),'{');
 const raw=record();raw.request.message='changed';writeFileSync(join(s.outbox,'test-run.json'),JSON.stringify(raw));
 expect(await importChatOutbox(s.store,s.outbox,s.receipts)).toEqual({imported:0,duplicates:0,quarantined:1});
});
it('receives explicit user ratings separately from run outcomes',async()=>{
 const s=setup();const id='12345678-1234-4234-8234-123456789abc';
 const feedback={schema:'xarts-chat/feedback@1',id,at:'2026-09-19T10:00:00.000Z',conversationId:'test',kind:'rating',value:'down',reasons:['hard_to_read'],note:'Synthetic feedback',subject:{runId:'test-run',artifact:'chart-1',request:'Synthetic request',chartId:'bar',dataHash:'a'.repeat(64),svgHash:'b'.repeat(64),release:{kind:'baseline'}}};
 writeFileSync(join(s.outbox,`feedback-${id}.json`),JSON.stringify(feedback));
 expect((await importChatOutbox(s.store,s.outbox,s.receipts)).imported).toBe(1);
 expect(s.store.inboxSnapshot()[0]).toMatchObject({kind:'rating',outcome:'down',summary:'Synthetic feedback'});
});
it('archives quality versions and imports partial progress safely',async()=>{
 const {importChatDiagnostics,importChatProgress}=await import('../server/chat-intake');
 const s=setup();writeFileSync(join(s.root,'quality.json'),JSON.stringify({summary:{total:391,fail:27},results:[]}));
 expect(await importChatDiagnostics(s.store,s.root)).toBe(1);expect(await importChatDiagnostics(s.store,s.root)).toBe(0);
 for(const bad of [{summary:{},results:[null]},{summary:{release:{shims:1}},results:[]},{summary:{},results:[{id:'x'}]}]){
  writeFileSync(join(s.root,'coverage.json'),JSON.stringify(bad));
  await expect(importChatDiagnostics(s.store,s.root)).rejects.toThrow('invalid_diagnostics');
 }
 expect(s.store.inboxSnapshot()).toHaveLength(1);
 const runId='20260919T100000-1234abcd';mkdirSync(join(s.root,runId));
 const event={schema:'xarts-chat/progress@1',runId,eventId:'test',at:'2026-09-19T10:00:00Z',t:'request',message:'Synthetic request'};
 writeFileSync(join(s.root,runId,'events.jsonl'),JSON.stringify(event)+'\n'+'{incomplete');
 expect(await importChatProgress(s.store,s.root)).toBe(1);expect(await importChatProgress(s.store,s.root)).toBe(0);
 expect(s.store.chatProgress(runId)[0].event.t).toBe('request');expect(s.store.chatActivity()[0].events).toBe(1);
 writeFileSync(join(s.root,runId,'events.jsonl'),JSON.stringify({...event,message:'edited history'})+'\n');
 await expect(importChatProgress(s.store,s.root)).rejects.toThrow('history changed');
});
it('continues outbox and progress during a broken diagnostics write, then recovers without duplicates',async()=>{
 const {importChatCycle}=await import('../server/chat-intake');
 const s=setup();writeFileSync(join(s.outbox,'test-run.json'),JSON.stringify(record()));
 writeFileSync(join(s.root,'quality.json'),'{"summary":');
 const runId='20260919T100000-1234abcd';mkdirSync(join(s.root,runId));
 writeFileSync(join(s.root,runId,'events.jsonl'),JSON.stringify({schema:'xarts-chat/progress@1',runId,t:'request'})+'\n');
 const first=await importChatCycle(s.store,s.outbox,s.receipts);
 expect(first).toMatchObject({status:'error',records:{imported:1},progress:1,failures:[{stage:'diagnostics',reason:'invalid_json_or_incomplete_write'}]});
 writeFileSync(join(s.root,'quality.json'),JSON.stringify({summary:{total:1},results:[]}));
 expect(await importChatCycle(s.store,s.outbox,s.receipts)).toMatchObject({status:'watching',records:{duplicates:1},diagnostics:1,progress:0,failures:[]});
});
it('records a safe source error without exporting malformed source contents',async()=>{
 const {importChatCycle}=await import('../server/chat-intake');const s=setup();
 const runId='20260919T100000-1234abcd';mkdirSync(join(s.root,runId));
 writeFileSync(join(s.root,runId,'events.jsonl'),'private malformed transcript\n');
 const result=await importChatCycle(s.store,s.outbox,s.receipts);
 expect(result.failures).toEqual([{stage:'progress',reason:'invalid_json_or_incomplete_write'}]);
 expect(JSON.stringify(result)).not.toContain('private malformed');
});

it('prioritizes an importer failure over quarantine attention, then recovers to attention',async()=>{
 const {importChatCycle}=await import('../server/chat-intake');
 const s=setup();writeFileSync(join(s.outbox,'bad.json'),'{}');
 writeFileSync(join(s.root,'quality.json'),'{');
 expect(await importChatCycle(s.store,s.outbox,s.receipts)).toMatchObject({status:'error',records:{quarantined:1}});
 writeFileSync(join(s.root,'quality.json'),JSON.stringify({summary:{},results:[]}));
 expect(await importChatCycle(s.store,s.outbox,s.receipts)).toMatchObject({status:'attention',records:{quarantined:1},failures:[]});
});

it('accepts the quality producer release label and coverage release object without inventing shims',async()=>{
 const {importChatDiagnostics}=await import('../server/chat-intake');const s=setup();
 writeFileSync(join(s.root,'quality.json'),JSON.stringify({summary:{total:1,release:'Baseline documented release'},results:[{id:'alluvial',status:'fail'}]}));
 writeFileSync(join(s.root,'coverage.json'),JSON.stringify({summary:{total:1,release:{shims:[{id:'ts-loader'}]}},results:[]}));
 expect(await importChatDiagnostics(s.store,s.root)).toBe(2);
 expect(await importChatDiagnostics(s.store,s.root)).toBe(0);
 expect(s.store.inboxSnapshot()).toHaveLength(2);
});
