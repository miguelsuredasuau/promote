'use strict';
const $=id=>document.getElementById(id);
let snapshot=null, mode='live', desk=null, opener=null;
const logo=$('xarts-logo');
function logoReady(){if(logo.naturalWidth){logo.hidden=false;$('xarts-wordmark').hidden=true}}
logo.addEventListener('load',logoReady);logoReady();
const list=x=>Array.isArray(x)?x:[];
const human=x=>String(x??'unknown').replace(/[_-]/g,' ');
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function tag(text,tone=''){return node('span',human(text),`badge ${tone}`)}
function record(title,body,status){const n=node('article',undefined,'record');n.append(node('h3',title));if(status)n.append(tag(status));if(body)n.append(node('p',body));return n;}
const demo={backlog:[['Fix','Preserve negative values in waterfall totals','Engineering'],['Feature','Add reconciliation annotations','Ready to scope'],['Fix','Keep long labels inside narrow cards','Queued'],['Feature','Export a presentation-ready chart deck','Owner review']],ideas:[['A chart that explains itself','Turn customer questions into annotated financial narratives. Proposal only.'],['Presentation export','Give teams a ready-to-share slide, not another screenshot. Requires investment review.'],['A stronger geometry oracle','Explore independent checks for clipped labels. Separate gate adoption required.']],terminal:['$ reproduce --case negative-opening','Baseline reproduced: expected -40, received 0','→ inspecting the financial bridge resolver','→ candidate patch prepared in isolated checkout','$ verify --profile financial-repair','PASS  schema + type compatibility','FAIL  signed reconciliation on held-out input','→ returning counterexample to engineering'],prs:[{title:'PR #24 · Financial bridge repair',states:['green','green','red','amber'],labels:['Pass','Pass','Failed','Held']},{title:'PR #23 · Label spacing',states:['green','green','green','amber'],labels:['Pass','Pass','Pass','Pending']}]};
function isDemo(){return mode==='demo'}
function currentBacklog(){return list(snapshot?.incidents).filter(i=>!['completed','cancelled','refused','budget_exhausted'].includes(i.status))}
function setText(id,text){const n=$(id);if(n)n.textContent=text}
function renderOffice(){
 const backlog=currentBacklog(),ops=list(snapshot?.operations),gates=list(snapshot?.project?.catalog?.entries);
 const results=list(snapshot?.events).filter(e=>e.type==='gate.finished').map(e=>e.payload?.result).filter(Boolean);
 const passed=results.filter(r=>r.outcome==='pass').length;
 const ticker=isDemo()?[['USAGE','1,248'],['ERRORS','3'],['BACKLOG','4'],['PRs','2'],['QA PASS','91.7%'],['SPEND','€26.40']]:[['USAGE','—'],['ERRORS','—'],['BACKLOG',String(backlog.length)],['PRs','—'],['QA PASS',results.length?`${Math.round(passed/results.length*100)}%`:'—'],['SPEND','—']];
 $('ticker-values').replaceChildren(...ticker.map(([key,value])=>{const item=node('span',undefined,'ticker-item');item.append(node('small',key),node('b',value));return item}));
 setText('ticker-source',isDemo()?'ILLUSTRATIVE DEMO':results.length?'VISIBLE SNAPSHOT · PARTIAL TELEMETRY':'TELEMETRY NOT CONNECTED');

 const counts=isDemo()?['4','1','3','2','€']: [String(backlog.length),String(ops.length),String(list(snapshot?.ownerReport?.decisions).length),String(gates.length),'—'];
 ['backlog','engineering','strategy','qa','finance'].forEach((key,i)=>setText(`count-${key}`,counts[i]));
 const labels=isDemo()?['4 priorities · demo','Repairing financial bridge · demo','3 proposals · demo','2 candidates · demo','€26.40 spent · demo']: [`${backlog.length} recorded priorities`,ops.length?`${ops.length} dispatch records`:'Ready for a brief','Awaiting proposals',`${gates.length} checks · not run`,'Budget not configured'];
 ['backlog','engineering','strategy','qa','finance'].forEach((key,i)=>setText(`scene-${key}-status`,labels[i]));
 setText('bubble-engineering',isDemo()?'Fixing signed totals…':ops.length?'Inspect my recorded progress':'Ready for my first brief');
 setText('bubble-qa',isDemo()?'One check needs a retry':'Waiting for a candidate');
 setText('briefing-summary',isDemo()?'A repair, a proposal, and one decision · demo':snapshot?.ownerReport?.mandate?.status==='not_configured'?'Set the mandate. Then delegate.':'Open priorities, evidence and decisions');
 $('demo-banner').hidden=!isDemo();document.body.dataset.mode=mode;
 $('live-mode').setAttribute('aria-pressed',String(!isDemo()));$('demo-mode').setAttribute('aria-pressed',String(isDemo()));
}
function empty(text){return node('p',text,'empty')}
function title(text){return node('h3',text,'mini-heading')}
function openDesk(which,source){desk=which;opener=source??document.activeElement;renderDesk();if(!$('desk').open)$('desk').showModal()}
function renderDesk(){
 const names={backlog:['THE WHITEBOARD','Work worth doing.','Fixes, features, and priorities—the queue your CEO is managing.'],engineering:['THE ENGINEER’S COMPUTER','Inside the work.','Inspect the agent’s recorded progress, attempts and output.'],strategy:['THE MARKETING & STRATEGY WALL','The next big thing.','Customer signals, feature ideas, and changes that need your judgment.'],qa:['THE PRODUCTION LINE','Every change earns its green.','Schema → build → semantics → release. A stopped line is a useful signal.'],finance:['THE FINANCE SAFE','Keep ambition funded.','Budgets, commitments, expenses and burn. Every number needs a source.'],briefing:['YOUR CEO’S BRIEFING','You make the big calls.','The state of your office, with the evidence behind it.']};
 const [eyebrow,heading,sub]=names[desk];setText('desk-eyebrow',eyebrow);setText('desk-title',heading);setText('desk-subtitle',sub);
 const content=$('desk-content');content.replaceChildren();if(isDemo())content.append(node('p','ILLUSTRATIVE DEMO · These tasks, checks and costs are examples. No live work or spending.','demo-note'));
 if(desk==='backlog'){
  if(isDemo())demo.backlog.forEach(([kind,name,state])=>content.append(record(`${kind} · ${name}`,'Illustrative priority. No task has been dispatched.',state)));
  else {const rows=currentBacklog();if(!rows.length)content.append(empty('The whiteboard is clear. No fixes or features have been recorded yet. Connecting feedback and the engineering intake will populate this board.'));rows.forEach(i=>content.append(record(i.requestedOutcome?.summary??i.id,`${human(i.requestedOutcome?.kind)} · ${i.id}`,i.status)));}
 }
 if(desk==='engineering'){
  const terminal=node('div',undefined,'terminal');terminal.append(node('div',isDemo()?'DEVIN / ILLUSTRATIVE TERMINAL':'ENGINEERING / RECORDED EVENT STREAM','terminal-label'));
  if(isDemo())terminal.append(node('div',demo.terminal.join('\n')));
  else {const events=list(snapshot?.events);terminal.append(node('div',events.length?events.slice(-30).map(e=>`${e.occurredAt}  ${e.type}\n  ${e.incidentId}`).join('\n'):'$ waiting for engineering connection\n\nNo sessions dispatched.\nNo terminal output has been recorded.\n\nAgent logs will appear here when connected.'));}
  content.append(terminal);list(snapshot?.operations).forEach(o=>{if(!isDemo())content.append(record(o.harnessId,`Operation ${o.id} · ${o.incidentId}`,o.status))});
 }
 if(desk==='strategy'){
  if(isDemo())demo.ideas.forEach(([name,body])=>{const n=node('article',undefined,'sticky');n.append(node('h3',name),node('p',body),tag('Proposal · not approved'));content.append(n)});
  else {const decisions=list(snapshot?.ownerReport?.decisions);content.append(empty('Your strategy wall is ready. Customer feedback and feature proposals are not connected yet. Major investments, pivots and technology changes will come here for your decision.'));decisions.forEach(d=>content.append(record(d.summary??d.id,d.reason??'Owner decision requested',d.result)));}
 }
 if(desk==='qa'){
  const prototype=node('a','Explore the 3D QA prototype ↗','prototype-link');prototype.href='/qa-prototype';content.append(prototype);
  if(isDemo())demo.prs.forEach(pr=>{const n=record(pr.title,'Illustrative pipeline; not a real pull request.');const stages=node('div',undefined,'pipeline');['Schema','Build','Semantics','Release'].forEach((name,i)=>{const s=node('div',undefined,`stage ${pr.states[i]}`);s.append(node('b',pr.states[i]==='green'?'✓':pr.states[i]==='red'?'×':'•'),node('span',name),node('p',pr.labels[i]));stages.append(s)});n.append(stages);content.append(n)});
  else content.append(empty('No pull requests are on the production line. The checks below are catalogued capabilities, not recorded passes. Red means failed, amber means pending/held, green means passed. Unrun stages stay neutral.'));
  content.append(title('Protected check inventory'));
  list(snapshot?.project?.catalog?.entries).forEach(g=>{const d=node('details');d.append(node('summary',`${g.label} · ${human(g.executionStatus)}`),node('p',g.limitations,'facts'),node('pre',JSON.stringify({command:g.argv,prerequisites:g.prerequisites,independence:g.oracleIndependence,mapping:g.autonomyGateIds},null,2),'detail'));content.append(d)});
 }
 if(desk==='finance'){
  const e=snapshot?.ownerReport?.economics??{};const money=v=>v==null?'Not reported':`${v} ${e.currency??'(currency unknown)'}`;
  const box=node('div',undefined,'ledger');box.append(node('span',isDemo()?'ILLUSTRATIVE PERIOD EXPENSES':'REPORTED EXPENSES','eyebrow'),node('div',isDemo()?'€26.40':money(e.reportedSpend),'amount'));
  const dl=node('dl');const rows=isDemo()?[['Approved budget','€100.00'],['Reserved for tasks','€18.00'],['Uncommitted budget','€55.60'],['Tokens used','182,000 · illustrative'],['Burn rate','€3.30/hour · illustrative'],['Period','8 hours · illustrative']]:[['Approved budget',money(e.approvedBudget)],['Reserved for tasks',money(e.reserved)],['Available budget','Unknown'],['Token / credit usage','Not connected'],['Burn rate','Insufficient cost history'],['Reporting period','Not configured']];
  rows.forEach(([k,v])=>{const row=node('div');row.append(node('dt',k),node('dd',v));dl.append(row)});box.append(dl);content.append(box);
  if(isDemo()){content.append(title('Example cost attribution'));[['Engineering · repair','€19.20'],['QA · verification','€5.40'],['Strategy · scoping','€1.80']].forEach(([k,v])=>content.append(record(k,v)));}
  content.append(node('p','Budget increases require an owner decision. Reservations are not expenses. Provider-reported amounts, estimates and unknowns stay separate; no token-to-money conversion is assumed.','facts'));
 }
 if(desk==='briefing'){
  const project=snapshot?.project??{};content.append(record('Xarts Office',project.repositoryAvailable?`Checkout observed at ${project.head?.slice(0,10)}. ${project.revisionMatchesCatalog?'Catalog matches the audited commit.':'Catalog requires a new audit.'}`:'Checkout is not available to the local controller.'));
  content.append(record('Your operating mandate','Routine work stays within the agreed scope and budget. Larger spending, pivots, new technology and protected-gate changes require a versioned decision.',snapshot?.ownerReport?.mandate?.status??'not configured'));
  content.append(title('Implementation progress'));list(snapshot?.implementation?.milestones).forEach(m=>content.append(record(human(m.id),m.completedSlice??'No delivered slice recorded.',m.status)));
  const v=snapshot?.implementation?.verification??{};content.append(record('Recorded verification',`${v.testsPassed??'Unknown'} tests · typecheck ${v.typecheck??'unknown'}. This verifies Promoted, not Xarts candidates.`));
 }
 setText('desk-footer',isDemo()?'Demo mode is isolated to this browser. No tasks, decisions, budgets or provider calls are created.':'Live controller records · read-only · unknown data remains unknown. Closing this desk does not stop work.');
}
document.addEventListener('click',e=>{const target=e.target.closest('[data-station],[data-open]');if(target)openDesk(target.dataset.station??target.dataset.open,target)});
document.addEventListener('keydown',e=>{const target=e.target.closest('[data-station]');if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDesk(target.dataset.station,target)}});
$('close-desk').onclick=()=>$('desk').close();$('desk').addEventListener('click',e=>{if(e.target===$('desk')){const r=$('desk').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('desk').close()}});
$('desk').addEventListener('close',()=>{desk=null;opener?.focus?.()});
for(const m of ['live','demo'])$(`${m}-mode`).onclick=()=>{mode=m;renderOffice();if(desk)renderDesk()};
async function refresh(){const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),8000);try{const r=await fetch('/api/overview',{signal:abort.signal,cache:'no-store'});if(!r.ok)throw Error('Controller unavailable');const data=await r.json();if(!data.project||!data.implementation)throw Error('Incomplete snapshot');const changed=JSON.stringify({...snapshot,observedAt:null})!==JSON.stringify({...data,observedAt:null});snapshot=data;renderOffice();if(changed&&desk)renderDesk();setText('connection-status','Local office connected');$('connection-light').classList.add('ready');setText('observed',`Provider ${human(data.project.providerStatus)} · updated ${new Date(data.observedAt).toLocaleTimeString()}`);$('error-banner').hidden=true}catch{setText('connection-status',snapshot?'Office disconnected · last snapshot':'Controller unavailable');$('connection-light').classList.remove('ready');setText('error-banner',snapshot?'Showing the last received snapshot. Reconnecting…':'Waiting for the local controller. Reconnecting…');$('error-banner').hidden=false}finally{clearTimeout(timeout);setTimeout(refresh,5000)}}
renderOffice();refresh();
