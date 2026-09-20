import {it,expect,afterEach} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ControllerStore} from '../server/store';
import {replayPublishedChart} from '../server/chat-replay';
import type {DeliveryTask} from '../server/xarts-delivery';
const roots:{root:string;store:ControllerStore}[]=[];
afterEach(()=>{for(const {root,store} of roots.splice(0)){store.close();rmSync(root,{recursive:true,force:true});}});
function setup(){const root=mkdtempSync(join(tmpdir(),'chat-replay-')),store=new ControllerStore(join(root,'db'));roots.push({root,store});return{root,store,task:{chatRoot:root,runId:'source',chartId:'chart-1',registry:join(root,'registry')} as DeliveryTask};}
it('returns an existing confirmation without replaying or appending duplicate activity',async()=>{const {root,store,task}=setup();mkdirSync(join(root,'.local/chat-replays'),{recursive:true});writeFileSync(join(root,'.local/chat-replays/release.json'),JSON.stringify({status:'confirmed',runId:'saved',releaseId:'release'}));expect(await replayPublishedChart(root,store,task,'release')).toMatchObject({status:'confirmed',runId:'saved'});expect(store.activity(0)).toHaveLength(0);});
it('retains a failed replay as blocked and never silently retries it',async()=>{const {root,store,task}=setup();const first=await replayPublishedChart(root,store,task,'release');expect(first.status).toBe('blocked');const before=store.activity(0).length;const again=await replayPublishedChart(root,store,task,'release');expect(again).toEqual(first);expect(store.activity(0)).toHaveLength(before);expect(JSON.parse(readFileSync(join(root,'.local/chat-replays/release.json'),'utf8')).status).toBe('blocked');});
