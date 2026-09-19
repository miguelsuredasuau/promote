import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { ControllerStore } from './store';
import { prepareXartsImage, validateXartsBuild, validateXartsConsumer } from './xarts-validation';
import { Incident, GateResult, type AcceptanceIdentity } from '../contracts/records';
import { hashCanonical } from '../contracts/hash';
import { hashGateProfile, evaluateAcceptance } from '../contracts/gates';
import type { GateProfile } from '../contracts/profile';
import type { ExecutionEvidence } from '../contracts/adapters';
import { publishLocalRelease } from './registry';
const exec = promisify(execFile);
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export const DeliveryTask = z.object({
  attempt: z.number().int().min(1).max(3).default(1),
  schemaVersion: z.literal(1), checkout: z.string().min(1), repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/), baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  sourceBranch: z.string().regex(/^promote[/-][A-Za-z0-9._/-]+$/).optional(),
  chatRoot: z.string().min(1), runId: z.string().regex(/^[\w-]+$/), chartId: z.string().regex(/^chart-\d+$/),
  registry: z.string().min(1), allowedPaths: z.array(z.string().min(1)).min(1), protectedPaths: z.array(z.string().min(1)),
}).strict();
export type DeliveryTask = z.infer<typeof DeliveryTask>;

export function executionPassed(e: ExecutionEvidence, requiredOutputs: string[]) {
  return e.isolation === 'container' && e.outcome === 'completed' && e.exitCode === 0 &&
    e.artifactIds.some(id => /^log:[a-f0-9]{64}$/.test(id)) &&
    requiredOutputs.every(name => e.artifactIds.filter(id => new RegExp(`^output:${name}:[a-f0-9]{64}$`).test(id)).length === 1);
}

/** One durable work-queue claim owns this attempt. A crash holds that claim; it
 * never implicitly retries provider effects or accepts a partial evaluation.
 */
