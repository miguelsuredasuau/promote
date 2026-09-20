import {integrationStatus} from './integration.mjs';
import {models} from './models.mjs';
import {itemState,missingItems} from './items.mjs';
import {storage} from './storage.mjs';
import {roomState,requirements} from './concept.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {dir,load} from './pipeline.mjs';
const inventory=[
 ['ceo','Agent CEO','People','Generate','Distinct executive character, contemporary tailoring; planning, prioritization and reporting poses.'],
 ['product-lead','Product & marketing lead','People','Generate','Creative adult professional; customer feedback, ideas and product strategy.'],
 ['engineer','Engineering colleague','People','Generate','Adult proportions, cobalt knit, natural typing and idle poses.'],
 ['qa-person','Quality colleague','People','Generate','Contemporary adult character, coral tailoring, tablet and inspection poses.'],
 ['chair','Sculptural lounge','Furniture','Reuse available','Expressive upholstery, polished chrome and a sculptural silhouette.'],
 ['workstation','Engineering workstation','Workspaces','Hybrid','Desk, monitor, keyboard, lamp and mug; live terminal remains a code surface.'],
 ['backlog','Work queue','Workspaces','Hybrid','Four-column board with live cards, framed screen and readable detail view.'],
 ['planning','Planning desk','Workspaces','Generate','Distinct rear desk with notebook, laptop and coordinated furniture.'],
 ['ideas','Ideas & direction','Workspaces','Hybrid','Pinned concepts, strategic proposals and a readable editable surface.'],
 ['qa-line','Quality conveyor','Operations','Hybrid','Four physical gates: Scope, Chart correctness, Regressions, Release.'],
 ['safe','Treasury vault','Operations','Hybrid','Cobalt housing, chrome wheel, articulated door and live budget display.'],
 ['ticker','Operations ticker','Operations','Code-built','Animated live metrics with a precise screen and zoom target.'],
 ['brand','Brand letters & panels','Identity','Code-built','Exact vector lettering mounted on the wall; transparent background.'],
 ['art','Editorial art','Identity','Generate','Abstract data-inspired art, coherent with the room concept.'],
 ['plants','Botanical collection','Atmosphere','Reuse or generate','Realistic foliage and contemporary ceramic planters.'],
 ['slide','Sculptural slide','Atmosphere','Generate','Sweeping orange ribbon, chrome interior, cobalt stairs, glass guard.'],
 ['room','Room shell & lighting','Architecture','Code-built','Terrazzo, clear glass, architectural lighting and reliable camera paths.']
];
async function optional(path,fallback){return storage().get(path.replace(/\.json$/,''),fallback);}
export async function progress(){
 const room=await roomState();const current=room.versions.at(-1);const approved=room.approvedVersion?room.versions.find(v=>v.id===room.approvedVersion):room.approvedVersion===undefined?current:null;const roomApproved=!!approved?.sha256&&approved.approvedHash===approved.sha256;
 const pilot=await load();const review=await optional('claude-review.json',null);const decisions=await optional('decisions.json',{revision:0,items:{},events:[]});
 const images=itemState();const assets=inventory.map(([id,name,category,method,description])=>{const generated=pilot?.assets.find(a=>a.id===id);const concept=images.jobs.filter(j=>j.itemId===id).at(-1);const hash=concept?.sha256??generated?.validation?.sha256;const d=decisions.items[id]??{};const shared=['workstation','backlog','planning','ideas','qa-line','safe','ticker','plants','room'].includes(id);const recommendation=d.feedback?'Your saved feedback requests changes.':id==='engineer'?'Pilot materials appear mottled; review a cleaner character design.':id==='slide'?'Your room feedback asks for a better sculptural slide.':id==='brand'?'Use the original SVG unchanged; generated lettering has drifted.':null;const generatedModel=models().jobs.filter(j=>j.itemId===id).at(-1);return{conceptVersions:images.jobs.filter(j=>j.itemId===id),generatedModel:generatedModel??null,recommendation,concept:concept??null,id,name,category,method,description,shared,collection:shared?'Reusable default':'Project signature',pilot:generated??null,version:hash??'planned-v1',choice:d.choice??null,feedback:d.feedback??'',approved:!!hash&&d.approvedHash===hash,preview:concept?.file?'/'+concept.file:generated?.state==='ready'?`/previews/${id}.png`:null};});
 const modelJobs=models().jobs;const ready=assets.filter(a=>a.generatedModel?.status==='ready'||a.pilot?.state==='ready').length;const activeModels=modelJobs.filter(j=>['planned','queued','submitting','generating'].includes(j.status)).length;
 const integration=await integrationStatus();const files=storage().indexFiles();return {integration,batch:{jobs:images.jobs,missing:missingItems(assets,images.jobs).map(a=>({id:a.id,name:a.name})),active:images.jobs.filter(j=>['planned','submitting','queued','generating'].includes(j.status)).length},draft:storage().get('draft',{}),storage:{engine:'SQLite',fileCount:files.length},files,decisionHistory:storage().history('decisions'),room,requirements,roomApproved,revision:decisions.revision,review,brief:pilot?.brief??null,assets,events:decisions.events,requests:pilot?.assets.filter(a=>a.requestId).length??0,ready,approved:assets.filter(a=>a.approved).length,actualCost:null,stages:[
 {name:'Repository review',state:review?'complete':'pending',detail:review?'Claude brief recorded':'Claude review not recorded yet'},
 {name:'Room concept',state:current?.status==='ready'?'complete':'next',detail:current?`Revision ${current.id} · ${current.status}`:'Written brief + large reference image'},
 {name:'Approve direction',state:roomApproved?'complete':current?.status==='ready'?'next':'locked',detail:roomApproved?'Current image approved':'Review all mandatory components'},
 {name:'Design every item',state:images.jobs.some(j=>j.status==='ready')?'complete':roomApproved?'next':'locked',detail:`${images.jobs.filter(j=>j.status==='ready').length} item images ready · ${assets.length} items mapped`},
 {name:'Approve item images',state:images.jobs.some(j=>j.status==='ready')?'next':'locked',detail:'Approve or revise each design'},
 {name:'3D generation queue',state:activeModels?'next':ready?'complete':'locked',detail:`${ready} items have models · ${activeModels} generating`},
 {name:'Review every model',state:ready?'next':'locked',detail:'Structural checks passed separately; final visual approval pending'},
 {name:'Assemble the room',state:ready?'next':'locked',badge:ready?'Preview':'Pending',detail:ready?`${ready} generated models in the office preview · final layout review pending`:'Requires selected models and layout checks'},
 {name:'Integration review',state:integration.complete?'complete':'next',detail:integration.complete?'Current office checks passed':'Placement · cameras · motion · readability · performance'}],updatedAt:new Date().toISOString()};
}
let writing=Promise.resolve();
export function decide(command){const next=writing.then(async()=>{const state=await progress();if(command.revision!==state.revision)throw Error('The board changed. Refresh and try again.');const asset=state.assets.find(a=>a.id===command.id);if(!asset)throw Error('Unknown item');if(command.version!==asset.version)throw Error('This item revision is stale');const decisions=await optional('decisions.json',{revision:0,items:{},events:[]});const item=decisions.items[asset.id]??{};
 if(command.action==='feedback'){if(typeof command.text!=='string'||!command.text.trim()||command.text.length>3000)throw Error('Feedback must contain 1–3000 characters');item.feedback=command.text.trim();delete item.approvedHash;}
 else if(command.action==='approve-image'){if(asset.concept?.status!=='ready'||asset.concept.sha256!==command.version)throw Error('Current completed image required');item.approvedHash=asset.concept.sha256;}
 else if(command.action==='reuse'){if(asset.pilot?.state!=='ready')throw Error('No reusable model is ready');item.choice='reuse';}
 else if(command.action==='new'){item.choice='generate';delete item.approvedHash;}
 else throw Error('Unsupported action');
 decisions.items[asset.id]=item;decisions.revision++;decisions.events.push({at:new Date().toISOString(),item:asset.name,action:command.action,version:asset.version,text:command.action==='feedback'?item.feedback:undefined,choice:item.choice});storage().put('decisions',decisions);await writeFile(join(dir,'decisions.tmp'),JSON.stringify(decisions,null,2));await rename(join(dir,'decisions.tmp'),join(dir,'decisions.json'));return progress();});writing=next.catch(()=>{});return next;}

export async function saveDraft(c){const allowed=['feedback','model','useExisting','baseVersion','checked','imageHash'];if(!c||typeof c!=='object'||Object.keys(c).some(k=>!allowed.includes(k)))throw Error('Invalid draft');if(c.feedback!==undefined&&(typeof c.feedback!=='string'||c.feedback.length>3000))throw Error('Invalid feedback');if(c.checked!==undefined&&(!Array.isArray(c.checked)||c.checked.some(k=>!requirements.some(([id])=>id===k))))throw Error('Invalid checklist');if(c.baseVersion!==undefined&&(!Number.isInteger(c.baseVersion)||c.baseVersion<1))throw Error('Invalid reference');const draft={...storage().get('draft',{}),...c,updatedAt:new Date().toISOString()};storage().put('draft',draft);return draft;}
