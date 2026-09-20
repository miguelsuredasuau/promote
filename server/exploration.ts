import {z} from 'zod';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ExplorationSpec} from '../contracts/exploration';
import {ControllerStore} from './store';
import {loadDevin} from './devin-config';
import type {DevinAdapter} from '../adapters/devin/client';
const exec=promisify(execFile);
const Input=z.object({id:z.string().uuid(),baseSha:z.string().regex(/^[a-f0-9]{40}$/),maxAcu:z.number().int().min(1).max(100),minutes:z.number().int().min(5).max(120),focus:z.string().trim().min(1).max(2000)}).strict();
export async function explorationTarget(checkout:string) {
 const git=async(args:string[])=>(await exec('git',args,{cwd:checkout,timeout:10000,maxBuffer:1024*1024})).stdout.trim();
 const origin=await git(['config','--get','remote.origin.url']);
 const repository=/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(origin)?.[1];
 if(!repository)throw Error('Test target must have a GitHub origin');
 const baseSha=await git(['rev-parse','HEAD']);
 // This profile requires the committed sandbox contract; do not guess another app's setup.
 await git(['cat-file','-e',`${baseSha}:scripts/sandbox.mjs`]);
 const dirty=await git(['status','--porcelain','--untracked-files=no']);
 return {repository,baseSha,mode:'ui-fixture',dirty:!!dirty};
}
export async function launchExploration(store:ControllerStore,root:string,checkout:string,input:unknown) {
 const request=Input.parse(input);
 const existing=store.explorations().find(r=>r.spec.id===request.id);
 if(existing){
  for(const key of ['baseSha','maxAcu','minutes','focus'] as const)if(existing.spec[key]!==request[key])throw Error('Existing test request differs');
  return existing;
 }
 const target=await explorationTarget(checkout);
 if(target.baseSha!==request.baseSha || target.dirty)throw Error('Checkout changed; commit and review target again');
 const config=loadDevin(root);
 if(!config.adapter || config.status.status==='awaiting_billing_verification')throw Error('Devin credentials or funding verification unavailable');
 const createdAt=new Date().toISOString();
 const spec=ExplorationSpec.parse({...request,repository:target.repository,schemaVersion:1,mode:'ui-fixture',createdAt,deadline:new Date(Date.now()+request.minutes*60000).toISOString(),promptHash:createHash('sha256').update(readFileSync(new URL('../prompts/explorer-v1.md',import.meta.url))).digest('hex')});
 const {claimed,record}=store.reserveExploration(spec);if(!claimed)return record;
 let outcome;
 try{outcome=await config.adapter.startExploration(spec);}catch{outcome={kind:'unknown_outcome',reason:'transport_uncertain'};}
 return store.updateExploration(spec.id,outcome.kind==='created'?{state:'running',remoteId:'remoteId' in outcome?outcome.remoteId:null}:{state:outcome.kind==='rejected'?'rejected':'held',reason:'reason' in outcome?outcome.reason:'unknown'});
}
export async function observeExplorations(store:ControllerStore,adapter:DevinAdapter) {
 for(const row of store.explorations()) {
  if(!row.remoteId)continue; // An ambiguous create is never retried automatically.
  try{
   const observation=await adapter.inspect(row.remoteId);
   store.updateExploration(row.spec.id,{usageAcu:observation.usage?.amount??null,observedAt:observation.observedAt});
   if(row.state==='stopped')continue;
   const finished=['finished','failed','cancelled'].includes(observation.state);
   const expired=Date.parse(row.spec.deadline)<=Date.now();
   if(finished||expired||row.state==='stopping'){
    const report=await adapter.explorationReport(row.remoteId);
    const bound=report?.baseSha===row.spec.baseSha&&report?.mode===row.spec.mode;
    const stop=await adapter.cancel(row.remoteId,`stop:test:${row.spec.id}`);
    store.updateExploration(row.spec.id,{state:stop.kind==='confirmed'?'stopped':'stopping',report:bound?report:null,reason:bound?'report_received_unverified':expired?'deadline_reached':'report_missing_or_wrong_commit'});
   }
  }catch{store.updateExploration(row.spec.id,{reason:'provider_observation_unavailable'});}
 }
}
