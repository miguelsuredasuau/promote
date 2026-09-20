import { mountDecisionDemo } from '/decision-demo.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const actions={approve_plan:'Planning commissioned',request_changes:'Changes requested',reject:'Declined'};
export function createDecisionDesk({onSaved,pullRequests}){
 let root,data,mode,selected,tab='improvements',stamp='',busy=false,notice='';const drafts=new Map();
 const items=()=>(data?.ownerReport?.decisions??[]).filter(d=>d.ownerAttention||d.resolution);
 const routine=()=>data?.ownerReport?.routineWork?.tracked??0;
 function mount(container,snapshot,currentMode){root=container;data=snapshot;mode=currentMode;stamp=JSON.stringify([data?.ownerReport?.decisions,data?.ownerReport?.decisionWork,mode]);render();}
 function update(snapshot,currentMode){if(mode==='demo'&&currentMode==='demo')return;if(busy||root?.querySelector('textarea')===document.activeElement)return;data=snapshot;mode=currentMode;const next=JSON.stringify([data?.ownerReport?.decisions,data?.ownerReport?.decisionWork,mode]);if(next===stamp||busy)return;stamp=next;if(tab==='prs')return;render();}
 async function decide(item,action){
  const feedback=drafts.get(item.id)??'';
  if(action==='request_changes'&&!feedback.trim()){notice='Tell your CEO what should change first.';render();root.querySelector('textarea')?.focus();return;}
  busy=true;notice='Saving your decision…';render();
  try{
   const session=await fetch('/api/owner-session',{cache:'no-store'});if(!session.ok)throw Error('Owner session unavailable.');
   const {token}=await session.json();
   const response=await fetch('/api/owner-decisions',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':token},body:JSON.stringify({proposalId:item.id,revision:item.revision,action,feedback})});
   if(!response.ok){const error=await response.json();throw Error(error.error??'Could not save.');}
   notice=actions[action]+'. Saved in the office journal.';selected=null;drafts.delete(item.id);busy=false;await onSaved();
  }catch(error){notice=error.message;busy=false;}
  render();
 }
 function render(){
  if(!root)return;root.improvementView=null;root.replaceChildren();root.className='decision-workspace';
  if(mode==='live'&&tab==='improvements'){document.body.dataset.improvements='true';mountDecisionDemo(root,{onHistory:()=>{tab='pending';render();}});return;}
  if(mode==='demo'){root.append(el('p','Las propuestas reales de Xarts están en el escritorio en vivo.'));const link=el('a','Abrir propuestas de Xarts');link.href='/?improvements=xarts';root.append(link);return;}
  const pending=items().filter(d=>!d.resolution),resolved=items().filter(d=>d.resolution),visible=tab==='pending'?pending:resolved;
  const rail=el('aside',undefined,'decision-tray');const head=el('div',undefined,'decision-count');head.append(el('strong',String(pending.length).padStart(2,'0')),el('span','big decisions for you'));rail.append(head);
  const tabs=el('nav',undefined,'decision-tabs');tabs.setAttribute('aria-label','Decision trays');for(const [id,label,count]of[['improvements','Xarts',null],['pending','For you',pending.length],['resolved','Decided',resolved.length],...(pullRequests?[['prs','Pull requests',null]]:[])]){const b=el('button',count===null?label:`${label} · ${count}`);b.setAttribute('aria-pressed',String(tab===id));b.onclick=()=>{tab=id;selected=null;render();};tabs.append(b);}rail.append(tabs);
  if(tab==='prs'){rail.append(el('p','Open pull requests on the repositories Promote governs. Each merges as you, once QA is green.','decision-empty'));const rule=el('div',undefined,'decision-boundary');rule.append(el('b','Your authority, intact.'),el('p','Nothing merges red. Conflicts are resolved in an isolated clone; overlapping source changes wait for you.'));rail.append(rule);const sheet=el('article',undefined,'decision-sheet');pullRequests.mount(sheet);root.append(rail,sheet);return;}
  const queue=el('div',undefined,'decision-queue');let item=visible.find(d=>d.id===selected)??visible[0];selected=item?.id;
  visible.forEach((d,i)=>{const b=el('button',undefined,'decision-envelope');b.setAttribute('aria-pressed',String(d.id===selected));b.append(el('small',`Decision ${String(i+1).padStart(2,'0')}`),el('strong',d.brief?.title??d.title),el('span',d.resolution?actions[d.resolution.action]:'Your direction matters →'));b.onclick=()=>{selected=d.id;notice='';render();};queue.append(b);});
  if(!visible.length)queue.append(el('p',tab==='pending'?'Nothing needs your direction right now.':'Your decisions will be filed here.','decision-empty'));
  rail.append(queue);const rule=el('div',undefined,'decision-boundary');rule.append(el('b',`${routine()} routine items tracked`),el('p','The team investigates bugs, feedback and small improvements without asking you to commission each brief.'));rail.append(rule);
  const sheet=el('article',undefined,'decision-sheet');
  if(!item){sheet.append(el('span','Your direction, when it matters','decision-kicker'),el('h3','You have room to build.'),el('p','No big decision needs you right now. Routine investigation and planning stay with the team.','decision-intro'));
    const flow=el('div',undefined,'decision-autonomy');for(const [title,detail]of[['Listen','Collect feedback and failures'],['Investigate','Prepare the next useful step'],['Deliver','Build and publish within the agreed scope']]){const step=el('div');step.append(el('strong',title),el('span',detail));flow.append(step);}sheet.append(flow);
    const note=el('p',`${routine()} routine items are tracked. Investigations run automatically. Building and publishing follow the agreed permissions and budget.`,'decision-owner-note');sheet.append(note);const link=el('a','See what the team is doing →');link.href='/activity';sheet.append(link);}
  else{
   sheet.append(el('span',item.resolution?'Your decision · '+actions[item.resolution.action]:'A choice about the product','decision-kicker'),el('h3',item.brief?.title??item.title));
   const brief=item.brief; if(brief){sheet.append(el('p',brief.why,'decision-intro'));const comparison=el('figure',undefined,'decision-comparison');comparison.setAttribute('aria-label','Options for this decision');for(const [label,copy] of [['Today',brief.current],['Explore',brief.proposed]]){const option=el('div');option.append(el('small',label),el('p',copy));comparison.append(option);}sheet.append(comparison);}
   const recommendation=el('section',undefined,'decision-recommendation');recommendation.append(el('small','Our recommendation'),el('p',brief?.recommendation??item.nextAction));sheet.append(recommendation);
   const evidence=el('details',undefined,'decision-evidence');evidence.append(el('summary','Evidence and technical detail'));for(const key of item.sources){const source=data?.inbox?.find(r=>r.sourceKey===key);evidence.append(el('p',source?.summary??key));}evidence.append(el('p',item.nextAction),el('small','Prepared from local triage rules. Implementation effort and cost are not estimated yet.'));sheet.append(evidence);
   if(item.resolution){
    sheet.append(el('p',item.resolution.feedback||'No additional direction attached.','decision-owner-note'));
    const work=data?.ownerReport?.decisionWork?.find(w=>w.id===item.resolution.workId);
    if(work){sheet.append(el('b',`Planning brief · ${work.state}`));if(work.result?.planningBrief){const steps=el('ol');work.result.planningBrief.steps.forEach(s=>steps.append(el('li',s)));sheet.append(steps);sheet.append(el('small','Prepared by local rules. Scope and cost need further investigation.'));}}
    sheet.append(el('small',`Recorded ${new Date(item.resolution.decidedAt).toLocaleString()}`,'decision-receipt'));
   }else{
    const label=el('label','Your direction (optional)','decision-feedback');const input=el('textarea');input.rows=2;input.maxLength=2000;input.placeholder='What should the team preserve, change or investigate?';input.value=drafts.get(item.id)??'';input.disabled=busy;input.oninput=()=>drafts.set(item.id,input.value);label.append(input);sheet.append(label);
    const buttons=el('div',undefined,'decision-actions');for(const [action,label]of[['approve_plan','Explore this direction →'],['request_changes','Adjust the direction'],['reject','Keep our current focus']]){const b=el('button',label);b.dataset.decisionAction=action;b.disabled=busy;b.onclick=()=>decide(item,action);buttons.append(b);}sheet.append(buttons);
    sheet.append(el('p',brief?.consequence??'The team will prepare a comparison before implementation.','decision-consent'));
   }
  }
  const status=el('p',notice,'decision-notice');status.setAttribute('role','status');sheet.append(status);root.append(rail,sheet);
 }
 return{mount,update};
}
