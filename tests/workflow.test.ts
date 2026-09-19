import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerStore } from '../server/store';
import { scheduleWorkflow, tickWorkflow, type WorkflowPorts } from '../server/workflow';
import { scenarioBuilder } from '../fixtures/contracts/factories';
import { hashGateProfile } from '../contracts/gates';
import { evaluationSnapshots } from '../server/qa';
import { createOfficeModel } from '../web/office-model.js';
import type { GateProfile } from '../contracts/profile';
import type { Candidate, GateResult } from '../contracts/records';
const roots: string[] = []; const stores: ControllerStore[] = [];
afterEach(() => { for(const s of stores.splice(0))s.close(); for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true}); });
function setup(maxAttempts=3) {
  const dir=mkdtempSync(join(tmpdir(),'promote-workflow-')); roots.push(dir);
  const path=join(dir,'db.sqlite'); const store=new ControllerStore(path); stores.push(store);
  const incident=scenarioBuilder('workflow-test','Synthetic workflow only').finish([]).incident;
  const profile: GateProfile={schemaVersion:1,profileId:'test-profile',libraryId:incident.targetLibrary,evaluatorRevision:incident.evaluatorRevision,
    gates:[{gateId:'xarts.financialBridge',gateVersion:1,requirement:'required',notApplicableAllowed:false}]};
  incident.acceptanceContractHash=hashGateProfile(profile);store.createIncident(incident);
  const config={mode:'fixture',profile,maxAttempts,deadline:new Date(Date.now()+60000).toISOString()};
  scheduleWorkflow(store,incident.id,config);
  let starts=0, feedback=0, stops=0, releases=0;
  const ports: WorkflowPorts={mode:'fixture',reproduce:async()=> 'reproduced',
    start:async()=>{starts++;return {kind:'created',remoteId:'fixture-session'};},
    candidate:async(_,ordinal)=>({schemaVersion:1,attemptId:`attempt-${ordinal}`,repo:'fixture/project',baseSha:incident.baseCommit,
      candidateSha:String(ordinal).repeat(40),agentSummary:'Fixture',proposedTests:[],changedPaths:{computedBy:'controller',paths:['src/chart.ts']}}),
    evaluate:async(candidate:Candidate)=>[{schemaVersion:1,id:`gate-${candidate.attemptId}`,gateId:profile.gates[0].gateId,gateVersion:1,
      candidateSha:candidate.candidateSha,evaluatorRevision:incident.evaluatorRevision,inputHash:incident.inputsHash,
      outcome:candidate.attemptId==='attempt-1'?'fail':'pass',reason:'fixture_evidence',expected:1,actual:1,
      logArtifactId:'fixture-log',durationMs:1,runnerIdentity:'fixture',startedAt:incident.createdAt,finishedAt:incident.createdAt} as GateResult],
    feedback:async()=>{feedback++;return {kind:'delivered'};},stop:async()=>{stops++;return true;},
    release:async(identity,results)=>{releases++;return {schemaVersion:1,id:'fixture-release',incidentId:incident.id,acceptedSha:identity.candidateSha,
      packageHash:'a'.repeat(64),outputArtifactHash:'b'.repeat(64),manifestHash:'c'.repeat(64),gateResultIds:results.map(r=>r.id),priorReleaseId:null,
      destination:'local_demo_registry',activatedAt:new Date().toISOString()};}};
  return {store,path,incident,profile,config,ports,counts:()=>({starts,feedback,stops,releases})};
}
async function drain(s:ReturnType<typeof setup>){for(let i=0;i<20;i++){if(!await tickWorkflow(s.store,s.incident.id,s.ports))break;}}
it('executes rejection, feedback and correction in one session and exposes actual profile QA',async()=>{
  const s=setup();await drain(s);
  expect(s.store.getIncident(s.incident.id)?.status).toBe('completed');expect(s.counts()).toEqual({starts:1,feedback:1,stops:1,releases:1});
  expect(s.store.job(s.incident.id)?.state).toBe('done');
  const evaluations=evaluationSnapshots(s.store);
  const office=createOfficeModel({...s.store.operatorSnapshot(),evaluations},'live');
  expect(office.qa.status).toBe('completed');expect(office.qa.stages[0]).toMatchObject({id:'xarts.financialBridge',outcome:'pass'});
  expect(office.qa.executionMode).toBe('fixture');
});
it('holds an ambiguous create permanently, even across reopening',async()=>{
 const s=setup();s.ports.start=async()=>{throw new Error('lost response');};await drain(s);
 expect(s.store.job(s.incident.id)?.state).toBe('held');
 const reopened=new ControllerStore(s.path);stores.push(reopened);
 expect(await tickWorkflow(reopened,s.incident.id,s.ports)).toBe(false);
 expect(reopened.getOperation(`create:${s.incident.id}`)?.status).toBe('unknown_outcome');
});
it('a crash after claim cannot release the global slot or silently resend',()=>{
 const s=setup();expect(s.store.claimJob(s.incident.id)).toBeTruthy();const reopened=new ControllerStore(s.path);stores.push(reopened);
 expect(reopened.claimJob(s.incident.id)).toBeNull();
});
it('different operation IDs cannot create two sessions for the same incident',()=>{
 const s=setup();s.store.enqueueOperation({id:'first',incidentId:s.incident.id,harnessId:'fixture'});
 expect(()=>s.store.enqueueOperation({id:'second',incidentId:s.incident.id,harnessId:'fixture'})).toThrow('already has');
});
it('cancellation stops remote work before becoming terminal',async()=>{
 const s=setup();await tickWorkflow(s.store,s.incident.id,s.ports);await tickWorkflow(s.store,s.incident.id,s.ports);
 const current=s.store.getIncident(s.incident.id)!;s.store.cancel(current.id,current.revision,'human:test');await drain(s);
 expect(s.store.getIncident(current.id)?.status).toBe('cancelled');expect(s.counts().stops).toBe(1);expect(s.counts().releases).toBe(0);
});
it('failed termination is held and never claims cancellation succeeded',async()=>{
 const s=setup();await tickWorkflow(s.store,s.incident.id,s.ports);await tickWorkflow(s.store,s.incident.id,s.ports);
 const current=s.store.getIncident(s.incident.id)!;s.store.cancel(current.id,current.revision,'human:test');s.ports.stop=async()=>false;await drain(s);
 expect(s.store.job(current.id)?.state).toBe('held');expect(s.store.getIncident(current.id)?.status).not.toBe('cancelled');
});
it('missing evidence holds without retrying engineering or releasing',async()=>{
 const s=setup();s.ports.evaluate=async()=>[];await drain(s);expect(s.store.job(s.incident.id)?.record.failure).toBe('incomplete');
 expect(s.counts().feedback).toBe(0);expect(s.counts().releases).toBe(0);
});
it('candidate from a different base is held',async()=>{
 const s=setup();const candidate=s.ports.candidate;s.ports.candidate=async(...args)=>({...await candidate(...args),baseSha:'f'.repeat(40)});
 await drain(s);expect(s.store.job(s.incident.id)?.record.failure).toBe('candidate_base_mismatch');
});
it('bounds attempts and confirms termination',async()=>{
 const s=setup(1);await drain(s);expect(s.counts()).toEqual({starts:1,feedback:0,stops:1,releases:0});
 expect(s.store.getIncident(s.incident.id)?.status).toBe('cancelled');
});
it('refuses unsuitable inputs without creating a provider session',async()=>{
 const s=setup();s.ports.reproduce=async()=> 'refused';await drain(s);
 expect(s.store.getIncident(s.incident.id)?.status).toBe('refused');expect(s.counts().starts).toBe(0);
});
it('rejects stale revisions and rolls back the surrounding job transaction',()=>{
 const s=setup();const token=s.store.claimJob(s.incident.id)!;
 expect(()=>s.store.finishJob(s.incident.id,token,'done',{},()=>s.store.advance(s.incident.id,99,'reproducing',
 {now:new Date().toISOString(),activeLocalProcesses:0,activeRemoteSessions:0}))).toThrow('Stale');
 expect(s.store.job(s.incident.id)?.state).toBe('running');
});