export async function runXartsDelivery(store: ControllerStore, controllerRoot: string, rawTask: unknown) {
  const task = DeliveryTask.parse(rawTask);
  const id = `xarts-delivery-${hashCanonical(task).slice(0,24)}`;
  const existing = store.getIncident(id);
  if (existing) return { state: existing.status === 'completed' ? 'completed' as const : 'blocked' as const,
    result: { reason: existing.status === 'completed' ? 'release_already_activated' : 'delivery_requires_reconciliation', incidentId: id } };
  const git = async (args: string[]) => (await exec('git', args, { cwd: task.checkout, timeout:30000,killSignal:'SIGKILL', maxBuffer: 1024*1024 })).stdout.trim();
  const origin = await git(['remote','get-url','origin']);
  if (![ `https://github.com/${task.repo}.git`, `https://github.com/${task.repo}`, `git@github.com:${task.repo}.git` ].includes(origin)) throw Error('repository_identity_mismatch');
  await git(['merge-base','--is-ancestor',task.baseSha,task.candidateSha]);
  const changed = (await exec('git',['diff','--name-only','--no-renames','-z',task.baseSha,task.candidateSha],{cwd:task.checkout,timeout:10000,killSignal:'SIGKILL'})).stdout.split('\0').filter(Boolean);
  const inside = (path: string, scopes: string[]) => scopes.some(scope => path===scope || path.startsWith(`${scope}/`));
  if (changed.some(path => !inside(path,task.allowedPaths) || inside(path,task.protectedPaths))) throw Error('candidate_scope_violation');
  const run = join(task.chatRoot,'runs',task.runId);
  const spec = JSON.parse(await readFile(join(run,`${task.chartId}.spec.json`),'utf8'));
  const saved = JSON.parse(await readFile(join(run,`${task.chartId}.data.json`),'utf8'));
  if (Object.hasOwn(spec,'data')) throw Error('request_contains_untrusted_data');
  const { runSelect } = await import(pathToFileURL(join(task.chatRoot,'lib/sql.mjs')).href);
  const db = new DatabaseSync(join(task.chatRoot,'data/finance.sqlite'), {readOnly:true});
  let rows;
  try { const selected = runSelect(db,saved.sql,10000);if(selected.truncated)throw Error('request_data_truncated');rows=selected.rows; } finally {db.close();}
  const dataHash = digest(JSON.stringify(rows));
  if (dataHash!==saved.dataHash || rows.length!==saved.rowCount) throw Error('original_sql_data_changed');
  const request = {spec,rows,dataHash};
  const evaluatorRevision = (await exec('git',['rev-parse','HEAD'],{cwd:controllerRoot})).stdout.trim();
  const codeHashes: Record<string,string> = {};
  for (const file of ['server/xarts-delivery.ts','server/xarts-validation.ts','server/container-runner.ts','adapters/xarts/build-worker.mjs','adapters/xarts/consumer-worker.mjs']) codeHashes[file]=digest(await readFile(join(controllerRoot,file)));
  const input = {task,request,codeHashes,changedPaths:changed};
  const profile: GateProfile = {schemaVersion:1,profileId:'xarts-delivery-v1',libraryId:'xarts',evaluatorRevision,
    gates:['protected.sourceAndSql','xarts.sdkBuild','xarts.standaloneAndRegeneration'].map(gateId=>({gateId,gateVersion:1,requirement:'required' as const,notApplicableAllowed:false}))};
  const identity: AcceptanceIdentity = {candidateSha:task.candidateSha,evaluatorRevision,inputHash:hashCanonical(input),acceptanceContractHash:hashGateProfile(profile)};
  const root = join(controllerRoot,'.local/xarts-validation',task.candidateSha);
  const artifacts = join(root,'artifacts');await mkdir(artifacts,{recursive:true});
  const evidenceBytes = Buffer.from(JSON.stringify(input));const sourceHash=digest(evidenceBytes);await writeFile(join(artifacts,sourceHash),evidenceBytes);
  const now = new Date().toISOString();
  store.createIncident(Incident.parse({schemaVersion:1,id,revision:0,targetLibrary:'xarts',trigger:{kind:'file',idempotencyKey:id,receivedAt:now},
    requestedOutcome:{kind:'repair',summary:'Build, independently verify and activate the Xarts package for the original chat request'},
    requestHash:hashCanonical(task),inputsHash:identity.inputHash,sourceArtifacts:[{artifactId:'delivery-inputs',sha256:sourceHash}],
    baseCommit:task.baseSha,acceptanceContractHash:identity.acceptanceContractHash,evaluatorRevision,policyRevision:'xarts-delivery-v1',
    status:'received',block:null,cancellation:null,acceptedIdentity:null,createdAt:now,updatedAt:now}));
  const context = () => ({now:new Date().toISOString(),activeRemoteSessions:store.engineeringReservations().filter(r=>r.state!=='stopped').length,activeLocalProcesses:0,currentIdentity:identity});
  const advance = (status: Parameters<ControllerStore['advance']>[2], extra = {}) => store.advance(id,store.getIncident(id)!.revision,status,{...context(),...extra});
  advance('reproducing');advance('evaluating');
  const results: GateResult[] = [];
  const record = (gateId:string,outcome:GateResult['outcome'],reason:string,logArtifactId:string,evidence?:ExecutionEvidence) => {
    const result=GateResult.parse({schemaVersion:1,id:`${id}-${results.length}`,gateId,gateVersion:1,...{candidateSha:identity.candidateSha,evaluatorRevision,inputHash:identity.inputHash},
      outcome,reason,expected:null,actual:evidence??{changedPaths:changed,dataHash},logArtifactId,durationMs:evidence?.durationMs??0,
      runnerIdentity:evidence?.runnerIdentity??'protected-source-sql-v1',startedAt:evidence?.startedAt??now,finishedAt:evidence?.finishedAt??new Date().toISOString()});
    results.push(result);store.recordEvent(id,'gate.finished',{result});return result;
  };
  record('protected.sourceAndSql','pass','source_scope_and_original_sql_verified',`log:${sourceHash}`);
  let activeGate: string | null = null;
  const stage = (gateId:string,summary:string) => {
    activeGate=gateId;
    if(store.getIncident(id)?.cancellation)throw Error('cancellation_requested');
    store.recordEvent(id,'gate.started',{gateId,gateVersion:1,candidateSha:task.candidateSha});
    store.deliveryStatus({status:'verifying',incidentId:id,candidateSha:task.candidateSha,stage:gateId,nextAction:summary});
    store.recordActivity('verification',summary,{incidentId:id,candidateSha:task.candidateSha,executionMode:'isolated_local',nextAction:gateId});
  };
  try {
    stage('xarts.sdkBuild','QA is building the candidate package and checking compiler regressions');
    const image=await prepareXartsImage(task.checkout,task.candidateSha,root);
    const build=await validateXartsBuild({root,image,candidateSha:task.candidateSha,evaluatorRevision});
    const buildPassed=executionPassed(build,['package','manifest']);
    record('xarts.sdkBuild',buildPassed?'pass':build.outcome==='completed'?'fail':'error',buildPassed?'isolated_sdk_build_passed':'sdk_build_not_accepted',build.artifactIds.find(id=>id.startsWith('log:'))??'missing-log',build);
    if(!buildPassed)throw Error('sdk_build_not_accepted');
    const packageHash=build.artifactIds.find(id=>id.startsWith('output:package:'))!.split(':')[2];
    const packageBytes=await readFile(join(artifacts,packageHash));if(digest(packageBytes)!==packageHash)throw Error('package_hash_mismatch');
    stage('xarts.standaloneAndRegeneration','QA is testing the standalone package and replaying the original SQL-backed chart');
    const consumer=await validateXartsConsumer({root,packageBytes,request,candidateSha:task.candidateSha,evaluatorRevision,checkout:task.checkout,baselineSha:task.baseSha});
    const consumerPassed=executionPassed(consumer,['svg','report']);
    record('xarts.standaloneAndRegeneration',consumerPassed?'pass':consumer.outcome==='completed'?'fail':'error',consumerPassed?'standalone_and_original_request_passed':'standalone_or_regeneration_not_accepted',consumer.artifactIds.find(id=>id.startsWith('log:'))??'missing-log',consumer);
    if(!consumerPassed)throw Error('standalone_or_regeneration_not_accepted');
    // Source and evaluator cannot drift between execution and activation.
    for(const [file,expected] of Object.entries(codeHashes))if(digest(await readFile(join(controllerRoot,file)))!==expected)throw Error('evaluator_changed_during_delivery');
    const outputHash=consumer.artifactIds.find(id=>id.startsWith('output:svg:'))!.split(':')[2];
    const outputBytes=await readFile(join(artifacts,outputHash));
    if(context().activeRemoteSessions!==0)throw Error('engineering_termination_not_confirmed');
    advance('accepted',{acceptance:evaluateAcceptance(profile,identity,results)});
    const releasing=advance('releasing');
    const release=publishLocalRelease(task.registry,{releaseId:`xarts-${task.candidateSha.slice(0,12)}-${identity.inputHash.slice(0,8)}`,incidentId:id,identity,profile,results,
      packageBytes,outputBytes,expectedPackageHash:packageHash,expectedOutputHash:outputHash,
      authorize:publish=>store.withReleaseAuthority(id,releasing.revision,identity,publish)});
    advance('completed');store.recordEvent(id,'release.activated',{release,executionMode:'isolated_local'});
    store.deliveryStatus({status:'active',incidentId:id,candidateSha:task.candidateSha,releaseId:release.id,nextAction:'New chat requests can use this verified package.'});
    store.recordActivity('release','Verified Xarts release activated for the chat',{incidentId:id,releaseId:release.id,candidateSha:task.candidateSha,shims:0});
    return {state:'completed' as const,result:{reason:'verified_release_activated',incidentId:id,releaseId:release.id}};
  } catch(error) {
    const reason=error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'delivery_infrastructure_failed';
    if(activeGate&&!results.some(result=>result.gateId===activeGate)){
      const failure=error as {message?:string;stdout?:string;stderr?:string};
      const log=Buffer.from(`${failure.message??reason}\n${failure.stdout??''}\n${failure.stderr??''}`).subarray(0,4*1024*1024);
      const logHash=digest(log);await writeFile(join(artifacts,logHash),log);
      record(activeGate,'error',reason,`log:${logHash}`);
    }
    if(!['completed','blocked'].includes(store.getIncident(id)!.status))advance('blocked',{blockReason:reason});
    store.deliveryStatus({status:'blocked',incidentId:id,candidateSha:task.candidateSha,reason,nextAction:'Read the failed verification log before queuing a corrected attempt.'});
    await writeFile(join(root,'delivery-failure.json'),JSON.stringify({incidentId:id,reason,results},null,2));
    store.recordActivity('verification','Release held; the current chat release remains active',{incidentId:id,reason,nextAction:'Review the protected gate log and repair the candidate or execution environment; then queue a new bounded attempt.'});
    return {state:'blocked' as const,result:{reason,incidentId:id}};
  }
}
