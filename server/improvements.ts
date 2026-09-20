import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {z} from 'zod';
import {ControllerStore,StoreConflictError} from './store';
import {decisionRevision} from './owner-decisions';
import {hashCanonical} from '../contracts/hash';
import {EngineeringTask} from '../contracts/adapters';
import {EngineeringMandate,authorizeEngineering} from '../contracts/mandate';
import {Incident} from '../contracts/records';
import {DeliveryTask} from './xarts-delivery';
import {loadDevin} from './devin-config';
import {dispatchEngineering} from './engineering';
import {decisionDemos as definitions} from '../web/decision-demo.js';

const Binding=z.object({proposalId:z.string(),revision:z.string().length(64),task:EngineeringTask,mandate:EngineeringMandate,incident:Incident,delivery:DeliveryTask}).strict();
export const ExecutionInput=z.object({proposalId:z.string(),revision:z.string().length(64),taskHash:z.string().length(64)}).strict();
export function executionBindings(root:string){const file=join(root,'.local/improvement-executions.json');return existsSync(file)?z.array(Binding).parse(JSON.parse(readFileSync(file,'utf8'))):[];}
export function registerImprovements(store:ControllerStore,checkout:string,chatRoot:string){
 const git=(cwd:string,...args:string[])=>execFileSync('git',args,{cwd,encoding:'utf8',timeout:10000}).trim();
 const sourceRevision=git(checkout,'rev-parse','HEAD'),chatRevision=git(chatRoot,'rev-parse','HEAD');
 const sources=[{repository:'xarts',revision:sourceRevision,path:'docs/ROADMAP.md',hash:hashCanonical(readFileSync(join(checkout,'docs/ROADMAP.md'),'utf8'))},
 {repository:'xarts-chat',revision:chatRevision,path:'docs/FINDINGS.md',hash:hashCanonical(readFileSync(join(chatRoot,'docs/FINDINGS.md'),'utf8'))}];
 return definitions.map(d=>{
  const record={schema:'promote/project-analysis@1',projectId:'xarts',kind:'feature_analysis',summary:d.evidence,definition:d,sources,limitation:'Documented opportunity; implementation and current reproduction must be verified.'};
  const digest=hashCanonical(record),sourceKey=`project-analysis:xarts:${d.id}:${digest}`,id=`xarts-${d.id}-${digest.slice(0,12)}`;
  store.ingest(sourceKey,digest,record,null);
  store.triageRecord(sourceKey,[{id,category:'feature',title:d.title,priority:d.id==='xarts-formatting'?65:45,evidenceKey:sourceKey,nextAction:d.recommendation+' Acceptance: '+d.validation}],hashCanonical({role:'project_analysis',version:1}));
  return{id,revision:decisionRevision(store.proposals().find(p=>p.id===id))};
 });
}
export function improvementExecution(root:string,store:ControllerStore,proposal:any){
 const binding=executionBindings(root).find(b=>b.proposalId===proposal.id&&b.revision===decisionRevision(proposal));
 if(!binding)return {status:'scope_required',canExecute:false,reason:'Falta una tarea acotada con reproducción, pruebas y presupuesto.',taskHash:null,maxAcu:null};
 const reservation=store.engineeringReservation(binding.task.incidentId);
 if(reservation){
  const work=store.workQueue().find(w=>w.payload?.proposalId===proposal.id&&w.payload?.deliveryTask?.candidateSha===reservation.candidateSha&&w.payload?.deliveryTask?.attempt===binding.delivery.attempt);
  const delivered=work?.state==='completed'&&work.result?.reason==='verified_release_activated';
  const receiptPath=delivered?join(root,'.local/chat-replays',String(work.result.releaseId)+'.json'):null;
  const replay=receiptPath&&existsSync(receiptPath)?JSON.parse(readFileSync(receiptPath,'utf8')):null;
  const reason=delivered&&replay?.status==='confirmed'?'Reparación publicada y comprobada en Xarts Chat con el mismo SQL y los mismos datos.':delivered?'Paquete verificado y activado. Falta confirmar su uso en un nuevo turno del chat.':work?.state==='blocked'?'La verificación bloqueó la entrega. Consulta el registro.':reservation.candidateSha?'Candidato recibido; verificación y entrega pendientes.':reservation.state==='running'?'Devin está trabajando en la reparación.':'Trabajo retenido; consulta el registro del proveedor.';
  return{status:delivered?'active':work?.state??reservation.state,canExecute:false,reason,taskHash:hashCanonical(binding.task),maxAcu:reservation.maxAcu,incidentId:binding.task.incidentId,remoteId:reservation.remoteId,candidateSha:reservation.candidateSha,usageAcu:reservation.usageAcu,releaseId:delivered?work.result.releaseId:null,replay:replay?{status:replay.status,runId:replay.runId,sourceRunId:replay.sourceRunId,outcome:replay.outcome}:null,scope:binding.incident.requestedOutcome.summary};
 }
 try{authorizeEngineering(binding.mandate,binding.task);}catch{return{status:'authorization_invalid',canExecute:false,reason:'La autorización de esta tarea ha caducado o no coincide.',taskHash:null,maxAcu:binding.mandate.maxSessionAcu};}
 const funding=JSON.parse(readFileSync(join(root,'.local/engineering-funding-policy.json'),'utf8'));
 const provider=loadDevin(root);
 const ready=!!provider.adapter&&funding.balanceVerified===true&&funding.autoReloadVerifiedDisabled===true&&funding.additionalBillingAllowed===false;
 return{status:ready?'ready':'funding_or_provider_required',canExecute:ready,reason:ready?'Reparación acotada lista para ejecutar con Devin.':'Verificar proveedor y crédito existente.',taskHash:hashCanonical(binding.task),maxAcu:binding.mandate.maxSessionAcu,incidentId:binding.task.incidentId,scope:binding.incident.requestedOutcome.summary};
}
export function projectImprovements(root:string,store:ControllerStore){
 return store.proposals().filter(p=>p.evidenceKey.startsWith('project-analysis:xarts:')).flatMap(p=>{
  const definition=definitions.find(d=>p.evidenceKey.startsWith(`project-analysis:xarts:${d.id}:`));if(!definition)return[];
  const revision=decisionRevision(p);return[{...definition,proposalId:p.id,revision,sourceKeys:p.sources,resolution:store.ownerDecisions().find(d=>d.proposalId===p.id&&d.revision===revision)??null,execution:improvementExecution(root,store,p)}];
 });
}
export async function executeImprovement(root:string,store:ControllerStore,raw:unknown){
 const input=ExecutionInput.parse(raw),proposal=store.proposals().find(p=>p.id===input.proposalId);
 if(!proposal||decisionRevision(proposal)!==input.revision)throw new StoreConflictError('proposal_revision_changed');
 const binding=executionBindings(root).find(b=>b.proposalId===input.proposalId&&b.revision===input.revision);
 if(!binding||hashCanonical(binding.task)!==input.taskHash)throw new StoreConflictError('execution_scope_changed');
 const state=improvementExecution(root,store,proposal);
 if(!state.canExecute){if(store.engineeringReservation(binding.task.incidentId))return state;throw new StoreConflictError(state.reason);}
 const origin=execFileSync('git',['remote','get-url','origin'],{cwd:binding.delivery.checkout,encoding:'utf8',timeout:10000}).trim();
 if(!origin.replace(/\.git$/,'').endsWith('/'+binding.task.repo)&&!origin.replace(/\.git$/,'').endsWith(':'+binding.task.repo))throw new StoreConflictError('repository_identity_mismatch');
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:binding.delivery.checkout,encoding:'utf8',timeout:10000}).trim();
 if(head!==binding.task.baseSha||binding.incident.baseCommit!==head||binding.delivery.baseSha!==head||binding.delivery.repo!==binding.task.repo)throw new StoreConflictError('base_revision_changed');
 if(!store.getIncident(binding.incident.id)){
  store.createIncident(binding.incident);const ctx={now:new Date().toISOString(),activeRemoteSessions:0,activeLocalProcesses:0};
  store.advance(binding.incident.id,0,'reproducing',ctx);store.advance(binding.incident.id,1,'engineering',ctx);
 }
 store.recordActivity('owner_decision','Owner authorized scoped Xarts implementation',{proposalId:proposal.id,revision:input.revision,taskHash:input.taskHash,incidentId:binding.task.incidentId,maxAcu:binding.mandate.maxSessionAcu,release:'only_after_independent_acceptance'});
 return dispatchEngineering(store,loadDevin(root).adapter!,binding.mandate,binding.task);
}
