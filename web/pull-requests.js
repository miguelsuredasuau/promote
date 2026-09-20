const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const qaLabel={passed:'QA passed',failed:'QA failed',pending:'QA running',none:'No checks'};
const mergeLabel={clean:'Up to date',conflicts:'Conflicts',unknown:'Computing…',blocked:'Blocked'};
export function createPullRequestDesk(){
 let root,data,busy=null,notice='',loading=false;
 async function load(){
  loading=true;render();
  try{const r=await fetch('/api/pull-requests',{cache:'no-store'});if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error??'Pull requests unavailable.');}data=await r.json();}
  catch(error){notice=error.message;}
  loading=false;render();
 }
 function mount(container){root=container;notice='';load();}
 async function merge(item){
  busy=`${item.repo}#${item.number}`;notice=item.mergeable==='conflicts'?'Resolving conflicts in an isolated clone…':'Merging…';render();
  try{
   const session=await fetch('/api/owner-session',{cache:'no-store'});if(!session.ok)throw Error('Owner session unavailable.');
   const {token}=await session.json();
   const response=await fetch('/api/pull-requests/merge',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':token},body:JSON.stringify({repo:item.repo,number:item.number,headSha:item.headSha})});
   const outcome=await response.json();
   if(!response.ok)throw Error(outcome.error??'Merge failed.');
   notice=outcome.state==='merged'?`${busy} merged (${outcome.sha.slice(0,7)}).`
    :outcome.state==='conflicts_resolved'?`${busy}: ${outcome.detail}${outcome.regenerated.length?` Took ${item.base}'s version of: ${outcome.regenerated.join(', ')}.`:''}`
    :outcome.state==='conflicts_need_owner'?`${busy} needs you: ${outcome.detail} ${outcome.files.join(', ')}`
    :`${busy} not merged: ${outcome.detail}`;
  }catch(error){notice=error.message;}
  busy=null;await load();
 }
 function render(){
  if(!root)return;root.replaceChildren();root.className='pr-desk';
  root.append(el('span','PULL REQUESTS / MERGE TO MAIN','decision-kicker'));
  if(!data&&loading){root.append(el('p','Asking GitHub…','decision-empty'));return;}
  if(data&&!data.configured){root.append(el('p','Add PROMOTE_GITHUB_TOKEN (a token that acts as you) and PROMOTE_MERGE_REPOS (owner/repo, comma-separated) to Promote’s .env to merge from the office.','decision-empty'));return;}
  const items=data?.items??[];
  if(data&&!items.length)root.append(el('p','No open pull requests in '+data.repos.join(', ')+'.','decision-empty'));
  const list=el('ul',undefined,'pr-list');
  for(const item of items){
   const key=`${item.repo}#${item.number}`;const li=el('li',undefined,'pr-item');
   const head=el('div',undefined,'pr-head');const link=el('a',`${key} · ${item.title}`);link.href=item.url;link.target='_blank';link.rel='noreferrer';head.append(link);li.append(head);
   const facts=el('div',undefined,'pr-facts');facts.append(el('span',`${item.head} → ${item.base}`),el('span',qaLabel[item.qa],`pr-qa pr-qa-${item.qa}`),el('span',mergeLabel[item.mergeable],`pr-merge pr-merge-${item.mergeable}`));li.append(facts);
   if(item.checks.length){const checks=el('details');checks.append(el('summary',`${item.checks.length} check${item.checks.length===1?'':'s'}`));for(const c of item.checks){const p=el('p',`${c.name}: ${c.state}`);if(c.url){const a=el('a','↗');a.href=c.url;a.target='_blank';a.rel='noreferrer';p.append(' ',a);}checks.append(p);}li.append(checks);}
   li.append(el('small',item.reason));
   const b=el('button',item.mergeable==='conflicts'?'Resolve conflicts & merge →':'Merge →');b.dataset.pr=key;b.disabled=!item.canMerge||busy!==null;b.onclick=()=>merge(item);li.append(b);
   list.append(li);
  }
  root.append(list);
  const refresh=el('button',loading?'Refreshing…':'Refresh');refresh.disabled=loading||busy!==null;refresh.onclick=load;root.append(refresh);
  root.append(el('p','Merges run as the configured GitHub token, only after QA passes on the exact head commit. Clerical conflicts (lockfiles, snapshots, goldens, generated schemas) take the base’s version and are pushed to the branch for QA to regenerate; other conflicts are left for you.','decision-consent'));
  const status=el('p',notice,'decision-notice');status.setAttribute('role','status');root.append(status);
 }
 return{mount};
}
