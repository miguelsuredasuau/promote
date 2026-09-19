import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ControllerStore } from './store';
import type { Proposal } from '../contracts/orchestration';
import { hashCanonical } from '../contracts/hash';
import { rolePrompt } from './role-prompts';
import { loadDevin } from './devin-config';
import { dispatchEngineering } from './engineering';
import { DeliveryTask, runXartsDelivery } from './xarts-delivery';
const exec=promisify(execFile);

/** Versioned local rules. No model inference or paid calls are claimed by classification. */
export function classifyRecord(record:any):Proposal[] {
 const proposals:Proposal[]=[];
 const add=(category:Proposal['category'],key:unknown,title:string,priority:number,nextAction:string)=>{
  const evidenceKey=hashCanonical(key);
  proposals.push({id:`proposal-${evidenceKey.slice(0,24)}`,category,evidenceKey,title:title.slice(0,500),priority,nextAction});
 };
 const reproduction='Reproduce against the recorded release and original inputs; define independent acceptance checks before authorizing implementation.';
 if(record.schema==='xarts-chat/run-record@1'){
  for(const signal of record.signals??[]){
   if(signal.recovered&&signal.kind!=='packaging_workaround')continue;
   const category=signal.kind==='possible_library_defect'||signal.kind==='packaging_workaround'?'bug':signal.kind==='tool_delivery_error'?'infrastructure':'feedback';
   add(category,{kind:signal.kind,code:signal.code,source:record.release?.sourceSha??null},`${signal.kind}: ${signal.code}`,category==='bug'?85:60,reproduction);
  }
  if(record.agent?.completion==='missing')add('infrastructure',{kind:'missing_completion'},'Chat agent ended without confirmed completion',80,'Inspect the saved turn and tool-delivery evidence; distinguish transport failure from chart failure.');
 }else if(record.schema==='xarts-chat/feedback@1'){
  const subject=record.subject??record.chosen??record.rejected;
  const feature=/\b(feature|add support|wish|would like|could you add|new capability)\b/i.test(record.note??'');
  if(feature)add('feature',{chart:subject?.chartId??null,note:record.note},`Feature request: ${record.note}`,45,'Draft user outcome, acceptance examples, scope and a cost proposal; do not implement without authorization.');
  else if(record.value==='down'||record.kind==='preference')add('feedback',{chart:subject?.chartId??null,kind:record.kind,reasons:[...(record.reasons??[])].sort(),note:record.note??''},`Review ${record.kind} feedback for ${subject?.chartId??'chart'}`,55,'Compare the referenced renders and user reasons; classify preference versus reproducible defect.');
 }else if(record.schema==='xarts-chat/quality-snapshot@1'){
  for(const r of record.observations?.results??[]){
   if(['fail','error'].includes(r.status))add('bug',{kind:record.kind,id:r.id,release:record.observations?.summary?.release??null},`${record.kind} failure: ${r.id}`,r.status==='error'?85:75,reproduction);
  }
  for(const shim of record.observations?.summary?.release?.shims??[])add('bug',{kind:'packaging_workaround',code:shim.id},`Remove package workaround: ${shim.id}`,90,'Reproduce installation outside the monorepo and run the standalone consumer check.');
 }
 return proposals;
}

export async function inspectCandidate(store:ControllerStore,incidentId:string,checkout?:string) {
 const reservation=store.engineeringReservation(incidentId);
 if(!checkout||!reservation?.candidateSha||reservation.state!=='stopped')return {state:'blocked' as const,result:{reason:'candidate_or_checkout_not_ready'}};
 const task=reservation.task,sha=reservation.candidateSha;
 const git=async(args:string[]) => (await exec('git',args,{cwd:checkout,timeout:30000,killSignal:'SIGKILL',maxBuffer:1024*1024})).stdout.trim();
 const origin=await git(['remote','get-url','origin']);
 if(![ `https://github.com/${task.repo}.git`,`https://github.com/${task.repo}`,`git@github.com:${task.repo}.git`].includes(origin))return {state:'blocked' as const,result:{reason:'repository_identity_mismatch'}};
 if(!/^[a-f0-9]{40}$/.test(sha)||!/^promote\/[A-Za-z0-9._-]+$/.test(task.providerExtension.branch))throw Error('invalid_candidate_identity');
 await git(['fetch','--no-tags','origin',task.providerExtension.branch]);
 if(await git(['rev-parse','FETCH_HEAD'])!==sha)return{state:'blocked' as const,result:{reason:'candidate_branch_mismatch',candidateSha:sha}};
 try{await git(['merge-base','--is-ancestor',task.baseSha,sha]);}catch{return{state:'blocked' as const,result:{reason:'candidate_base_mismatch',candidateSha:sha}};}
 const files=(await exec('git',['diff','--no-renames','--name-only','-z',task.baseSha,sha],{cwd:checkout,timeout:10000,killSignal:'SIGKILL',maxBuffer:1024*1024})).stdout.split('\0').filter(Boolean);
 const inside=(file:string,paths:string[])=>paths.some(p=>file===p||file.startsWith(`${p}/`));
 const outside=files.filter(file=>!inside(file,task.allowedPaths)||inside(file,task.protectedPaths));
 return{state:'blocked' as const,result:{reason:outside.length?'candidate_scope_violation':'independent_runtime_checks_pending',candidateSha:sha,baseSha:task.baseSha,changedPaths:files,outsideAllowedPaths:outside,checks:{identity:'pass',ancestry:'pass',scope:outside.length?'fail':'pass',runtime:'not_run'},nextAction:outside.length?'Review the exact additional paths and authorize a revised scope, or obtain a candidate restricted to the approved paths.':'Run protected SDK build and regression gates in the isolated runner before release.'}};
}

