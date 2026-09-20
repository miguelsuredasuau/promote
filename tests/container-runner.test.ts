import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ContainerRunner } from '../server/container-runner';
const roots:string[]=[];afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
const image='node@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d';
function setup(script:string,wallMs=10000,outputBytes=4096){
 const root=mkdtempSync(join(tmpdir(),'promote-container-'));roots.push(root);const artifacts=join(root,'artifacts');mkdirSync(artifacts);
 const bytes=Buffer.from('immutable input'),sha=createHash('sha256').update(bytes).digest('hex');writeFileSync(join(artifacts,sha),bytes);
 const argv=['node','-e',script];const runner=new ContainerRunner({root:join(root,'runs'),artifacts,commands:{test:{argv,image}}});
 const plan={planId:'test-plan',commandId:'test',argv,runtimeImage:image,mounts:[{artifactId:'input',sha256:sha,target:'input.txt',readOnly:true}],
 ceilings:{wallMs,memoryMb:128,outputBytes,artifactBytes:1048576},network:'none' as const};
 const inputs={candidateSha:null,evaluatorRevision:'a'.repeat(40),artifacts:[{artifactId:'input',sha256:sha}]};
 return{root,artifacts,runner,plan,inputs};
}
it('rejects command substitution and changed source identity before execution',async()=>{
 const s=setup('console.log(1)');await expect(s.runner.run({...s.plan,argv:['sh','-c','true']},s.inputs)).rejects.toThrow('untrusted');
 writeFileSync(join(s.artifacts,s.inputs.artifacts[0].sha256),'changed');await expect(s.runner.run(s.plan,s.inputs)).rejects.toThrow('input_hash');
});
const docker=it.skipIf(process.env.PROMOTE_DOCKER_TEST!=='1');
docker('runs an actual isolated container with immutable input and no inherited secrets',async()=>{
 const s=setup(`const fs=require('fs');let blocked=false;try{fs.writeFileSync('/inputs/input.txt','bad')}catch{blocked=true}console.log(JSON.stringify({uid:process.getuid(),input:fs.readFileSync('/inputs/input.txt','utf8'),blocked,secret:process.env.PROMOTE_TEST_SECRET??null,socket:fs.existsSync('/var/run/docker.sock')}));`);
 process.env.PROMOTE_TEST_SECRET='synthetic-canary';
 try{const e=await s.runner.run(s.plan,s.inputs);expect(e.outcome).toBe('completed');expect(e.exitCode).toBe(0);
 const facts=JSON.parse(readFileSync(join(s.artifacts,e.artifactIds[0].slice(4)),'utf8'));expect(facts).toEqual({uid:65534,input:'immutable input',blocked:true,secret:null,socket:false});}
 finally{delete process.env.PROMOTE_TEST_SECRET;}
},20000);
docker('kills a timed out container and returns no successful execution',async()=>{
 const s=setup('setInterval(()=>{},1000)',250);const e=await s.runner.run(s.plan,s.inputs);expect(e.outcome).toBe('timeout');expect(e.exitCode).not.toBe(0);
},20000);
docker('bounds candidate log output',async()=>{
 const s=setup('setInterval(()=>console.log("x".repeat(10000)),1)',3000,128);const e=await s.runner.run(s.plan,s.inputs);
 expect(e.outcome).toBe('resource_limit');expect(readFileSync(join(s.artifacts,e.artifactIds[0].slice(4))).length).toBeLessThanOrEqual(128);
},20000);
docker('blocks outbound network access',async()=>{
 const s=setup(`fetch('http://1.1.1.1',{signal:AbortSignal.timeout(500)}).then(()=>{console.log('unexpected');process.exitCode=1}).catch(()=>console.log('network blocked'));`);
 const e=await s.runner.run(s.plan,s.inputs);expect(e.exitCode).toBe(0);expect(readFileSync(join(s.artifacts,e.artifactIds[0].slice(4)),'utf8').trim()).toBe('network blocked');
},20000);

