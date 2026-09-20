export {decisionDemos,decisionDemoProject} from '../contracts/decision-definitions.mjs';
export const calmMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
// Animate a disclosure without inventing state: the summary still owns open/closed.
export function disclose(details){
 const body=document.createElement('div');body.className='disclosure-body';body.append(...[...details.childNodes].filter(n=>n.nodeName!=='SUMMARY'));details.append(body);
 details.addEventListener('click',e=>{if(!e.target.closest?.('summary')||calmMotion())return;e.preventDefault();const open=details.open;if(!open)details.open=true;
  body.style.height=(open?body.scrollHeight:0)+'px';body.getBoundingClientRect();body.style.height=(open?0:body.scrollHeight)+'px';
  body.addEventListener('transitionend',()=>{body.style.height='';if(open)details.open=false;},{once:true});});
 return details;
}
// Accent driven only by recorded execution state; never by a timer.
const liveState=x=>x.releaseId?'released':x.status==='blocked'?'blocked':x.status==='running'?'running':x.candidateSha?'candidate':'';
export function mountDecisionDemo(root,{onHistory}={}){
 const viewToken={};root.improvementView=viewToken;let last='',selected,items=[],notice='',busy=false,entered=false,shown='';const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 async function refresh(){try{const r=await fetch('/api/improvements',{cache:'no-store'});if(!r.ok)throw Error('Could not read the real proposals.');const data=await r.json();if(data.projectId!=='xarts')throw Error('Wrong project');items=data.items;const next=JSON.stringify(items);if(next!==last){last=next;render();}}catch(e){notice=e.message;render();}}
 async function act(d,execute){busy=true;root.improvementsBusy=true;notice=execute?'Sending the authorized task to Devin…':'Saving the planning commission…';render();try{
  const session=await fetch('/api/owner-session',{cache:'no-store'});if(!session.ok)throw Error('Owner session unavailable');const {token}=await session.json();
  const body=execute?{proposalId:d.proposalId,revision:d.revision,taskHash:d.execution.taskHash}:{proposalId:d.proposalId,revision:d.revision,action:'approve_plan',feedback:''};
  const response=await fetch(execute?'/api/improvements/execute':'/api/owner-decisions',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':token},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error??'Could not record the action');
  notice=execute?(result.kind==='created'?'Devin has received the task. Delivery is still pending QA.':'Check the recorded status of the execution.'):'Planning commissioned and saved. This does not yet authorize execution or delivery.';
 }catch(e){notice=e.message;}finally{busy=false;root.improvementsBusy=false;last='';await refresh();}}
 function render(){root.replaceChildren();root.className='decision-workspace decision-demo';
 const rail=el('aside',undefined,'decision-tray');rail.append(el('span','ANALYZED PROJECT · XARTS','decision-kicker'),el('h3','Improvements for your library.','demo-heading'),el('p','Real proposals with evidence and recorded actions.','decision-empty'));
 const queue=el('nav',undefined,'decision-queue');queue.setAttribute('aria-label','Xarts improvements');
 const d=items.find(d=>d.proposalId===selected)??items[0];selected=d?.proposalId;
 const first=!entered&&items.length>0;entered=entered||items.length>0;
 items.forEach((item,i)=>{const b=el('button',undefined,'decision-envelope');b.setAttribute('aria-pressed',String(item.proposalId===selected));const live=liveState(item.execution);if(live)b.dataset.live=live;if(first){b.dataset.enter='';b.style.setProperty('--enter',String(i));}const image=el('img');image.src=`/assets/decisions/${item.id}.png`;image.alt='';b.append(image,el('small',`0${i+1} / Xarts`),el('strong',item.title));b.onclick=()=>{selected=item.proposalId;notice='';render();};queue.append(b);});rail.append(queue,el('p','The actions are genuinely recorded. The images illustrate the proposed improvement; they are not evidence that it shipped.','decision-consent'));
 if(onHistory){const history=el('button','History and pull requests');history.onclick=onHistory;rail.append(history);}
 const sheet=el('article',undefined,'decision-sheet');if(d){const live=liveState(d.execution);if(live)sheet.dataset.live=live;if(shown!==selected){shown=selected;sheet.dataset.enter='';}
 sheet.append(el('span','XARTS / PROPOSED IMPROVEMENT','decision-kicker'),el('h3',d.title));const figure=el('figure',undefined,'demo-infographic'),a=el('a');a.href=`/assets/decisions/${d.id}.png`;a.target='_blank';a.rel='noopener';const image=el('img');image.src=a.href;image.alt=`Proposal: ${d.steps.join(' → ')}`;a.append(image);figure.append(a);const caption=el('figcaption');d.steps.forEach((step,i)=>caption.append(el('span',`0${i+1} ${step}`)));figure.append(caption);sheet.append(figure,el('h4',d.question),el('p',d.why,'decision-intro'));
 const rec=el('section',undefined,'decision-recommendation');rec.append(el('small','RECOMMENDATION'),el('p',d.recommendation));sheet.append(rec);
 const detail=el('details',undefined,'decision-evidence');detail.append(el('summary','Evidence, alternative and acceptance test'),el('p',d.evidence),el('p',d.validation),el('p',`Alternative: ${d.alternative}`),el('p',d.boundary),el('small',`Proposal ${d.proposalId} · revision ${d.revision.slice(0,12)}`));sheet.append(disclose(detail));
 sheet.append(el('p',d.execution.reason,'decision-owner-note'));if(d.execution.scope)sheet.append(el('p','First scoped delivery: fix the currency sign in the waterfall while preserving the data. Configurable precision is outside this repair.','decision-consent'));
 if(d.execution.remoteId)sheet.append(el('p',`Agent: ${d.execution.remoteId} · Reported usage: ${d.execution.usageAcu??'pending'} ACU`));
 if(d.execution.candidateSha)sheet.append(el('p',`Candidate: ${d.execution.candidateSha.slice(0,12)}. This does not imply delivery.`));
 const buttons=el('div',undefined,'decision-actions');const plan=el('button',d.resolution?'Planning decision recorded':'Commission planning');plan.disabled=busy||!!d.resolution||!!d.execution.remoteId;plan.onclick=()=>act(d,false);buttons.append(plan);
 const run=el('button',d.execution.releaseId?'First repair published':d.execution.status==='blocked'?'Delivery blocked':d.execution.candidateSha?'Candidate in verification':d.execution.remoteId?'Repair sent to Devin':d.execution.maxAcu?`Run repair · maximum ${d.execution.maxAcu} ACU`:'Execution pending scope');run.disabled=busy||!d.execution.canExecute;run.onclick=()=>act(d,true);buttons.append(run);sheet.append(buttons);
 if(d.execution.releaseId){const chat=el('a','Open Xarts Chat with the active version →');chat.href='http://127.0.0.1:4320/'+(d.execution.replay?.status==='confirmed'?'?run='+encodeURIComponent(d.execution.replay.runId):'');chat.target='_blank';chat.rel='noopener';sheet.append(chat,el('p',`Published version: ${d.execution.releaseId}`));if(d.execution.replay?.status==='confirmed'){const before=el('a','See the original chart →');before.href='http://127.0.0.1:4320/?run='+encodeURIComponent(d.execution.replay.sourceRunId);before.target='_blank';before.rel='noopener';sheet.append(before,el('p','Replay confirmed. It keeps the abbreviated-label warnings that this repair does not cover.','decision-consent'));}}
 const activity=el('a','See real activity →');activity.href='/activity';sheet.append(activity);
 }else sheet.append(el('p','No Xarts proposals are recorded. Examples are not shown as if they were real work.'));
 const status=el('p',notice,'decision-notice');status.setAttribute('role','status');sheet.append(status);const reload=el('button','Refresh status');reload.disabled=busy;reload.onclick=refresh;sheet.append(reload);root.append(rail,sheet);
 }render();void refresh();const poll=()=>setTimeout(async()=>{if(!root.isConnected||root.improvementView!==viewToken)return;if(!busy)await refresh();poll();},5000);poll();
}
