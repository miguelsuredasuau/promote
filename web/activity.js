import {operationsStory,eventCopy,reasonText,words} from './operations-model.js';
const $=id=>document.getElementById(id);let cursor=0,events=[],lastStory='',lastEventKey='',lastInbox='',eventLimit=25;
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;return el;};
const status=text=>node('span',text,'status'+(['Needs attention','Blocked'].includes(text)?' attention':text==='Working'?' working':''));
function renderEvents(){
 const filter=$('filter').value,key=filter+':'+eventLimit+':'+events.at(-1)?.sequence;if(key===lastEventKey)return;lastEventKey=key;
 const visible=events.filter(e=>filter==='all'||(filter==='decisions'?!['chat_progress','intake'].includes(e.category)&&!['Work assigned','Role started work','Feedback analyst triaged record','Role completed work'].includes(e.summary):e.category===filter));
 const open=new Set([...$('events').querySelectorAll('details[open]')].map(d=>d.dataset.event));
 $('more-events').hidden=visible.length<=eventLimit;
 $('empty').hidden=visible.length>0;$('events').replaceChildren();
 for(const event of visible.slice(-eventLimit).reverse()){
  const copy=eventCopy(event),li=node('li'),time=node('time',new Date(event.at).toLocaleString());time.dateTime=event.at;
  const body=node('div');body.append(node('span',words(event.category),'category'),node('span',copy.title,'event-title'));
  if(copy.detail)body.append(node('p',copy.detail,'event-detail'));
  if(Object.keys(event.details).length){const details=node('details');details.dataset.event=String(event.sequence);details.open=open.has(String(event.sequence));details.append(node('summary','Evidence & technical details'),node('pre',JSON.stringify(event.details,null,2)));body.append(details);}
  li.append(time,body);if(event.category==='error')li.classList.add('error');$('events').append(li);
 }
}
$('filter').onchange=()=>{eventLimit=25;renderEvents();};
$('more-events').onclick=()=>{eventLimit+=25;renderEvents();};
function renderStory(s){
 const story=operationsStory(s),key=JSON.stringify(story);if(key===lastStory)return;lastStory=key;
 $('objective').textContent=story.objective;$('headline').textContent=story.heading;$('current-detail').textContent=story.detail;
 $('next-title').textContent=story.blockedCount?'Resolve the blocker':story.activeCount?'Let engineering finish':'Review the next assignment';$('next-detail').textContent=story.next;
 $('pipeline').replaceChildren(...story.stages.map(stage=>{const li=node('li',stage.label);li.dataset.state=stage.state;li.setAttribute('aria-label',`${stage.label}: ${stage.state}`);return li;}));
 $('agents').replaceChildren(...story.agents.map(agent=>{const article=node('article',undefined,'agent');article.append(status(agent.status),node('div',agent.name,'agent-name'),node('div',agent.location,'agent-location'),node('p',agent.detail),node('div',agent.mode,'agent-mode'));return article;}));
 const queue=$('queue');queue.replaceChildren();
 const blocked=story.work.filter(w=>w.state==='blocked');
 for(const item of blocked){const row=node('article',undefined,'queue-item');row.append(status('Blocked'),node('span',item.role==='qa'?'Independent QA':'Orchestrator','queue-meta'),node('h3',reasonText(item.result?.reason)),node('p',item.result?.nextAction??'Review the recorded evidence before continuing.'));const details=node('details');details.append(node('summary','Inspect evidence'),node('pre',JSON.stringify(item.result,null,2)));row.append(details);queue.append(row);}
 const proposals=story.proposals.slice().sort((a,b)=>b.priority-a.priority);
 for(const proposal of proposals.slice(0,8)){const row=node('article',undefined,'queue-item');row.append(node('span',words(proposal.category)+' proposal','status'),node('span',`${proposal.sources.length} source records · priority ${proposal.priority}`,'queue-meta'),node('h3',proposal.title),node('p',proposal.nextAction));queue.append(row);}
 if(proposals.length>8)queue.append(node('p',`${proposals.length-8} more proposals are retained in the queue. Full evidence is available in the JSON log.`,'fine'));
 if(!blocked.length&&!proposals.length)queue.append(node('p','No assessed proposals yet. The orchestrator will review incoming records on its next cycle.','fine'));
}
async function refresh(){
 if($('pause').checked){$('connection').textContent='Updates paused · showing the last recorded state';setTimeout(refresh,2000);return;}
 try{
  const response=await fetch(`/api/activity?after=${cursor}`,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();
  const data=await response.json();events.push(...data.events);events=events.slice(-1000);cursor=data.nextCursor;
  const s=data.service,spend=s.engineeringSpend;renderStory(s);renderEvents();
  $('summary').replaceChildren();
  const active=(spend?.sessions??[]).filter(r=>r.state==='running').length;
  const pairs=[['Chat intake',s.intake.status==='watching'?'Receiving normally':words(s.intake.status)],['Received records',s.receivedRecords],['Progress events',s.progressEvents],['Active AI agents',active],['Reported usage',spend?.reportedUsage==null?'Not reported':`${spend.reportedUsage} ACUs`],['Reserved ceiling',`${spend?.committedCeilings??0} ACUs`],['Estimated cost',spend?.estimatedDollarCost==null?'Not available':'$'+spend.estimatedDollarCost.toFixed(2)]];
  for(const [label,value] of pairs){const box=node('article');box.append(node('small',label),node('strong',value));$('summary').append(box);}
  $('connection').textContent=`Live · checked ${new Date(s.observedAt).toLocaleTimeString()}`;
  $('explanation').textContent=s.provider.explanation??s.explanation;
  const heartbeat=s.orchestrator;
  if(heartbeat){const overdue=Date.now()>Date.parse(heartbeat.nextCheckAt)+60000;$('heartbeat-status').textContent=`${overdue?'Review overdue':'Review every 10 minutes'} · last ${new Date(heartbeat.checkedAt).toLocaleTimeString()} · next ${new Date(heartbeat.nextCheckAt).toLocaleTimeString()}`;$('heartbeat-actions').replaceChildren(...heartbeat.actions.map(a=>node('li',a.summary)));}
  const inbox=await fetch('/api/inbox',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());const inboxKey=JSON.stringify(inbox.items);
  if(inboxKey!==lastInbox){lastInbox=inboxKey;$('inbox').replaceChildren();for(const item of inbox.items){const row=node('div',undefined,'inbox-item');row.append(node('strong',`${words(item.kind)} · ${words(item.outcome)}`),node('p',item.summary||item.runId||item.sourceKey),node('small',`${words(item.disposition)} · ${new Date(item.receivedAt).toLocaleString()}`));$('inbox').append(row);}}
  setTimeout(refresh,data.events.length===100?50:2000);
 }catch{$('connection').textContent='Connection interrupted · showing the last recorded state';setTimeout(refresh,2000);}
}
refresh();
