import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {projectEnvironment} from '../server/environment.mjs';
import {officeBrand} from '../studio/brand-profile.mjs';
import {decisionDemos} from '../web/decision-demo.js';
const root=resolve(import.meta.dirname,'..'),dir=join(root,'.local/decision-visuals'),out=join(root,'web/assets/decisions');
const model='openai/gpt-image-2.5/flare/edit',base='https://queue.fal.run/openai/gpt-image-2.5';
await mkdir(dir,{recursive:true});await mkdir(out,{recursive:true});
const lock=await open(join(dir,'batch.lock'),'wx');
const key=projectEnvironment(root).FAL_KEY;
const api=async(url,body)=>{if(!key)throw Error('FAL_KEY missing');const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error(`fal HTTP ${r.status}`);return r.json();};
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 const reference=await readFile(join(root,'.local/asset-studio/references/style.png'));
 const results=await Promise.allSettled(decisionDemos.map(async d=>{
  const prompt=`Create a polished conceptual infographic illustration for the Promote engineering office. ${officeBrand.illustration}. Palette and materials: ${officeBrand.materials}. Use the reference only for palette, finish and design sophistication. New composition: ${d.scene} Strong left-to-right narrative with three clearly separated stages. Fill the landscape composition generously. No text, letters, numbers, logos, captions, UI, watermarks or charts with invented metrics. Labels will be added in HTML.`;
  const fingerprint=hash(JSON.stringify({model,prompt,reference:hash(reference)}));
  const file=join(dir,`${d.id}.json`);let job;try{job=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;job={id:d.id,fingerprint,model,status:'planned',costUsd:null};}
  const save=async()=>{await writeFile(file+'.tmp',JSON.stringify(job,null,2));await rename(file+'.tmp',file);};
  if(job.fingerprint!==fingerprint)throw Error(`${d.id}: changed input; explicit new revision required`);
  if(job.status==='ready'){if(hash(await readFile(join(out,`${d.id}.png`)))!==job.sha256)throw Error('Image hash mismatch');return;}
  if(!job.requestId){if(job.status!=='planned')throw Error(`${d.id}: submission uncertain; never automatically resubmit`);if(!process.argv.includes('--submit'))throw Error('Pass --submit to authorize initial generation');job.status='submitting';await save();const result=await api('https://queue.fal.run/'+model,{prompt,image_urls:['data:image/png;base64,'+reference.toString('base64')],image_size:{width:1536,height:1024},quality:'high',num_images:1,output_format:'png'});if(!result.request_id)throw Error('Missing request ID; inspect provider before retry');job.requestId=result.request_id;job.status='queued';await save();console.log(d.id+': queued');}
  for(let i=0;i<180;i++){
   const url=base+'/requests/'+encodeURIComponent(job.requestId),status=await api(url+'/status');
   if(status.status==='COMPLETED'){
    const result=await api(url),imageUrl=new URL(result.images?.[0]?.url);if(imageUrl.protocol!=='https:'||!(imageUrl.hostname==='fal.media'||imageUrl.hostname.endsWith('.fal.media')))throw Error('Unexpected image host');
    const response=await fetch(imageUrl,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Image download failed');let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>25e6)throw Error('Image too large');chunks.push(chunk);}const png=Buffer.concat(chunks);if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Expected PNG');await writeFile(join(out,d.id+'.png.tmp'),png);await rename(join(out,d.id+'.png.tmp'),join(out,d.id+'.png'));job.status='ready';job.sha256=hash(png);job.completedAt=new Date().toISOString();await save();console.log(d.id+': ready');return;
   }
   if(!['IN_QUEUE','IN_PROGRESS'].includes(status.status))throw Error('Unexpected queue status');await new Promise(r=>setTimeout(r,5000));
  }throw Error('Polling timed out; run again to resume existing request');
 }));
 results.forEach((r,i)=>{if(r.status==='rejected'){console.error(decisionDemos[i].id+': '+r.reason.message);process.exitCode=1;}});
}finally{await lock.close();await unlink(join(dir,'batch.lock'));}
