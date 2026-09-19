import {storage} from './storage.mjs';
import {projectEnvironment} from '../server/environment.mjs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const root=resolve(import.meta.dirname,'..');
export const dir=join(root,'.local/asset-studio');
export async function load(){return storage().get('state',null);}
let saving=Promise.resolve();
export function save(state){const content=JSON.stringify(state,null,2);saving=saving.then(async()=>{storage().put('state',JSON.parse(content));await mkdir(dir,{recursive:true});await writeFile(join(dir,'state.tmp'),content);await rename(join(dir,'state.tmp'),join(dir,'state.json'));});return saving;}
export function inspectGLB(bytes){
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB container');
 const length=bytes.readUInt32LE(12);if(length>bytes.length-20||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Missing glTF JSON');
 const doc=JSON.parse(bytes.subarray(20,20+length).toString());
 if(['buffers','images'].some(k=>(doc[k]??[]).some(v=>v.uri&&!v.uri.startsWith('data:'))))throw Error('External asset dependency rejected');
 let triangles=0;for(const mesh of doc.meshes??[])for(const p of mesh.primitives){const n=doc.accessors?.[p.indices??p.attributes.POSITION]?.count??0;if((p.mode??4)===4)triangles+=n/3;}
 if(!triangles||triangles>150000||bytes.length>60e6)throw Error('Asset exceeds geometry or download budget');
 return {bytes:bytes.length,triangles:Math.round(triangles),meshes:doc.meshes.length,animations:(doc.animations??[]).length,skins:(doc.skins??[]).length,sha256:createHash('sha256').update(bytes).digest('hex'),status:'Structural checks passed; visual review required'};
}
export async function brief(checkout){
 const paths=['README.md','core/theme/tokens.ts'];const evidence=[];const texts=[];
 for(const path of paths){const text=await readFile(join(checkout,path),'utf8');texts.push(text);evidence.push({path,sha256:createHash('sha256').update(text).digest('hex')});}
 const commit=execFileSync('git',['rev-parse','--short','HEAD'],{cwd:checkout,encoding:'utf8'}).trim();
 const colors=[...new Set(texts[1].match(/#[0-9a-fA-F]{6}\b/g)??[])].slice(0,12);
 return {name:'Xarts',commit,evidence,sourcePalette:colors,signals:[{label:'Editorial charts',observed:/editorial/i.test(texts[0])},{label:'Reproducible SVG',observed:/reproducible/i.test(texts[0])&&/SVG/.test(texts[0])},{label:'Measured validation',observed:/measured|measuring/i.test(texts[0])}],direction:'Contemporary creative technology studio. Precise editorial surfaces, adult staff, rich cobalt and turquoise, tangerine accents, chrome and pale terrazzo.',palette:['#255bc0','#249e9c','#f47735','#f1eade'],directionSource:'Repository signals combined with Miguel’s explicit office art direction. Cobalt and orange are creative overrides, not inferred repository tokens.',privacy:'Only authored object prompts leave this machine; repository source and credentials are not uploaded.'};
}
async function key(){const value=projectEnvironment(root).FAL_KEY;if(!value)throw Error('FAL_KEY not configured');return value;}
async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Key ${await key()}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`fal request failed: HTTP ${r.status}`);return r.json();}
const endpoint='fal-ai/meshy/v6-preview/text-to-3d';
async function generate(checkout){
 let state=await load();if(!state){state={version:1,createdAt:new Date().toISOString(),brief:await brief(checkout),provider:'fal / Meshy 6 Preview',maxRequests:2,actualCost:null,assets:[
 {id:'chair',name:'The cobalt lounge',role:'Sculptural furniture',state:'planned',prompt:'One premium contemporary sculptural lounge armchair, electric cobalt blue woven upholstered cushions, rounded generous adult-sized seat and curved back, elegant polished tubular chrome base. Realistic product design with visible seams and fine fabric detail. A standalone complete object centered, no room, no person, no floor, no text, no logo. Refined creative technology office furniture, physically plausible construction.'},
 {id:'engineer',name:'Your first engineer',role:'Adult office character',state:'planned',prompt:'One realistic adult male software engineer age 30, natural human proportions, defined friendly face, short dark textured hair and subtle beard. Cobalt fine knit sweater, cream tailored trousers, white minimalist sneakers. Full body standing A-pose, clearly separated arms and legs and hands, relaxed neutral face, realistic clothing folds. Premium contemporary creative studio professional. No accessories, no floor, no backdrop, no text, no logo.'}
 ]};await save(state);}
 await Promise.all(state.assets.map(async a=>{
  if(['ready','failed'].includes(a.state))return;
  try{
   if(!a.requestId){
    if(a.state==='submitting')throw Error('Submission outcome unknown; refusing duplicate paid request');
    a.state='submitting';await save(state);
    const result=await api(`https://queue.fal.run/${endpoint}`,{prompt:a.prompt,mode:'full',target_polycount:a.id==='engineer'?30000:16000,should_remesh:true,enable_pbr:true,enable_rigging:a.id==='engineer',enable_animation:a.id==='engineer',animation_action_id:0,...(a.id==='engineer'?{pose_mode:'a-pose'}:{})});
    a.requestId=result.request_id;a.state='queued';await save(state);
   }
   for(let i=0;i<180;i++){
    const base=`https://queue.fal.run/fal-ai/meshy/requests/${encodeURIComponent(a.requestId)}`;
    const status=await api(`${base}/status`);a.state=status.status==='IN_QUEUE'?'queued':'generating';a.queuePosition=status.queue_position??null;await save(state);
    if(status.status==='COMPLETED'){
     const result=await api(base);const file=result.animation_glb??result.rigged_character_glb??result.model_glb;
     if(!file?.url)throw Error('Provider returned no GLB');const u=new URL(file.url);if(u.protocol!=='https:'||!(u.hostname==='fal.media'||u.hostname.endsWith('.fal.media')))throw Error('Unexpected asset download host');
     a.state='validating';await save(state);const response=await fetch(u,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Asset download failed');if(Number(response.headers.get('content-length'))>60e6)throw Error('Asset too large');
     const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>60e6)throw Error('Asset too large');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
     a.validation=inspectGLB(bytes);if(a.id==='engineer'&&(!a.validation.skins||!a.validation.animations))throw Error('Expected rig and animation are missing');
     await writeFile(join(dir,`${a.id}.glb`),bytes);a.state='ready';a.url=`/assets/${a.id}.glb`;a.finishedAt=new Date().toISOString();await save(state);break;
    }
    await new Promise(r=>setTimeout(r,10000));
   }
  }catch(error){a.state='failed';a.error=error.message;await save(state);}
 }));
 return state;
}
export async function run(checkout){await mkdir(dir,{recursive:true});const {open,unlink}=await import('node:fs/promises');const lock=await open(join(dir,'worker.lock'),'wx');try{return await generate(checkout);}finally{await lock.close();await unlink(join(dir,'worker.lock'));}}
if(process.argv[1]===import.meta.filename){const checkout=process.argv[2];if(!checkout)throw Error('Usage: node studio/pipeline.mjs /path/to/repository');const result=await run(resolve(checkout));console.log(JSON.stringify(result.assets.map(({id,state,error,validation})=>({id,state,error,validation})),null,2));}
