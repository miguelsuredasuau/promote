import { z } from 'zod';
import { EngineeringTask, RepairFeedback, SessionObservation, type HarnessAdapter, type StartOutcome, type FeedbackOutcome, type CancelOutcome } from '../../contracts/adapters';
import { GitSha, Id } from '../../contracts/primitives';
import { ExplorationSpec, ExplorationReport } from '../../contracts/exploration';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rolePrompt } from '../../server/role-prompts';

const Config = z.object({ organizationId: z.string().regex(/^org[-_][A-Za-z0-9_-]+$/), apiKey: z.string().min(1), timeoutMs: z.number().int().positive().max(60000).default(15000) }).strict();
const Extension = z.object({ maxAcu: z.number().int().positive(), branch: z.string().regex(/^promote\/[A-Za-z0-9._-]+$/) }).strict();
const Session = z.object({ session_id: z.string().min(1), status: z.string(), status_detail: z.string().nullable().optional(),
  acus_consumed: z.number().finite().nonnegative().nullable().optional(), updated_at: z.number().finite().optional(),
  structured_output: z.unknown().optional() }).passthrough();
const remote = (id: string) => { if (!/^(?:devin-)?[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('invalid_remote_id'); return id.startsWith('devin-') ? id : `devin-${id}`; };

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
        title:`Promoted: ${task.incidentId}`,structured_output_schema:{type:'object',properties:{candidateSha:{type:'string'},branch:{type:'string'},summary:{type:'string'}},required:['candidateSha','branch','summary'],additionalProperties:false}});
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
    const session=await this.read(remoteId);
    const report=ExplorationReport.safeParse(session.structured_output);
    return report.success?report.data:null;
  }
  async reconcile(_operationId: string) { return {result:'unsupported' as const}; }
  private async read(remoteId:string) {
    const response=await this.request(`/${remote(remoteId)}`,'GET');
    if(!response.ok)throw new Error(`devin_inspect_http_${response.status}`);
    const session=Session.parse(await response.json());
    if(remote(session.session_id)!==remote(remoteId))throw new Error('session_identity_mismatch');
    return session;
  }
  async inspect(remoteId: string): Promise<SessionObservation> {
    const s=await this.read(remoteId),now=new Date().toISOString();
    const state=s.status==='error'?'failed':s.status==='exit'?(s.status_detail==='user_request'?'cancelled':'finished'):
      s.status_detail==='finished'?'finished':['waiting_for_user','waiting_for_approval'].includes(s.status_detail??'')?'waiting':
      ['running','resuming','claimed'].includes(s.status)?'running':s.status==='new'?'queued':'unknown';
    const output=z.object({candidateSha:GitSha}).passthrough().safeParse(s.structured_output);
    return SessionObservation.parse({remoteId:remote(remoteId),state,rawStatusArtifactId:null,observedAt:now,
      providerTime:s.updated_at && Number.isFinite(new Date(s.updated_at*1000).getTime())?new Date(s.updated_at*1000).toISOString():null,
      candidateSha:output.success?output.data.candidateSha:null,
      usage:{schemaVersion:1,provider:'devin',amount:s.acus_consumed??null,unit:'ACU',observedAt:now,source:'provider_api',reliability:s.acus_consumed==null?'unknown':'reported'}});
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
      // Already-exited sessions may reject DELETE. The observed exit is authoritative.
      const observed=await this.read(remoteId);
      if(observed.status==='exit')return{kind:'confirmed',confirmedAt:new Date().toISOString()};
      return response.ok?{kind:'requested'}:{kind:'failed',reason:`provider_http_${response.status}`};
    }catch{return{kind:'failed',reason:'termination_unconfirmed'};}
  }
}
