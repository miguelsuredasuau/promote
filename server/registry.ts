import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, rmdirSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { join } from 'node:path';
import { ActiveRelease, ReleaseEnvelope } from '../contracts/integration';
import { evaluateAcceptance } from '../contracts/gates';
import { canonicalJson } from '../contracts/canonical';
import type { AcceptanceIdentity, GateResult } from '../contracts/records';
import type { GateProfile } from '../contracts/profile';
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function immutable(path: string, bytes: Uint8Array | string) {
  if (existsSync(path)) {
    if (digest(readFileSync(path)) !== digest(bytes)) throw new Error('immutable_registry_conflict');
    return;
  }
  writeFileSync(path, bytes, { flag: 'wx' });
  const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
}

/** Trusted release boundary. Caller regenerates first and binds its artifact to the evaluator's evidence. */
export function publishLocalRelease(root: string, input: {
  releaseId: string; incidentId: string; identity: AcceptanceIdentity; profile: GateProfile;
  results: GateResult[]; packageBytes: Uint8Array; outputBytes: Uint8Array;
  expectedPackageHash: string; expectedOutputHash: string;
  /** Must validate current incident revision/cancellation under a DB write transaction and invoke publish within it. */
  authorize: (publish: () => void) => void;
}) {
  if (!evaluateAcceptance(input.profile,input.identity,input.results).accepted) throw new Error('release_not_accepted');
  const packageHash=digest(input.packageBytes), outputArtifactHash=digest(input.outputBytes);
  if (packageHash !== input.expectedPackageHash || outputArtifactHash !== input.expectedOutputHash) throw new Error('evaluated_artifact_mismatch');
  mkdirSync(root,{recursive:true});
  const lock=join(root,'.release-lock');mkdirSync(lock); // An abandoned lock requires reconciliation, never automatic expiry.
  try {
    for(const dir of ['packages','outputs','manifests','releases'])mkdirSync(join(root,dir),{recursive:true});
    const active=existsSync(join(root,'active.json'))?ActiveRelease.parse(JSON.parse(readFileSync(join(root,'active.json'),'utf8'))):null;
    const manifest=canonicalJson({identity:input.identity,profile:input.profile,results:input.results,packageHash,outputArtifactHash});
    const manifestHash=digest(manifest);
    const release=ReleaseEnvelope.parse({schemaVersion:1,id:input.releaseId,incidentId:input.incidentId,
      acceptedSha:input.identity.candidateSha,packageHash,outputArtifactHash,manifestHash,
      gateResultIds:input.results.map(r=>r.id),priorReleaseId:active?.releaseId??null,destination:'local_demo_registry',activatedAt:new Date().toISOString()});
    immutable(join(root,'packages',`${packageHash}.tgz`),input.packageBytes);
    immutable(join(root,'outputs',`${outputArtifactHash}.svg`),input.outputBytes);
    immutable(join(root,'manifests',`${manifestHash}.json`),manifest);
    immutable(join(root,'releases',`${release.id}.json`),canonicalJson(release));
    const pointer=ActiveRelease.parse({schemaVersion:1,releaseId:release.id,activatedAt:release.activatedAt});
    let published = false;
    input.authorize(()=>{
      if (published) throw new Error('duplicate_activation');
      const tmp=join(root,`active.${randomUUID()}.tmp`);immutable(tmp,canonicalJson(pointer));renameSync(tmp,join(root,'active.json'));
      const fd=openSync(root,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
      published = true;
    });
    if (!published) throw new Error('activation_not_authorized');
    return release;
  } finally { rmdirSync(lock); }
}
