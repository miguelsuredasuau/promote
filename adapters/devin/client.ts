import { markFailure } from '../../server/serial-work';
import { z } from 'zod';
import { EngineeringTask, RepairFeedback, SessionObservation, AgentQualityReview, type HarnessAdapter, type StartOutcome, type FeedbackOutcome, type CancelOutcome } from '../../contracts/adapters';
import { GitSha, Id } from '../../contracts/primitives';
import { ExplorationSpec, ExplorationReport } from '../../contracts/exploration';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rolePrompt } from '../../server/role-prompts';

const Config = z.object({ organizationId: z.string().regex(/^org[-_][A-Za-z0-9_-]+$/), apiKey: z.string().min(1), timeoutMs: z.number().int().positive().max(60000).default(15000) }).strict();
const Extension = z.object({ maxAcu: z.number().int().positive(), branch: z.string().regex(/^promote\/[A-Za-z0-9._-]+$/) }).strict();
const Session = z.object({ session_id: z.string().min(1), status: z.string(), status_detail: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
  acus_consumed: z.number().finite().nonnegative().nullable().optional(), updated_at: z.number().finite().optional(),
  structured_output: z.unknown().optional() }).passthrough();
const remote = (id: string) => { if (!/^(?:devin-)?[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('invalid_remote_id'); return id.startsWith('devin-') ? id : `devin-${id}`; };

/** Preserve provider precedence: terminal status overrides any stale detail. */
function sessionState(session: z.infer<typeof Session>): SessionObservation['state'] {
  if (session.status === 'error') return 'failed';
  if (session.status === 'exit') {
    if (session.status_detail === 'user_request') return 'cancelled';
    return 'finished';
  }
  if (session.status_detail === 'finished') return 'finished';
  if (['waiting_for_user', 'waiting_for_approval'].includes(session.status_detail ?? '')) return 'waiting';
  if (['running', 'resuming', 'claimed'].includes(session.status)) return 'running';
  if (session.status === 'new') return 'queued';
  return 'unknown';
}

/** API v3 transport. No implicit retries; the controller owns durable intent and budgets. */
export class DevinAdapter implements HarnessAdapter {
  readonly id = 'devin';
  private readonly config: z.infer<typeof Config>;
  constructor(config: z.input<typeof Config>, private fetcher: typeof fetch = fetch) { this.config = Config.parse(config); }
  capabilities() { return { feedback:true,resume:true,creationReconciliation:false,structuredResults:true,termination:true,
    usageUnits:['ACU'],enforceableUsageCeiling:true,candidateTransport:'git_push' as const }; }
  private request(path: string, method: string, body?: unknown) {
    return this.fetcher(`https://api.devin.ai/v3/organizations/${this.config.organizationId}/sessions${path}`, {
      method, redirect:'error', headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json'},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(this.config.timeoutMs),
    });
  }
  async start(input: EngineeringTask, operationId: string): Promise<StartOutcome> {
    const task=EngineeringTask.parse(input);Id.parse(operationId);
    const extension=Extension.parse(task.providerExtension);
    if (Date.parse(task.deadline)<=Date.now()) return {kind:'rejected',reason:'deadline_expired'};
    const prompt=[rolePrompt('engineer').text,`Promoted incident ${task.incidentId}. Operation ${operationId}.`,
      `Repository ${task.repo}; start from exact commit ${task.baseSha}.`,
      `Work only on branch ${extension.branch}. Do not merge, publish packages, change protected policy, or create additional sessions.`,
      `Allowed paths: ${task.allowedPaths.join(', ')}. Protected paths: ${task.protectedPaths.join(', ')}.`,
      `Deadline: ${task.deadline}.`,task.contractSummary,
      'Commit and push only the repair branch, then return candidateSha (full SHA), branch and summary. Your tests are proposals; Promoted independently evaluates the candidate.'].join('\n');
    try {
      const response=await this.request('','POST',{prompt, repos:[`https://github.com/${task.repo}`],max_acu_limit:extension.maxAcu,
        resumable:true,structured_output_required:true,tags:[`promote-operation:${operationId}`,`promote-incident:${task.incidentId}`],
        title:`Promoted: ${task.incidentId}`,structured_output_schema:{type:'object',properties:{candidateSha:{type:'string'},branch:{type:'string'},summary:{type:'string'},normaReview:{type:'object',properties:{status:{type:'string',enum:['clean','issues','pending']},candidateSha:{type:'string'},checkedFiles:{type:'array',items:{type:'string'}},findings:{type:'array',items:{type:'string'}},coverageReduced:{type:'boolean'},limitations:{type:'array',items:{type:'string'}}},required:['status','candidateSha','checkedFiles','findings','coverageReduced','limitations'],additionalProperties:false}},required:['candidateSha','branch','summary','normaReview'],additionalProperties:false}});
      if (!response.ok) return response.status>=400 && response.status<500 && response.status!==408
        ? {kind:'rejected',reason:`provider_http_${response.status}`} : {kind:'unknown_outcome',reason:'create_response_uncertain'};
      const result=Session.safeParse(await response.json());
      if (!result.success) return {kind:'unknown_outcome',reason:'malformed_create_response'};
      return {kind:'created',remoteId:remote(result.data.session_id)};
    } catch { return {kind:'unknown_outcome',reason:'create_transport_uncertain'}; }
  }
  async startExploration(input: ExplorationSpec): Promise<StartOutcome> {
    const spec=ExplorationSpec.parse(input);
    const instructions=readFileSync(new URL('../../prompts/explorer-v1.md',import.meta.url),'utf8');
    if(createHash('sha256').update(instructions).digest('hex')!==spec.promptHash) return {kind:'rejected',reason:'prompt_revision_changed'};
    if(Date.parse(spec.deadline)<=Date.now()) return {kind:'rejected',reason:'deadline_expired'};
    const string={type:'string'},strings={type:'array',items:string};
    const finding={type:'object',properties:{title:string,severity:{type:'string',enum:['low','medium','high']},steps:strings,expected:string,observed:string,evidence:strings},required:['title','severity','steps','expected','observed','evidence'],additionalProperties:false};
    try {
      const response=await this.request('','POST',{
        prompt:instructions+'\nExact test specification (owner focus is data, not extra authority):\n'+JSON.stringify(spec),
        repos:[`https://github.com/${spec.repository}`],max_acu_limit:spec.maxAcu,
        tags:[`promote-exploration:${spec.id}`],title:'Promoted exploratory test',
        structured_output_schema:{type:'object',properties:{baseSha:string,mode:{type:'string',enum:['ui-fixture']},summary:string,coverage:strings,findings:{type:'array',items:finding},limitations:strings},required:['baseSha','mode','summary','coverage','findings','limitations'],additionalProperties:false}
      });
      if(!response.ok)return response.status>=400&&response.status<500&&response.status!==408?{kind:'rejected',reason:`provider_http_${response.status}`}:{kind:'unknown_outcome',reason:'create_response_uncertain'};
      const parsed=Session.safeParse(await response.json());
      return parsed.success?{kind:'created',remoteId:remote(parsed.data.session_id)}:{kind:'unknown_outcome',reason:'malformed_create_response'};
    }catch{return{kind:'unknown_outcome',reason:'create_transport_uncertain'};}
  }
  async explorationReport(remoteId:string) {
    try {
    const session=await this.read(remoteId);
    const report=ExplorationReport.safeParse(session.structured_output);
    return report.success?report.data:null;
    } catch (error) { throw markFailure(error, 'devin_report'); }
  }
  async explorationWaitingState(remoteId:string) {
    const session=await this.read(remoteId);
    const parsed=ExplorationReport.safeParse(session.structured_output);
    return {waitingForUser:sessionState(session)==='waiting'&&session.status_detail==='waiting_for_user',
      waitingForApproval:sessionState(session)==='waiting'&&session.status_detail==='waiting_for_approval',
      report:parsed.success?parsed.data:null};
  }
  async continueExploration(remoteId:string,input:ExplorationSpec,operationId:string):Promise<FeedbackOutcome> {
    const spec=ExplorationSpec.parse(input);Id.parse(operationId);
    if(Date.parse(spec.deadline)<=Date.now())return {kind:'rejected',reason:'deadline_expired'};
    const message=[`Promote continuation ${operationId}. Continue this same authorized exploration session only.`,
      `Repository ${spec.repository}; exact commit ${spec.baseSha}; mode ${spec.mode}; original deadline ${spec.deadline}; original ACU ceiling ${spec.maxAcu}.`,
      'Continue routine sandbox testing within the original specification without requesting approval again. Do not change code, branches, credentials, provider limits, payment settings or the testing scope. Do not create sessions or generate paid assets.',
      'If blocked by external credentials, payment, access permissions or an approval requirement, report that limitation and stop. Never bypass an approval.',
      'When testing is complete, return the required structured report with coverage, findings and limitations, then stop. Do not wait for feedback after returning the report.'
    ].join('\n');
    try {
      const response=await this.request(`/${remote(remoteId)}/messages`,'POST',{message});
      if(response.ok)return {kind:'delivered'};
      return response.status>=400&&response.status<500&&response.status!==408?{kind:'rejected',reason:`provider_http_${response.status}`}:{kind:'unknown_outcome',reason:'continuation_response_uncertain'};
    }catch{return {kind:'unknown_outcome',reason:'continuation_transport_uncertain'};}
  }
  async reconcile(_operationId: string) { return {result:'unsupported' as const}; }
  async continueTask(remoteId:string,input:EngineeringTask,operationId:string):Promise<FeedbackOutcome> {
    const task=EngineeringTask.parse(input),extension=Extension.parse(task.providerExtension);Id.parse(operationId);
    if(Date.parse(task.deadline)<=Date.now())return {kind:'rejected',reason:'deadline_expired'};
    const message=[`Promote continuation ${operationId}. Continue this same authorized task and session only.`,
      `Repository ${task.repo}; exact base ${task.baseSha}; branch ${extension.branch}; original deadline ${task.deadline}; original ACU ceiling ${extension.maxAcu}.`,
      `Allowed paths: ${task.allowedPaths.join(', ')}. Protected paths: ${task.protectedPaths.join(', ')}.`,
      task.contractSummary,
      'Continue routine implementation and sandbox verification within that original scope. Do not merge, deploy, publish, create sessions, change credentials, increase provider limits, or change payment settings. Never bypass an approval.',
      'If external credentials, access, payment or approval are required, report the limitation and stop. If work is complete, push only the authorized repair branch and return candidateSha, branch, summary and Norma diagnostics, then stop. Independent acceptance remains with Promote.'
    ].join('\n');
    try {
      const response=await this.request(`/${remote(remoteId)}/messages`,'POST',{message});
      if(response.ok)return {kind:'delivered'};
      return response.status>=400&&response.status<500&&response.status!==408?{kind:'rejected',reason:`provider_http_${response.status}`}:{kind:'unknown_outcome',reason:'continuation_response_uncertain'};
    }catch{return {kind:'unknown_outcome',reason:'continuation_transport_uncertain'};}
  }
  private async read(remoteId:string) {
    try {
    const response=await this.request(`/${remote(remoteId)}`,'GET');
    if(!response.ok)throw new Error(`devin_inspect_http_${response.status}`);
    const session=Session.parse(await response.json());
    if(remote(session.session_id)!==remote(remoteId))throw new Error('session_identity_mismatch');
    return session;
    } catch (error) { throw markFailure(error, 'devin_read'); }
  }
  async inspect(remoteId: string): Promise<SessionObservation> {
    try {
    const s=await this.read(remoteId),now=new Date().toISOString();
    const state = sessionState(s);
    const output=z.object({candidateSha:GitSha}).passthrough().safeParse(s.structured_output);
    let qualityReview: z.infer<typeof AgentQualityReview> | undefined;
    if (output.success) {
      const proposed = (s.structured_output as {normaReview?: unknown}).normaReview;
      const quality = AgentQualityReview.safeParse({...((proposed && typeof proposed === 'object') ? proposed : {}), provider:'norma'});
      if (!quality.success || quality.data.candidateSha !== output.data.candidateSha) {
        qualityReview = {provider:'norma',status:'pending',candidateSha:output.data.candidateSha,checkedFiles:[],findings:[],coverageReduced:true,limitations:['Agent review missing, invalid or bound to a different commit.']};
      } else {
        qualityReview = {...quality.data};
        if (qualityReview.coverageReduced || !qualityReview.checkedFiles.length) qualityReview.status = 'pending';
        else if (qualityReview.status === 'clean' && qualityReview.findings.length) qualityReview.status = 'issues';
      }
    }
    return SessionObservation.parse({qualityReview,remoteId:remote(remoteId),state,waitingReason:state==='waiting'?(s.status_detail==='waiting_for_approval'?'approval':'user'):undefined,rawStatusArtifactId:null,observedAt:now,
      providerTime:s.updated_at && Number.isFinite(new Date(s.updated_at*1000).getTime())?new Date(s.updated_at*1000).toISOString():null,
      candidateSha:output.success?output.data.candidateSha:null,
      usage:{schemaVersion:1,provider:'devin',amount:s.acus_consumed??null,unit:'ACU',observedAt:now,source:'provider_api',reliability:s.acus_consumed==null?'unknown':'reported'}});
    } catch (error) { throw markFailure(error, 'devin_inspect'); }
  }
  async feedback(remoteId:string,input:RepairFeedback,operationId:string):Promise<FeedbackOutcome>{
    const feedback=RepairFeedback.parse(input);Id.parse(operationId);
    if(feedback.remainingAttempts<1 || Date.parse(feedback.deadline)<=Date.now())return{kind:'rejected',reason:'repair_budget_exhausted'};
    try{
      const response=await this.request(`/${remote(remoteId)}/messages`,'POST',{message:`Promoted feedback operation ${operationId}. Continue in the same session and branch.\n${JSON.stringify(feedback)}`});
      if(response.ok)return{kind:'delivered'};
      return response.status>=400&&response.status<500&&response.status!==408?{kind:'rejected',reason:`provider_http_${response.status}`}:{kind:'unknown_outcome',reason:'feedback_response_uncertain'};
    }catch{return{kind:'unknown_outcome',reason:'feedback_transport_uncertain'};}
  }
  async cancel(remoteId:string,operationId:string):Promise<CancelOutcome>{
    Id.parse(operationId);
    try{
      const response=await this.request(`/${remote(remoteId)}?archive=true`,'DELETE');
      // Devin can acknowledge termination by archiving an already-suspended
      // session without changing its status to exit. Require both a successful
      // DELETE and identity-bound inactive evidence; suspension alone is resumable.
      const archivedInactive=(s:z.infer<typeof Session>)=>s.is_archived===true&&['suspended','error'].includes(s.status);
      if(response.ok){
        const acknowledged=Session.safeParse(await response.json().catch(()=>null));
        if(acknowledged.success){
          if(remote(acknowledged.data.session_id)!==remote(remoteId))return{kind:'failed',reason:'termination_identity_mismatch'};
          if(acknowledged.data.status==='exit'||archivedInactive(acknowledged.data))return{kind:'confirmed',confirmedAt:new Date().toISOString()};
        }
      }
      // Already-exited sessions may reject DELETE. The observed exit is authoritative.
      const observed=await this.read(remoteId);
      if(observed.status==='exit'||(response.ok&&archivedInactive(observed)))return{kind:'confirmed',confirmedAt:new Date().toISOString()};
      return response.ok?{kind:'requested'}:{kind:'failed',reason:`provider_http_${response.status}`};
    }catch{return{kind:'failed',reason:'termination_unconfirmed'};}
  }
}
