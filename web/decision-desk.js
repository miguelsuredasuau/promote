const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const actions={approve_plan:'Planning commissioned',request_changes:'Changes requested',reject:'Declined'};
export function createDecisionDesk({onSaved}){
 let root,data,mode,selected,tab='pending',stamp='',busy=false,notice='';const drafts=new Map();
 const items=()=>data?.ownerReport?.decisions??[];
 function mount(container,snapshot,currentMode){root=container;stamp='';update(snapshot,currentMode);}
 function update(snapshot,currentMode){if(busy||root?.querySelector('textarea')===document.activeElement)return;data=snapshot;mode=currentMode;const next=JSON.stringify([data?.ownerReport?.decisions,data?.ownerReport?.decisionWork,mode]);if(next===stamp||busy)return;stamp=next;render();}
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
  if(!root)return;root.replaceChildren();root.className='decision-workspace';
  if(mode==='demo'){root.append(el('h3','Return to the live office to make decisions.'),el('p','Demo activity cannot approve real work.'));return;}
  const pending=items().filter(d=>!d.resolution),resolved=items().filter(d=>d.resolution),visible=tab==='pending'?pending:resolved;
  const rail=el('aside',undefined,'decision-tray');const head=el('div',undefined,'decision-count');head.append(el('strong',String(pending.length).padStart(2,'0')),el('span','awaiting your direction'));rail.append(head);
  const tabs=el('nav',undefined,'decision-tabs');tabs.setAttribute('aria-label','Decision trays');for(const [id,label,count]of[['pending','For you',pending.length],['resolved','Decided',resolved.length]]){const b=el('button',`${label} · ${count}`);b.setAttribute('aria-pressed',String(tab===id));b.onclick=()=>{tab=id;selected=null;render();};tabs.append(b);}rail.append(tabs);
  const queue=el('div',undefined,'decision-queue');let item=visible.find(d=>d.id===selected)??visible[0];selected=item?.id;
  visible.forEach((d,i)=>{const b=el('button',undefined,'decision-envelope');b.setAttribute('aria-pressed',String(d.id===selected));b.append(el('small',`${String(i+1).padStart(2,'0')} / ${d.category}`),el('strong',d.title),el('span',d.resolution?actions[d.resolution.action]:`${d.sources.length} evidence ${d.sources.length===1?'record':'records'} →`));b.onclick=()=>{selected=d.id;notice='';render();};queue.append(b);});
  if(!visible.length)queue.append(el('p',tab==='pending'?'Your tray is clear. New proposals will arrive here.':'Your decisions will be filed here.','decision-empty'));
  rail.append(queue);const rule=el('div',undefined,'decision-boundary');rule.append(el('b','Your authority, intact.'),el('p','Planning can be commissioned here. Paid engineering still needs an exact task and an ACU limit.'));rail.append(rule);
  const sheet=el('article',undefined,'decision-sheet');
  if(!item){sheet.append(el('span','THE OWNER’S DESK','decision-kicker'),el('h3','Room to think.'),el('p','No proposal in this tray. The office keeps collecting evidence; you make the next call when there is something concrete to review.'));}
  else{
   sheet.append(el('span',item.resolution?'FILED / '+actions[item.resolution.action]:'PROPOSAL / '+item.category.toUpperCase(),'decision-kicker'),el('h3',item.title));
   const recommendation=el('section',undefined,'decision-recommendation');recommendation.append(el('small','PROPOSED NEXT MOVE'),el('p',item.nextAction));sheet.append(recommendation);
   const facts=el('div',undefined,'decision-facts');for(const [label,value]of[['Evidence',`${item.sources.length} linked ${item.sources.length===1?'record':'records'}`],['Approval','Planning only'],['Paid calls','Not authorized']]){const f=el('div');f.append(el('small',label),el('strong',value));facts.append(f);}sheet.append(facts);
   const evidence=el('details',undefined,'decision-evidence');evidence.append(el('summary','Review source evidence'));for(const key of item.sources){const source=data?.inbox?.find(r=>r.sourceKey===key);evidence.append(el('p',source?.summary??key));}evidence.append(el('small','Priority comes from local triage rules. Implementation cost has not been estimated.'));sheet.append(evidence);
   if(item.resolution){
    sheet.append(el('p',item.resolution.feedback||'No additional direction attached.','decision-owner-note'));
    const work=data?.ownerReport?.decisionWork?.find(w=>w.id===item.resolution.workId);
    if(work){sheet.append(el('b',`Planning brief · ${work.state}`));if(work.result?.planningBrief){const steps=el('ol');work.result.planningBrief.steps.forEach(s=>steps.append(el('li',s)));sheet.append(steps);sheet.append(el('small','Prepared by local rules. Scope and cost need further investigation.'));}}
    sheet.append(el('small',`Recorded ${new Date(item.resolution.decidedAt).toLocaleString()}`,'decision-receipt'));
   }else{
    const label=el('label','Your direction (optional)','decision-feedback');const input=el('textarea');input.rows=2;input.maxLength=2000;input.placeholder='What should the team preserve, change or investigate?';input.value=drafts.get(item.id)??'';input.disabled=busy;input.oninput=()=>drafts.set(item.id,input.value);label.append(input);sheet.append(label);
    const buttons=el('div',undefined,'decision-actions');for(const [action,label]of[['approve_plan','Commission the brief →'],['request_changes','Request changes'],['reject','Decline']]){const b=el('button',label);b.dataset.decisionAction=action;b.disabled=busy;b.onclick=()=>decide(item,action);buttons.append(b);}sheet.append(buttons);
    sheet.append(el('p','Creates a planning task with the evidence above. No paid session, code change or release is authorized.','decision-consent'));
   }
  }
  const status=el('p',notice,'decision-notice');status.setAttribute('role','status');sheet.append(status);root.append(rail,sheet);
 }
 return{mount,update};
}
