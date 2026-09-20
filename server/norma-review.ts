import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { connectNorma, type NormaConnection } from '../adapters/norma';
import { projectEnvironment } from './environment.mjs';
import { originMatchesRepo } from './repo-identity';
import type { ControllerStore } from './store';
const exec = promisify(execFile);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const Config = z.object({ enabled: z.boolean(), repositories: z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/)), credentialSource: z.enum(['env','claude-keychain']).default('env') }).strict();
const CallResult = z.object({ outcome: z.enum(['clean','issues','not_checkable','refused','error']), coverage: z.object({reduced:z.boolean()}).passthrough().optional(),
  issues: z.array(z.object({rule_id:z.string(),line:z.number().int().positive(),column:z.number().int().nonnegative().optional()}).passthrough()).optional(),
  total_issues:z.number().int().nonnegative().optional(), capped:z.boolean().optional(), rulesets_evaluated:z.array(z.string()).optional(), rules:z.record(z.unknown()).optional() }).passthrough();
const Snapshot = z.object({rulesets:z.array(z.object({ruleset_id:z.string(),version:z.string()}).passthrough()).max(16)}).passthrough();
export interface ReviewInput { checkout:string; repo:string; baseSha:string; candidateSha:string }
interface FileReview { path:string; sha256?:string; status:'clean'|'issues'|'pending'|'excluded'; reason?:string; totalIssues?:number; findings?:{ruleId:string;line:number;column?:number}[]; rulesets?:string[] }
export interface NormaReport { schemaVersion:1; mode:'advisory'; repo:string; baseSha:string; candidateSha:string; startedAt:string; finishedAt?:string; status:'clean'|'issues'|'pending'|'disabled'; reason?:string; rules:Record<string,{version:string;sha256:string}>; files:FileReview[]; totalIssues:number; costUsd:null }
const sha = z.string().regex(/^[a-f0-9]{40}$/);
export async function reviewCandidate(input:ReviewInput, connection:NormaConnection, signal:AbortSignal):Promise<NormaReport> {
  sha.parse(input.baseSha);sha.parse(input.candidateSha);
  const report:NormaReport={schemaVersion:1,mode:'advisory',repo:input.repo,baseSha:input.baseSha,candidateSha:input.candidateSha,startedAt:new Date().toISOString(),status:'pending',rules:{},files:[],totalIssues:0,costUsd:null};
  const git=async(args:string[]) => (await exec('git',args,{cwd:input.checkout,timeout:10000,killSignal:'SIGKILL',maxBuffer:1024*1024})).stdout;
  try {
    if(!await originMatchesRepo(async args=>(await git(args)).trim(),input.repo))throw Error('repository_mismatch');
    await git(['merge-base','--is-ancestor',input.baseSha,input.candidateSha]);
    const names=(await git(['diff','--name-only','--no-renames','-z',input.baseSha,input.candidateSha])).split('\0').filter(Boolean);
    const linked=z.object({outcome:z.literal('linked')}).passthrough().parse(await connection.call('link_repository',{remote_url:`https://github.com/${input.repo}.git`}));void linked;
    const catalog=Snapshot.parse(await connection.call('get_rulesets',{remote_url:`https://github.com/${input.repo}.git`}));
    for(const set of catalog.rulesets){
      const rules=await connection.call('get_rules_for_ruleset',{ruleset_id:set.ruleset_id});
      if(!Array.isArray(rules))throw Error('invalid_rules');
      report.rules[set.ruleset_id]={version:set.version,sha256:hash(JSON.stringify(rules))};
    }
    let count=0;
    for(const path of names){
      if(signal.aborted)throw Error('review_timeout');
      const file:FileReview={path,status:'pending'};report.files.push(file);
      if(!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)||/(^|\/)(?:node_modules|vendor|dist|\.env[^/]*|credentials[^/]*)(\/|$)/i.test(path)){file.status='excluded';file.reason='outside_source_review';continue;}
      // Read a Git blob at the frozen SHA, never a mutable checkout or symlink target.
      const entry=await git(['ls-tree',input.candidateSha,'--',path]);
      if(!entry){file.status='excluded';file.reason='deleted';continue;}
      if(!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(entry)){file.reason='not_regular_blob';continue;}
      if(++count>10){file.reason='file_limit';continue;}
      const blob=entry.split(' ')[2].split('\t')[0];
      const size=Number((await git(['cat-file','-s',blob])).trim());
      if(size>128*1024){file.reason='file_size_limit';continue;}
      const {stdout:bytes}=await exec('git',['cat-file','blob',blob],{cwd:input.checkout,encoding:'buffer',timeout:10000,killSignal:'SIGKILL',maxBuffer:128*1024});
      const content=bytes.toString('utf8');file.sha256=hash(bytes);
      if(!Buffer.from(content).equals(bytes)||content.includes('\0')){file.reason='binary_or_invalid_utf8_source';continue;}
      try {
        const result=CallResult.parse(await connection.call('live_check',{file_name:path,file_content:content,max_issues:100}));
        file.totalIssues=result.total_issues??(result.outcome==='clean'?0:undefined);
        file.findings=(result.issues??[]).map(x=>({ruleId:x.rule_id,line:x.line,...(x.column===undefined?{}:{column:x.column})}));
        file.rulesets=result.rulesets_evaluated;
        report.totalIssues+=file.totalIssues??0;
        if(result.outcome!=='clean'&&result.outcome!=='issues')file.reason=`provider_${result.outcome}`;
        else if(!result.coverage || result.coverage.reduced)file.reason='coverage_incomplete';
        else if(result.capped||file.totalIssues!==file.findings.length)file.reason='findings_incomplete';
        else if(!file.rulesets?.length||file.rulesets.some(id=>!report.rules[id]))file.reason='rules_not_snapshotted';
        else if((result.outcome==='clean'&&file.totalIssues!==0)||(result.outcome==='issues'&&!file.totalIssues))file.reason='contradictory_response';
        else file.status=result.outcome;
      }catch{file.reason='provider_error';}
    }
    // Detect rule drift across the run. Snapshot hashes identify the rules observed;
    // the provider does not accept a pin, so this is not proof of engine identity.
    for(const [id,before] of Object.entries(report.rules)){
      const after=await connection.call('get_rules_for_ruleset',{ruleset_id:id});
      if(hash(JSON.stringify(after))!==before.sha256)throw Error('rules_changed');
    }
    report.status=report.files.some(f=>f.status==='pending')?'pending':report.totalIssues?'issues':report.files.some(f=>f.status==='clean')?'clean':'pending';
    if(!report.files.some(f=>f.status!=='excluded'))report.reason='no_checkable_changes';
  }catch(error){report.status='pending';report.reason=error instanceof Error&&['repository_mismatch','rules_changed','review_timeout','invalid_rules'].includes(error.message)?error.message:'review_incomplete';}
  report.finishedAt=new Date().toISOString();return report;
}
async function tokenFor(root:string,source:'env'|'claude-keychain') {
  if(source==='env')return projectEnvironment(root).NORMA_ACCESS_TOKEN;
  if(process.platform!=='darwin')return undefined;
  const {stdout}=await exec('security',['find-generic-password','-s','Claude Code-credentials','-w'],{timeout:5000,maxBuffer:1024*1024});
  const entries=Object.values(JSON.parse(stdout).mcpOAuth??{}) as {serverUrl?:string;accessToken?:string;expiresAt?:number}[];
  const entry=entries.find(x=>x.serverUrl==='https://api.qualityclouds.ai/mcp');
  return entry?.expiresAt && entry.expiresAt<=Date.now()?undefined:entry?.accessToken;
}
export async function runNormaReview(store:ControllerStore,root:string,input:ReviewInput,incidentId:string) {
  let connection:NormaConnection|undefined;
  let report:NormaReport={schemaVersion:1,mode:'advisory',...input,startedAt:new Date().toISOString(),status:'disabled',rules:{},files:[],totalIssues:0,costUsd:null};
  const signal=AbortSignal.timeout(180000);
  try {
    let config;
    try {config=Config.parse(JSON.parse(await readFile(join(root,'.local/norma.json'),'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(config?.enabled){
      report.status='pending';
      if(!config.repositories.includes(input.repo))report.reason='repository_not_enabled';
      else {
        const token=await tokenFor(root,config.credentialSource);
        if(!token)report.reason='authentication_required';
        else {connection=await connectNorma(token,signal);report=await reviewCandidate(input,connection,signal);}
      }
    }
  }catch{report.status='pending';report.reason='review_unavailable';}
  finally{await connection?.close().catch(()=>{});}
  report.finishedAt??=new Date().toISOString();
  const directory=join(root,'.local/norma-reviews');await mkdir(directory,{recursive:true});
  const bytes=JSON.stringify(report,null,2)+'\n',digest=hash(bytes),path=join(directory,`${digest}.json`);
  await writeFile(path+'.tmp',bytes,{mode:0o600});await rename(path+'.tmp',path);
  const label=report.status==='pending'?'pending: incomplete checks':report.status==='issues'?`${report.totalIssues} findings to triage`:report.status==='clean'?'no findings in checked changes':'not configured';
  store.recordActivity('verification',`Norma advisory review — ${label}`,{incidentId,candidateSha:input.candidateSha,reviewHash:digest,status:report.status,reason:report.reason??null,totalIssues:report.totalIssues,mode:'advisory',files:report.files,rules:report.rules,nextAction:'Review diagnostic findings; required release gates remain independent.'});
  return report;
}
