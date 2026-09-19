import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ExecutionPlan, ImmutableInputs, type ExecutionRunner, type CancellationEvidence, type ExecutionEvidence } from '../contracts/adapters';
import { canonicalJson } from '../contracts/canonical';
const exec = promisify(execFile);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Read one regular file from Docker's bounded tar response without extracting paths. */
export function exportedFile(tar: Buffer, maxBytes: number): Buffer {
  let file: Buffer | undefined;
  for(let offset=0;offset+512<=tar.length;){
    const header=tar.subarray(offset,offset+512);offset+=512;
    if(header.every(byte=>byte===0))break;
    const raw=header.subarray(124,136).toString().replace(/\0/g,'').trim();
    if(!/^[0-7]+$/.test(raw))throw Error('invalid_export_size');
    const size=parseInt(raw,8),type=header[156];
    if(size>maxBytes||offset+size>tar.length)throw Error('export_size_limit');
    if(type===0||type===48){if(file)throw Error('multiple_export_files');file=tar.subarray(offset,offset+size);}
    else if(type!==120||size>65536)throw Error('invalid_export_type');
    offset+=Math.ceil(size/512)*512;
  }
  if(!file)throw Error('missing_export_file');
  return file;
}

/** Container execution with trusted exact command allowlists and content-addressed file mounts. */
export class ContainerRunner implements ExecutionRunner {
  constructor(private config: { root: string; artifacts: string; commands: Record<string,{argv:string[];image:string; outputs?: Record<string,string>}> }) {}
  async run(raw: ExecutionPlan, rawInputs: ImmutableInputs): Promise<ExecutionEvidence> {
    const plan=ExecutionPlan.parse(raw),inputs=ImmutableInputs.parse(rawInputs);
    const allowed=this.config.commands[plan.commandId];
    if (!allowed || canonicalJson(allowed.argv)!==canonicalJson(plan.argv) || allowed.image!==plan.runtimeImage ||
      !/^(?:[^\s]+@)?sha256:[a-f0-9]{64}$/.test(plan.runtimeImage) || plan.network!=='none') throw new Error('untrusted_execution_plan');
    for(const [key,path] of Object.entries(allowed.outputs??{})) {
      if(!/^[a-z][a-z0-9-]*$/.test(key)||!/^\/exports\/[A-Za-z0-9._-]+$/.test(path))throw new Error('invalid_output_path');
    }
    const collected:string[]=[];
    const runId=randomUUID(), name=`promote-${runId}`, startedAt=new Date().toISOString(), start=Date.now();
    const dir=join(this.config.root,runId);await mkdir(dir,{recursive:true});
    const args=['create','--name',name,'--network','none','--read-only','--user','65534:65534','--cap-drop','ALL',
      '--security-opt','no-new-privileges','--pids-limit','64','--cpus','1','--memory',`${plan.ceilings.memoryMb}m`,
      '--memory-swap',`${plan.ceilings.memoryMb}m`,'--tmpfs',`/tmp:rw,nosuid,size=${Math.max(1,Math.ceil(plan.ceilings.artifactBytes/1048576))}m`,
      '--workdir','/tmp'];
    // An anonymous volume survives process exit for collection, is never mounted
    // into another job, and is removed with the container. No host write mount.
    if(Object.keys(allowed.outputs??{}).length)args.push('--mount','type=volume,dst=/exports',
      '--ulimit',`fsize=${plan.ceilings.artifactBytes}:${plan.ceilings.artifactBytes}`);
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
      await exec('docker',args,{timeout:15000,killSignal:'SIGKILL',maxBuffer:1024*1024});
      const result=await new Promise<{code:number|null;outcome:ExecutionEvidence['outcome'];log:Buffer}>((resolveResult)=>{
        const child=spawn('docker',['start','--attach',name],{stdio:['ignore','pipe','pipe']});
        const chunks:Buffer[]=[];let size=0,reason:ExecutionEvidence['outcome']='completed';
        let killing:Promise<unknown>|null=null;
        const stop=()=>{killing??=exec('docker',['kill',name],{timeout:10000,killSignal:'SIGKILL'}).catch(()=>{});};
        const timer=setTimeout(()=>{reason='timeout';stop();},plan.ceilings.wallMs);
        const watchdog=setTimeout(()=>{reason='infrastructure_error';child.kill('SIGKILL');},plan.ceilings.wallMs+15000);
        const capture=(chunk:Buffer)=>{const remaining=Math.max(0,plan.ceilings.outputBytes-size);if(remaining)chunks.push(chunk.subarray(0,remaining));size+=chunk.length;if(size>plan.ceilings.outputBytes){reason='resource_limit';stop();}};
        child.stdout.on('data',capture);child.stderr.on('data',capture);
        child.on('error',()=>{reason='infrastructure_error';});
        child.on('close',async code=>{clearTimeout(timer);clearTimeout(watchdog);if(killing)await killing;resolveResult({code,outcome:reason,log:Buffer.concat(chunks)});});
      });
      outcome=result.outcome;exitCode=result.code;
      await writeFile(join(dir,'output.log'),result.log);
      const inspection=JSON.parse((await exec('docker',['inspect',name],{timeout:10000,killSignal:'SIGKILL',maxBuffer:1024*1024})).stdout)[0];
      if(inspection.State.Running)throw new Error('container_still_running');
      exitCode=inspection.State.ExitCode;
      if(inspection.State.OOMKilled)outcome='resource_limit';
      // Export only trusted, named paths after the process has stopped. Never extract
      // an arbitrary candidate archive into the controller's filesystem.
      if(outcome==='completed'&&exitCode===0){
        let total=0;
        for(const [key,path] of Object.entries(allowed.outputs??{})){
          const limit=Math.min(64*1024*1024,plan.ceilings.artifactBytes-total);
          const response=await exec('docker',['cp',`${name}:${path}`,'-'],{timeout:15000,killSignal:'SIGKILL',maxBuffer:limit+65536,encoding:'buffer'});
          const bytes=exportedFile(response.stdout,limit);
          total+=bytes.length;
          if(total>plan.ceilings.artifactBytes){outcome='resource_limit';break;}
          const sha=hash(bytes);
          await mkdir(this.config.artifacts,{recursive:true});
          await writeFile(join(this.config.artifacts,sha),bytes);
          collected.push(`output:${key}:${sha}`);
        }
      }
    }catch(error){
      outcome='infrastructure_error';
      const prior=await readFile(join(dir,'output.log')).catch(()=>Buffer.alloc(0));
      const diagnostic=Buffer.from(`\nRunner infrastructure error: ${error instanceof Error?error.message:'unknown error'}\n`);
      await writeFile(join(dir,'output.log'),Buffer.concat([prior,diagnostic]).subarray(0,plan.ceilings.outputBytes));
    }
    finally{
      // Confirm removal before returning evidence: no lingering candidate process can keep running.
      try{await exec('docker',['rm','--force','--volumes',name],{timeout:10000,killSignal:'SIGKILL'});}
      catch{outcome='infrastructure_error';}
    }
    const evidence:ExecutionEvidence={runId,planId:plan.planId,runnerIdentity:'docker-protected-v1',isolation:'container',
      exitCode,outcome,durationMs:Date.now()-start,artifactIds:outcome==='completed'&&exitCode===0?collected:[],startedAt,finishedAt:new Date().toISOString()};
    const log=await readFile(join(dir,'output.log')).catch(()=>null);
    if(log){const sha=hash(log);await mkdir(this.config.artifacts,{recursive:true});await writeFile(join(this.config.artifacts,sha),log);evidence.artifactIds.push(`log:${sha}`);}
    await writeFile(join(dir,'evidence.json'),canonicalJson(evidence));return evidence;
  }
  async cancel(runId:string):Promise<CancellationEvidence>{
    if(!/^[a-f0-9-]{36}$/.test(runId))throw new Error('invalid_run_id');
    const intent=JSON.parse(await readFile(join(this.config.root,runId,'intent.json'),'utf8'));
    if(intent.name!==`promote-${runId}`)throw new Error('invalid_intent');
    try{await exec('docker',['rm','--force','--volumes',intent.name],{timeout:10000,killSignal:'SIGKILL'});return{runId,confirmed:true,observedAt:new Date().toISOString(),reason:null};}
    catch{return{runId,confirmed:false,observedAt:new Date().toISOString(),reason:'termination_unconfirmed'};}
  }
}
