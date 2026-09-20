import {z} from 'zod';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ExplorationSpec} from '../contracts/exploration';
import {ControllerStore} from './store';
import {hashCanonical} from '../contracts/hash';
import {loadDevin} from './devin-config';
import type {DevinAdapter} from '../adapters/devin/client';
import type {FeedbackOutcome} from '../contracts/adapters';
import { observationQueue } from './observation-queue';
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
const observing=new WeakSet<ControllerStore>();
export async function observeExplorations(store:ControllerStore,adapter:DevinAdapter,clock:number|(()=>number)=Date.now) {
 if(observing.has(store))return;
 observing.add(store);
 const currentTime=typeof clock==='function'?clock:()=>clock;
 try {
 const rows=observationQueue(store,store.explorations(),currentTime(),r=>({key:`exploration:${r.spec.id}`,terminal:['stopped','rejected'].includes(r.state),remoteId:r.remoteId,observedAt:r.observedAt}));
 for(const row of rows) {
  if(!row.remoteId)continue; // An ambiguous create is never retried automatically.
  try{
   const observation=await adapter.inspect(row.remoteId);
   store.updateExploration(row.spec.id,{usageAcu:observation.usage?.amount??null,observedAt:observation.observedAt});
   if(['stopped','rejected'].includes(row.state))continue;
   const finished=['finished','failed','cancelled'].includes(observation.state);
   const exhausted=Math.max(row.usageAcu??0,observation.usage?.amount??0)>=row.spec.maxAcu;
   let waiting:Awaited<ReturnType<DevinAdapter['explorationWaitingState']>>|null=null;
   if(observation.state==='waiting') {
    store.updateExploration(row.spec.id,{state:'held',reason:'waiting_for_user'});
    // Inspect the structured report before considering another message. Finished work stays finished.
    try {waiting=await adapter.explorationWaitingState(row.remoteId);}
    catch {store.updateExploration(row.spec.id,{reason:'waiting_report_unavailable'});}
   }
   const now=currentTime();
   const expired=Date.parse(row.spec.deadline)<=now;
   const waitingReport=waiting?.report;
   const completed=waitingReport?.baseSha===row.spec.baseSha&&waitingReport?.mode===row.spec.mode;
   if(finished||expired||exhausted||completed||row.state==='stopping'){
    let report=completed?waitingReport:row.report;
    if(!report)try{report=await adapter.explorationReport(row.remoteId);}catch{/* Report transport cannot prevent termination. */}
    const bound=report?.baseSha===row.spec.baseSha&&report?.mode===row.spec.mode;
    const stop=await adapter.cancel(row.remoteId,`stop:test:${row.spec.id}`);
    store.updateExploration(row.spec.id,{state:stop.kind==='confirmed'?'stopped':'stopping',report:bound?report:null,reason:bound?'report_received_unverified':expired?'deadline_reached':exhausted?'acu_ceiling_reached':'report_missing_or_wrong_commit'});
    if(bound){const record={schema:'promote/exploration@1',runId:row.spec.id,repository:row.spec.repository,baseSha:row.spec.baseSha,summary:report!.summary,report,verification:'unverified'};store.ingest('exploration:'+row.spec.id,hashCanonical(record),record,null);}
   } else if(observation.state==='waiting'&&waiting) {
    if(waiting.waitingForApproval){store.updateExploration(row.spec.id,{reason:'provider_approval_required'});continue;}
    if(!waiting.waitingForUser)continue;
    const policy=store.operatingPolicy()?.policy;
    const budget=store.operatingBudget(now);
    const authorized=policy&&!policy.paused&&policy.proactiveTests&&Date.parse(policy.expiresAt)>now&&policy.testRepository===row.spec.repository&&policy.sessionAcu>=row.spec.maxAcu&&policy.dailyAcu>=budget.committedAcu&&policy.totalAcu>=budget.totalCommittedAcu;
    if(!authorized){store.updateExploration(row.spec.id,{reason:'continuation_not_authorized'});continue;}
    const attempts:Array<{id:string;at:string;outcome:string}>=Array.isArray(row.continuations)?row.continuations:[];
    if(attempts.some(a=>!['delivered','rejected'].includes(a.outcome))){store.updateExploration(row.spec.id,{reason:'continuation_outcome_uncertain'});continue;}
    if(attempts.length>=2){store.updateExploration(row.spec.id,{reason:'continuation_limit_reached'});continue;}
    const previous=attempts.at(-1);
    if(previous&&(!Number.isFinite(Date.parse(previous.at))||now-Date.parse(previous.at)<120000)){store.updateExploration(row.spec.id,{reason:'continuation_cooldown'});continue;}
    const intent={id:`continue:test:${row.spec.id}:${attempts.length+1}`,at:new Date(now).toISOString(),outcome:'pending'};
    // Persist intent before the paid transport; uncertain delivery is never resent automatically.
    store.updateExploration(row.spec.id,{continuations:[...attempts,intent],reason:'continuation_pending'});
    let result:FeedbackOutcome;
    try {result=await adapter.continueExploration(row.remoteId,row.spec,intent.id);}
    catch {result={kind:'unknown_outcome' as const,reason:'continuation_transport_uncertain'};}
    store.updateExploration(row.spec.id,{continuations:[...attempts,{...intent,outcome:result.kind}],reason:result.kind==='delivered'?'continuation_sent_awaiting_observation':result.reason});
   } else if(['running','queued'].includes(observation.state)&&row.state==='held') {
    store.updateExploration(row.spec.id,{state:'running',reason:null});
   }
  }catch{store.updateExploration(row.spec.id,{reason:'provider_observation_unavailable'});}
 }
 } finally {observing.delete(store);}
}
