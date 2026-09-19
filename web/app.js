import { createOfficeScene } from '/office-scene.js';
import { createDemoState, advanceDemo, moveDemoCard, createOfficeModel, qaStageCopy } from '/office-model.js';
const $=id=>document.getElementById(id);
const list=x=>Array.isArray(x)?x:[];
const human=x=>String(x??'unknown').replace(/[_-]/g,' ');
let snapshot=null,mode='live',desk=null,opener=null,demoState=createDemoState(),model=null,playTimer=null,lastModel='';
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
function setText(id,text){const n=$(id);if(n)n.textContent=text}
function badge(text,tone=''){return node('span',human(text),`badge ${tone}`)}
function record(title,text,status){const n=node('article',undefined,'record');n.append(node('h3',title));if(status)n.append(badge(status));if(text)n.append(node('p',text));return n}
function empty(text){return node('p',text,'empty')}
function heading(text){return node('h3',text,'mini-heading')}
let scene;
try{scene=createOfficeScene($('scene-stage'),{onSelect:key=>openDesk(key),detailElement:$('desk')})}catch{ $('scene-stage').append(empty('3D rendering is unavailable. All five workspaces are accessible through the dock below.')); }
function allCards(){return model.kanban.columns.flatMap(c=>c.cards)}
function update(force=false){
 model=createOfficeModel(snapshot,mode,demoState);
 const stamp=JSON.stringify(model);const changed=stamp!==lastModel;lastModel=stamp;
 if(changed||force)scene?.update(model);
 const count=[allCards().filter(c=>c.status!=='completed'&&c.status!=='done').length,list(snapshot?.operations).length,model.strategy.ideas.length,model.qa.candidateId?1:0,model.finance.currency??'—'];
 if(mode==='demo')count[1]=demoState.phase>0&&demoState.phase<6?1:0;
 ['backlog','engineering','strategy','qa','finance'].forEach((key,i)=>setText(`count-${key}`,String(count[i])));
 const finance=model.finance;const money=v=>v==null?'Not reported':`${finance.currency??'?'} ${v.toFixed(2)}`;
 const ticker=[['USAGE',model.usage??'—'],['ERRORS',model.errors??'—'],['BACKLOG',count[0]],['CANDIDATES',model.qa.candidateId?1:'—'],['QA',model.qa.status==='idle'?'—':human(model.qa.status)],['SPEND',finance.spent==null?'—':money(finance.spent)]];
 $('ticker-values').replaceChildren(...ticker.map(([key,value])=>{const item=node('span',undefined,'ticker-item');item.append(node('small',key),node('b',String(value)));return item}));
 setText('ticker-source',mode==='demo'?'ILLUSTRATIVE DEMO':'RECORDED SNAPSHOT');
 document.body.dataset.mode=mode;$('demo-banner').hidden=mode!=='demo';
 $('live-mode').setAttribute('aria-pressed',String(mode==='live'));$('demo-mode').setAttribute('aria-pressed',String(mode==='demo'));
 setText('demo-step',`Step ${demoState.phase+1}/7 · ${model.qa.status==='idle'?'Ready to begin':human(model.qa.status)} · No real work or spending.`);
 $('advance-demo').disabled=demoState.phase>=6;setText('play-demo',playTimer?'Pause story':'Play story');
 setText('briefing-summary',mode==='demo'?`Demo · ${model.engineering.task}`:'Scope, evidence, spend and your big decisions');
 if(desk&&(changed||force))renderDesk();
}
function stopStory(){clearInterval(playTimer);playTimer=null;setText('play-demo','Play story')}
function nextStep(){demoState=advanceDemo(demoState);if(demoState.phase>=6)stopStory();update()}
$('advance-demo').onclick=nextStep;
$('play-demo').onclick=()=>{if(playTimer){stopStory();return}if(demoState.phase>=6)demoState=createDemoState();nextStep();playTimer=setInterval(nextStep,4200);update()};
$('reset-demo').onclick=()=>{stopStory();demoState=createDemoState();update()};
for(const m of ['live','demo'])$(`${m}-mode`).onclick=()=>{stopStory();mode=m;update(true)};
function openDesk(key,source){if(!['backlog','engineering','strategy','qa','finance','briefing'].includes(key))return;desk=key;opener=source??document.activeElement;scene?.focus(key==='briefing'?null:key);document.body.dataset.station = key; $('main').inert = true; $('desk').dataset.station = key; renderDesk();if(!$('desk').open)$('desk').show();$('close-desk').focus({preventScroll:true})}
function moveCard(id,columnId){demoState=moveDemoCard(demoState,id,columnId);update()}
function kanban(){
 const board=node('div',undefined,'kanban');
 model.kanban.columns.forEach(column=>{
  const col=node('section',undefined,'kanban-column');col.dataset.column=column.id;
  const h=node('h3',column.label);h.append(node('span',String(column.cards.length)));col.append(h);
  if(mode==='demo'){col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('drag-target')});col.addEventListener('dragleave',()=>col.classList.remove('drag-target'));col.addEventListener('drop',e=>{e.preventDefault();col.classList.remove('drag-target');moveCard(e.dataTransfer.getData('text/plain'),column.id)})}
  column.cards.forEach(card=>{
   const tile=node('article',undefined,`kanban-card kind-${card.kind}`);tile.dataset.card=card.id;
   tile.append(badge(card.kind),node('h4',card.title),node('small',card.id));
   const pipelineOwned=card.id==='demo-repair';
   if(mode==='demo'&&!pipelineOwned){tile.draggable=true;tile.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',card.id));const select=node('select');select.setAttribute('aria-label',`Move ${card.title}`);for(const c of model.kanban.columns){const option=node('option',c.label);option.value=c.id;option.selected=c.id===column.id;select.append(option)}select.addEventListener('change',()=>moveCard(card.id,select.value));tile.append(select)}
   else tile.append(node('span',pipelineOwned?'Follows the repair story':human(card.status),'card-status'));
   col.append(tile);
  });if(!column.cards.length)col.append(node('p','No work here','column-empty'));board.append(col);
 });return board;
}
function renderDesk(){
 const config={backlog:['PRIORITIES / THE WHITEBOARD','A board that runs the room.','The 3D whiteboard and these cards share the same state.'],engineering:['ENGINEERING / THE WORKSTATION','See the thinking turn into work.','Recorded progress and terminal content are mirrored on the workstation.'],strategy:['STRATEGY / THE IDEAS WALL','Make room for what comes next.','Feature proposals and changes that deserve the owner’s attention.'],qa:['QUALITY / THE PRODUCTION LINE','A change earns its place.','The candidate, stage lamps, terminal and backlog move together.'],finance:['FINANCE / THE SAFE','The resources behind the work.','Budget, commitments and spend stay distinct. Unknown costs stay unknown.'],briefing:['THE CEO’S BRIEFING','You make the big calls.','Mandate, integration status and the evidence behind reported progress.']};
 const [eye,title,sub]=config[desk];setText('desk-eyebrow',eye);setText('desk-title',title);setText('desk-subtitle',sub);$('desk').classList.toggle('wide',desk==='backlog'||desk==='qa');
 const content=$('desk-content');content.replaceChildren();
 if(mode==='demo')content.append(node('p','INTERACTIVE DEMO · Cards, logs, candidates and costs are illustrative. No provider calls or stored changes.','demo-note'));
 if(desk==='backlog'){content.append(kanban());content.append(node('p',mode==='demo'?'Move proposal cards between columns by dragging or using their dropdown. The repair card follows the story to keep QA and engineering consistent.':'Live cards come from persisted incidents. Reprioritization will require an authorized controller command; this view is read-only.','facts'))}
 if(desk==='engineering'){
  content.append(record(model.engineering.task,'The monitor and this terminal use identical recorded lines.',model.engineering.status));
  const terminal=node('div',undefined,'terminal');terminal.append(node('div',mode==='demo'?'DEMO / ENGINEERING TERMINAL':'RECORDED ENGINEERING EVENTS','terminal-label'),node('div',model.engineering.lines.join('\n')||'Waiting for the engineering provider.\nNo terminal output has been recorded.'));content.append(terminal);
  if(mode==='live')list(snapshot?.operations).forEach(o=>content.append(record(o.harnessId,`Dispatch ${o.id} · Incident ${o.incidentId}`,o.status)));
 }
 if(desk==='strategy'){
  if(!model.strategy.ideas.length)content.append(empty('No proposals have been recorded. Connecting customer feedback and prioritization will populate this wall.'));
  model.strategy.ideas.forEach(idea=>{const card=node('article',undefined,'sticky');card.append(node('h3',idea.title),node('p',idea.body),badge(idea.status));content.append(card)});
 }
 if(desk==='qa'){
  const qa=model.qa;content.append(record(qa.candidateId??'No candidate on the line',`Attempt ${qa.attempt||'—'} · ${human(qa.status)}`,qa.status));
  const problem=qa.stages.find(s=>s.outcome==='fail'||s.outcome==='error');
  const summary=problem?qaStageCopy(problem,mode):null;
  const banner=node('div',undefined,`outcome-banner ${qa.status==='failed'?'red':qa.status==='completed'?'green':''}`);
  banner.append(node('strong',summary?.headline??(qa.status==='completed'?'All checks passed':qa.status==='running'?'Checking the candidate':'Waiting for a candidate')),node('p',summary?.detail??'Only recorded checks can change the state of this line.'));content.append(banner);
  const evidence=node('section',undefined,'stage-evidence');evidence.id='stage-evidence';evidence.setAttribute('aria-live','polite');
  const pipeline=node('div',undefined,'pipeline');qa.stages.forEach(s=>{const copy=qaStageCopy(s,mode);const color=s.outcome==='pass'?'green':s.outcome==='fail'?'red':['pending','error'].includes(s.outcome)?'amber':'';const n=node('button',undefined,`stage ${color}`);n.dataset.qaStage=s.id;n.append(node('b',s.outcome==='pass'?'✓':s.outcome==='fail'?'×':s.outcome==='not_run'?'—':'•'),node('strong',copy.title),node('p',copy.headline),node('small','Inspect checks ↓'));n.onclick=()=>{evidence.replaceChildren(node('h3',copy.title),node('p',copy.detail),badge(s.outcome));};pipeline.append(n)});content.append(pipeline,evidence);
  if(mode==='demo'){const next=node('button',demoState.phase>=6?'Restart story':'Advance repair story →','action');next.onclick=()=>{if(demoState.phase>=6){demoState=createDemoState();update()}else nextStep()};content.append(next)}
  content.append(heading('Individual gate definitions & evidence requirements'));
  list(snapshot?.project?.catalog?.entries).forEach(g=>{const d=node('details');d.append(node('summary',`${g.label} · ${human(g.executionStatus)}`),node('p',g.limitations,'facts'),node('pre',JSON.stringify({command:g.argv,prerequisites:g.prerequisites,independence:g.oracleIndependence,mapping:g.autonomyGateIds},null,2),'detail'));content.append(d)});
 }
 if(desk==='finance'){
  const f=model.finance;const money=v=>v==null?'Not reported':`${f.currency??'(currency unknown)'} ${v.toFixed(2)}`;
  const box=node('div',undefined,'ledger');box.append(node('span',mode==='demo'?'ILLUSTRATIVE SPEND':'OBSERVED SPEND','eyebrow'),node('div',money(f.spent),'amount'));
  const dl=node('dl');[['Approved budget',money(f.budget)],['Reserved commitments',money(f.reserved)],['Uncommitted',f.budget==null||f.spent==null||f.reserved==null?'Unknown':money(f.budget-f.spent-f.reserved)],['Burn / hour',f.burnRate==null?'Insufficient cost history':money(f.burnRate)],['Usage',model.usage==null?'Not connected':String(model.usage)]].forEach(([key,value])=>{const row=node('div');row.append(node('dt',key),node('dd',value));dl.append(row)});box.append(dl);content.append(box);
  content.append(node('p','The safe opens when selected. Reported usage is not a price: no conversion from tokens or credits to currency is assumed. Budget changes need a versioned owner decision.','facts'));
 }
 if(desk==='briefing'){
  const project=snapshot?.project??{};content.append(record('Xarts Office',project.repositoryAvailable?`Checkout ${project.head?.slice(0,10)} · ${project.revisionMatchesCatalog?'audit matches':'re-audit required'}`:'Checkout not available'));
  content.append(record('Mandate',snapshot?.ownerReport?.mandate?.routineWork??'No operating mandate configured.',snapshot?.ownerReport?.mandate?.status));
  list(snapshot?.implementation?.milestones).forEach(m=>content.append(record(human(m.id),m.completedSlice??'Not yet delivered.',m.status)));
  content.append(record('Implementation verification',`${snapshot?.implementation?.verification?.testsPassed??'Unknown'} tests recorded. These verify Promoted, not a candidate Xarts release.`));
 }
 setText('desk-footer',mode==='demo'?'Demo state is local to this page. Reset or reload clears it. No live approval or spending.':'Read-only controller snapshot. Unknown evidence never becomes a pass.');
}
document.addEventListener('click',e=>{const target=e.target.closest('[data-open]');if(target)openDesk(target.dataset.open,target)});
$('close-desk').onclick=()=>$('desk').close();$('desk').addEventListener('close',()=>{desk=null;$('main').inert = false;delete document.body.dataset.station;scene?.focus(null);opener?.focus?.()});
$('desk').addEventListener('click',e=>{if(e.target===$('desk')){const r=$('desk').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('desk').close()}});
async function refresh(){const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),8000);try{const r=await fetch('/api/overview',{signal:abort.signal,cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(!data.project||!data.implementation)throw Error();snapshot=data;update();setText('connection-status','Local office connected');$('connection-light').classList.add('ready');setText('observed',`Provider ${human(data.project.providerStatus)} · updated ${new Date(data.observedAt).toLocaleTimeString()}`);$('error-banner').hidden=true}catch{setText('connection-status',snapshot?'Office disconnected · last snapshot':'Controller unavailable');$('connection-light').classList.remove('ready');setText('error-banner','Waiting for controller updates. The last snapshot remains visible.');$('error-banner').hidden=false}finally{clearTimeout(timeout);setTimeout(refresh,5000)}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopStory()});
update();refresh();

for (const button of document.querySelectorAll('.station-dock [data-open]')) {
 button.addEventListener('pointerenter',()=>scene?.preview?.(button.dataset.open));
 button.addEventListener('pointerleave',()=>scene?.preview?.(null));
 button.addEventListener('focus',()=>scene?.preview?.(button.dataset.open));
 button.addEventListener('blur',()=>scene?.preview?.(null));
}

$('office-menu').onclick=()=>{const open=document.body.classList.toggle('menu-open');$('office-menu').setAttribute('aria-expanded',String(open))};

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('desk').open){e.preventDefault();$('desk').close()}});

document.addEventListener('keydown',e=>{if(e.key!=='Tab'||!$('desk').open)return;const controls=[...$('desk').querySelectorAll('button,select,a[href],input,summary,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}});