export async function runOrchestrator(store:ControllerStore,root:string,checkout?:string) {
 const deliveryPath=join(root,'.local/delivery-task.json');
 if(existsSync(deliveryPath)){
  let deliveryTask=DeliveryTask.parse(JSON.parse(readFileSync(deliveryPath,'utf8')));
  if(deliveryTask.sourceBranch){
   const git=async(args:string[])=>(await exec('git',args,{cwd:deliveryTask.checkout,timeout:30000,killSignal:'SIGKILL',maxBuffer:1024*1024})).stdout.trim();
   const origin=await git(['remote','get-url','origin']);
   if(![`https://github.com/${deliveryTask.repo}`,`https://github.com/${deliveryTask.repo}.git`,`git@github.com:${deliveryTask.repo}.git`].includes(origin))throw Error('repository_identity_mismatch');
   await git(['fetch','--no-tags','origin',deliveryTask.sourceBranch]);
   deliveryTask=DeliveryTask.parse({...deliveryTask,candidateSha:await git(['rev-parse','FETCH_HEAD'])});
  }
  const workId=`delivery:${hashCanonical(deliveryTask)}`;
  if(!store.workQueue().some(work=>work.id===workId)){
   try{
    await exec('docker',['info','--format','{{.ServerVersion}}'],{timeout:5000,killSignal:'SIGKILL',maxBuffer:1024*1024});
    store.enqueueWork({id:workId,kind:'candidate_review',role:'qa',lane:'reliability',priority:100,
     payload:{deliveryTask},promptHash:rolePrompt('qa').hash});
   }catch{
    store.deliveryStatus({status:'waiting_for_docker',candidateSha:deliveryTask.candidateSha,nextAction:'Start Docker Desktop and free disk space. The next ten-minute review checks again.'});
    store.recordActivity('verification','Package verification is waiting for Docker',{reason:'docker_unavailable',candidateSha:deliveryTask.candidateSha,
     nextAction:'Start Docker Desktop and free disk space. The next scheduled review will check again; no paid session is launched.'});
   }
  }
 }
 const feedback=rolePrompt('feedback');let triaged=0;
 for(const source of store.untriagedRecords(100))if(store.triageRecord(source.sourceKey,classifyRecord(source.record),feedback.hash))triaged++;
 for(const proposal of store.proposals()){
  const role=proposal.category==='feature'?'product':'feedback';
  store.enqueueWork({id:`assess:${proposal.id}`,kind:'proposal_assessment',role,lane:['feature','feedback'].includes(proposal.category)?'discovery':'reliability',priority:proposal.priority,payload:{proposalId:proposal.id},promptHash:rolePrompt(role).hash});
 }
 for(const reservation of store.engineeringReservations())if(reservation.state==='stopped'&&reservation.candidateSha)
  store.enqueueWork({id:`review:${reservation.incidentId}:${reservation.candidateSha}`,kind:'candidate_review',role:'qa',lane:'reliability',priority:100,payload:{incidentId:reservation.incidentId},promptHash:rolePrompt('qa').hash});
 const provider=loadDevin(root);
 if(provider.status.paidDispatchEnabled&&provider.task&&!store.engineeringReservation(provider.task.incidentId))
  store.enqueueWork({id:`dispatch:${hashCanonical(provider.task)}`,kind:'engineering_dispatch',role:'engineer',lane:'reliability',priority:95,payload:{taskHash:hashCanonical(provider.task)},promptHash:rolePrompt('engineer').hash});
 let executed=0;
 for(let i=0;i<50;i++){
  const work=store.claimWork();if(!work)break;
  try{
   if(work.kind==='proposal_assessment'){
    const proposal=work.payload.ownerDecision ? work.payload.approvedProposal : store.proposals().find(p=>p.id===work.payload.proposalId);
    if(!proposal)throw Error('proposal_missing');
    store.finishWork(work.id,work.token,'completed',{proposalId:proposal.id,category:proposal.category,confidence:'needs_validation',evidenceCount:proposal.sources.length,nextAction:proposal.nextAction,implementationAuthorized:false,executionMode:'local_rules',...(work.payload.ownerDecision?{planningBrief:{title:proposal.title,objective:proposal.nextAction,evidence:proposal.sources,steps:['Review the cited customer evidence','Define a reproducible acceptance example','Propose affected files and independent checks','Return an implementation estimate for separate approval'],costEstimate:null,requiresOwnerApproval:['Implementation scope','Paid session limit','Any release'],ownerFeedback:store.ownerDecisions().find(d=>d.revision===work.payload.ownerDecision)?.feedback??''}}:{})});
   }else if(work.kind==='candidate_review'){
    const review=work.payload.deliveryTask?await runXartsDelivery(store,root,work.payload.deliveryTask):await inspectCandidate(store,String(work.payload.incidentId),checkout);
    store.finishWork(work.id,work.token,review.state,review.result);
    if('candidateSha' in review.result&&review.result.candidateSha)store.updateEngineering(String(work.payload.incidentId),{reason:review.result.reason});
   }else{
    const current=loadDevin(root);
    if(!current.status.paidDispatchEnabled||!current.adapter||hashCanonical(current.task)!==work.payload.taskHash)store.finishWork(work.id,work.token,'blocked',{reason:'authorization_changed'});
    else{const result=await dispatchEngineering(store,current.adapter,current.mandate,current.task);store.finishWork(work.id,work.token,'completed',{outcome:result});}
   }
  }catch{store.finishWork(work.id,work.token,'blocked',{reason:'role_execution_failed',nextAction:'Inspect and reconcile this work item; no automatic retry of external effects.'});}
  executed++;
 }
 return{triaged,executed,promptHash:rolePrompt('orchestrator').hash,executionMode:'local_scheduler'};
}
