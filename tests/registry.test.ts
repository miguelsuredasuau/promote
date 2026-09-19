import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { publishLocalRelease } from '../server/registry';
import { hashGateProfile } from '../contracts/gates';
import { ActiveRelease, ReleaseEnvelope } from '../contracts/integration';
import type { GateProfile } from '../contracts/profile';
import type { GateResult } from '../contracts/records';
const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});});
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function setup(){
 const root=mkdtempSync(join(tmpdir(),'promote-registry-'));roots.push(root);
 const profile:GateProfile={schemaVersion:1,profileId:'fixture',libraryId:'fixture',evaluatorRevision:'a'.repeat(40),gates:[{gateId:'package',gateVersion:1,requirement:'required',notApplicableAllowed:false}]};
 const identity={candidateSha:'b'.repeat(40),evaluatorRevision:profile.evaluatorRevision,inputHash:'c'.repeat(64),acceptanceContractHash:hashGateProfile(profile)};
 const results:GateResult[]=[{schemaVersion:1,id:'result-1',gateId:'package',gateVersion:1,candidateSha:identity.candidateSha,evaluatorRevision:identity.evaluatorRevision,inputHash:identity.inputHash,outcome:'pass',reason:'verified',expected:null,actual:null,logArtifactId:'log',durationMs:1,runnerIdentity:'fixture',startedAt:'2026-09-19T00:00:00Z',finishedAt:'2026-09-19T00:00:00Z'}];
 const packageBytes=Buffer.from('fixture package'),outputBytes=Buffer.from('<svg/>');
 return{root,input:{releaseId:'release-1',incidentId:'incident-1',identity,profile,results,packageBytes,outputBytes,expectedPackageHash:hash(packageBytes),expectedOutputHash:hash(outputBytes),authorize:(publish:()=>void)=>publish()}};
}
it('activates the exact evaluated bytes and a complete consumer-compatible record',()=>{
 const {root,input}=setup();const release=publishLocalRelease(root,input);
 expect(ReleaseEnvelope.parse(JSON.parse(readFileSync(join(root,'releases','release-1.json'),'utf8')))).toEqual(release);
 expect(ActiveRelease.parse(JSON.parse(readFileSync(join(root,'active.json'),'utf8'))).releaseId).toBe('release-1');
 expect(readFileSync(join(root,'packages',`${release.packageHash}.tgz`))).toEqual(input.packageBytes);
});
it('failed regeneration or authorization preserves the previous release',()=>{
 const {root,input}=setup();publishLocalRelease(root,input);const prior=readFileSync(join(root,'active.json'),'utf8');
 expect(()=>publishLocalRelease(root,{...input,releaseId:'release-2',outputBytes:Buffer.from('wrong output')})).toThrow('artifact_mismatch');
 expect(()=>publishLocalRelease(root,{...input,releaseId:'release-3',authorize:()=>{throw new Error('cancelled');}})).toThrow('cancelled');
 expect(readFileSync(join(root,'active.json'),'utf8')).toBe(prior);
});
it('failed evidence and a noninvoked authorization cannot activate',()=>{
 const {root,input}=setup();expect(()=>publishLocalRelease(root,{...input,results:[]})).toThrow('not_accepted');
 expect(()=>publishLocalRelease(root,{...input,authorize:()=>{}})).toThrow('not_authorized');
});
