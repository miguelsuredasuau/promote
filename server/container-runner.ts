import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ExecutionPlan, ImmutableInputs, type ExecutionRunner, type CancellationEvidence, type ExecutionEvidence } from '../contracts/adapters';
import { canonicalJson } from '../contracts/canonical';
const exec = promisify(execFile);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Container execution with trusted exact command allowlists and content-addressed file mounts. */
export class ContainerRunner implements ExecutionRunner {
  constructor(private config: { root: string; artifacts: string; commands: Record<string,{argv:string[];image:string}> }) {}
  async run(raw: ExecutionPlan, rawInputs: ImmutableInputs): Promise<ExecutionEvidence> {
    const plan=ExecutionPlan.parse(raw),inputs=ImmutableInputs.parse(rawInputs);
    const allowed=this.config.commands[plan.commandId];
    if (!allowed || canonicalJson(allowed.argv)!==canonicalJson(plan.argv) || allowed.image!==plan.runtimeImage ||
      !/@sha256:[a-f0-9]{64}$/.test(plan.runtimeImage) || plan.network!=='none') throw new Error('untrusted_execution_plan');
    const runId=randomUUID(), name=`promote-${runId}`, startedAt=new Date().toISOString(), start=Date.now();
    const dir=join(this.config.root,runId);await mkdir(dir,{recursive:true});
    const args=['create','--name',name,'--network','none','--read-only','--user','65534:65534','--cap-drop','ALL',
      '--security-opt','no-new-privileges','--pids-limit','64','--cpus','1','--memory',`${plan.ceilings.memoryMb}m`,
      '--memory-swap',`${plan.ceilings.memoryMb}m`,'--tmpfs',`/tmp:rw,noexec,nosuid,size=${Math.max(1,Math.ceil(plan.ceilings.artifactBytes/1048576))}m`,
      '--workdir','/tmp'];
    const targets=new Set<string>();
    for(const mount of plan.mounts){
      if(!mount.readOnly || !/^[A-Za-z0-9._/-]+$/.test(mount.target) || mount.target.split('/').some(part=>!part||part==='.'||part==='..') || targets.has(mount.target)) throw new Error('invalid_mount');
      targets.add(mount.target);
      if(!inputs.artifacts.some(a=>a.artifactId===mount.artifactId&&a.sha256===mount.sha256))throw new Error('input_binding_mismatch');
      const source=resolve(this.config.artifacts,mount.sha256);
      const bytes=await readFile(source);if(hash(bytes)!==mount.sha256)throw new Error('input_hash_mismatch');
      // Copy verified bytes into the run-owned snapshot to prevent source mutation after verification.
      const snapshot=join(dir,mount.sha256);if (!targets.has(`hash:${mount.sha256}`)) { await writeFile(snapshot,bytes,{mode:0o444}); targets.add(`hash:${mount.sha256}`); }
      args.push('--mount',`type=bind,src=${snapshot},dst=/inputs/${mount.target},readonly`);
    }
    args.push(plan.runtimeImage,...plan.argv);
    await writeFile(join(dir,'intent.json'),canonicalJson({runId,name,plan,inputs,startedAt}));
    let outcome: ExecutionEvidence['outcome']='infrastructure_error',exitCode:number|null=null;
    try{
      await exec('docker',args,{timeout:15000,maxBuffer:1024*1024});
      const result=await new Promise<{code:number|null;outcome:ExecutionEvidence['outcome'];log:Buffer}>((resolveResult)=>{
        const child=spawn('docker',['start','--attach',name],{stdio:['ignore','pipe','pipe']});
        const chunks:Buffer[]=[];let size=0,reason:ExecutionEvidence['outcome']='completed';
        let killing:Promise<unknown>|null=null;
        const stop=()=>{killing??=exec('docker',['kill',name],{timeout:10000}).catch(()=>{});};
        const timer=setTimeout(()=>{reason='timeout';stop();},plan.ceilings.wallMs);
        const watchdog=setTimeout(()=>{reason='infrastructure_error';child.kill('SIGKILL');},plan.ceilings.wallMs+15000);
        const capture=(chunk:Buffer)=>{const remaining=Math.max(0,plan.ceilings.outputBytes-size);if(remaining)chunks.push(chunk.subarray(0,remaining));size+=chunk.length;if(size>plan.ceilings.outputBytes){reason='resource_limit';stop();}};
        child.stdout.on('data',capture);child.stderr.on('data',capture);
        child.on('error',()=>{reason='infrastructure_error';});
        child.on('close',async code=>{clearTimeout(timer);clearTimeout(watchdog);if(killing)await killing;resolveResult({code,outcome:reason,log:Buffer.concat(chunks)});});
      });
      outcome=result.outcome;exitCode=result.code;
      await writeFile(join(dir,'output.log'),result.log);
      const inspection=JSON.parse((await exec('docker',['inspect',name],{timeout:10000,maxBuffer:1024*1024})).stdout)[0];
      if(inspection.State.Running)throw new Error('container_still_running');
      exitCode=inspection.State.ExitCode;
      if(inspection.State.OOMKilled)outcome='resource_limit';
    }catch{outcome='infrastructure_error';}
    finally{
      // Confirm removal before returning evidence: no lingering candidate process can keep running.
      try{await exec('docker',['rm','--force',name],{timeout:10000});}
      catch{outcome='infrastructure_error';}
    }
    const evidence:ExecutionEvidence={runId,planId:plan.planId,runnerIdentity:'docker-protected-v1',isolation:'container',
      exitCode,outcome,durationMs:Date.now()-start,artifactIds:[],startedAt,finishedAt:new Date().toISOString()};
    // This slice exports only the bounded execution log. Candidate-produced outputs need separate content-addressed collection.
    const log=await readFile(join(dir,'output.log')).catch(()=>null);
    if(log){const sha=hash(log);await mkdir(this.config.artifacts,{recursive:true});await writeFile(join(this.config.artifacts,sha),log);evidence.artifactIds.push(`log:${sha}`);}
    await writeFile(join(dir,'evidence.json'),canonicalJson(evidence));return evidence;
  }
  async cancel(runId:string):Promise<CancellationEvidence>{
    if(!/^[a-f0-9-]{36}$/.test(runId))throw new Error('invalid_run_id');
    const intent=JSON.parse(await readFile(join(this.config.root,runId,'intent.json'),'utf8'));
    if(intent.name!==`promote-${runId}`)throw new Error('invalid_intent');
    try{await exec('docker',['rm','--force',intent.name],{timeout:10000});return{runId,confirmed:true,observedAt:new Date().toISOString(),reason:null};}
    catch{return{runId,confirmed:false,observedAt:new Date().toISOString(),reason:'termination_unconfirmed'};}
  }
}