docker('exports only bounded regular files after the candidate exits',async()=>{
 const { execFileSync }=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'promote-export-image-'));roots.push(root);
 writeFileSync(join(root,'Dockerfile'),`FROM ${image}\nRUN mkdir /exports && chmod 777 /exports\n`);
 const exportImage=execFileSync('docker',['build','--quiet',root],{encoding:'utf8',timeout:60000}).trim();
 try {
  const s=setup('');
  const argv=['node','-e',"require('fs').writeFileSync('/exports/package.bin','verified bytes')"];
  const runner=new ContainerRunner({root:join(s.root,'exports'),artifacts:s.artifacts,commands:{test:{argv,image:exportImage,outputs:{package:'/exports/package.bin'}}}});
  const result=await runner.run({...s.plan,argv,runtimeImage:exportImage},s.inputs);
  expect(result.outcome).toBe('completed');expect(result.exitCode).toBe(0);
  const artifact=result.artifactIds.find(id=>id.startsWith('output:package:'))!;
  expect(readFileSync(join(s.artifacts,artifact.split(':')[2]),'utf8')).toBe('verified bytes');
  const symlinkArgv=['node','-e',"require('fs').symlinkSync('/etc/passwd','/exports/package.bin')"];
  const unsafe=new ContainerRunner({root:join(s.root,'symlink'),artifacts:s.artifacts,commands:{test:{argv:symlinkArgv,image:exportImage,outputs:{package:'/exports/package.bin'}}}});
  const refused=await unsafe.run({...s.plan,argv:symlinkArgv,runtimeImage:exportImage},s.inputs);
  expect(refused.outcome).toBe('infrastructure_error');
  expect(refused.artifactIds.some(id=>id.startsWith('output:'))).toBe(false);
 } finally {execFileSync('docker',['image','rm',exportImage],{timeout:15000,stdio:'ignore'});}
},90000);

docker('exports exit-78 diagnostics without exporting a failed package',async()=>{
 const {execFileSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'promote-diagnostic-image-'));roots.push(root);
 // A unique label ensures cleanup removes only this test-created image.
 writeFileSync(join(root,'Dockerfile'),`FROM ${image}\nLABEL promote.test="${randomUUID()}"\nRUN mkdir /exports && chmod 777 /exports\n`);
 const diagnosticImage=execFileSync('docker',['build','--quiet',root],{encoding:'utf8',timeout:60000}).trim();
 try{
  const s=setup('');
  const argv=['node','-e',"const fs=require('fs');fs.writeFileSync('/exports/report.json',JSON.stringify({infrastructureFailure:'command_unavailable'}));fs.writeFileSync('/exports/package.bin','must never release');process.exit(78)"];
  const runner=new ContainerRunner({root:join(s.root,'diagnostics'),artifacts:s.artifacts,commands:{test:{argv,image:diagnosticImage,outputs:{package:'/exports/package.bin'},diagnosticOutputs:{report:'/exports/report.json'}}}});
  const result=await runner.run({...s.plan,argv,runtimeImage:diagnosticImage},s.inputs);
  expect(result).toMatchObject({outcome:'completed',exitCode:78});
  expect(result.artifactIds.some(id=>id.startsWith('output:'))).toBe(false);
  const report=result.artifactIds.find(id=>id.startsWith('diagnostic:report:'))!;
  expect(JSON.parse(readFileSync(join(s.artifacts,report.split(':')[2]),'utf8'))).toEqual({infrastructureFailure:'command_unavailable'});
  const ordinary=new ContainerRunner({root:join(s.root,'ordinary-failure'),artifacts:s.artifacts,commands:{test:{argv,image:diagnosticImage,outputs:{package:'/exports/package.bin'}}}});
  const failed=await ordinary.run({...s.plan,argv,runtimeImage:diagnosticImage},s.inputs);
  expect(failed).toMatchObject({outcome:'completed',exitCode:78});
  expect(failed.artifactIds.every(id=>id.startsWith('log:'))).toBe(true);
 }finally{execFileSync('docker',['image','rm',diagnosticImage],{timeout:15000,stdio:'ignore'});}
},90000);
