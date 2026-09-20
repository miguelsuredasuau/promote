import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {storage} from './storage.mjs';
import {root,dir} from './pipeline.mjs';
export const integrationChecks=[['layout','Placement & single assets'],['camera','Zoom, pan & return'],['surfaces','Readable native surfaces'],['motion','People, conveyor & vault'],['runtime','Loading & browser errors'],['performance','Frame pacing']];
export async function integrationFingerprint(){const hash=createHash('sha256');for(const file of ['web/office-scene.js','web/office-furniture.js','web/office-materials.js','web/app.js','web/styles.css'])hash.update(await readFile(join(root,file)));try{hash.update(await readFile(join(dir,'office-assets.json')));}catch{hash.update('no-manifest');}return hash.digest('hex');}
export async function integrationStatus(){return evaluateIntegration(storage().get('office-integration',null),await integrationFingerprint());}
export function evaluateIntegration(report,fingerprint){const current=report?.fingerprint===fingerprint;const checks=integrationChecks.map(([id,title])=>({id,title,...(current?report.checks?.find(c=>c.id===id):null),status:current?(report.checks?.find(c=>c.id===id)?.status??'pending'):'pending'}));return{fingerprint,current,screenshots:current?(report.screenshots??[]):[],checkedAt:report?.checkedAt??null,checks,complete:current&&checks.every(c=>c.status==='passed'),note:report&&!current?'Office code or assets changed. Repeat integration review.':'Checks apply to the currently installed office, not pending model generations.'};}
