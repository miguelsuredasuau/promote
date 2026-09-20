import {maintenanceProgress,maintenanceAttempts,operatingDispatchStatus} from '/office-runtime.js';
const $=id=>document.getElementById(id);
const numbers=['totalAcu','dailyAcu','sessionAcu','reviewMinutes','testEveryMinutes','testMinutes','maxConcurrentSessions'];
const toggles=['paused','approvedRepairs','proactiveTests'];
let snapshot=null,maintenanceSnapshot=null,visibleTasks=24;
function saveLabel(){ $('save').textContent=$('paused').checked?'Save paused settings':'Authorize operation within these limits'; }
function show(data){
 snapshot=data;const p=data.policy;
 for(const key of numbers)$(key).value=String(p[key]??(key==='maxConcurrentSessions'?1:0));
 for(const key of toggles)$(key).checked=p[key];
 const expiry=new Date(p.expiresAt);$('expiresAt').value=new Date(expiry.getTime()-expiry.getTimezoneOffset()*60000).toISOString().slice(0,16);
 $('testRepository').value=p.testRepository??'';$('testFocus').value=p.testFocus;
 showStatus(data);
 $('fields').disabled=false;saveLabel();
}
function showStatus(data){
 const p=data.policy;
 $('state').textContent=operatingDispatchStatus(data);$('state').dataset.paused=String($('state').textContent!=='Authorized');
 $('total-remaining').textContent=data.budget.totalRemainingAcu==null?'Not set':String(data.budget.totalRemainingAcu);
 $('committed').textContent=String(data.budget.committedAcu);$('remaining').textContent=data.budget.remainingAcu==null?'Not set':String(data.budget.remainingAcu);
 $('accounting').textContent=`${data.budget.accounting}. ACU is not billed currency; provider costs may remain unknown.`;
 const reconciliation=data.budget.reconciliation;
 $('reconciliation').textContent=reconciliation?`Campaign committed ceiling: ${data.budget.totalCommittedAcu} ACU · Provider-reported consumption: ${reconciliation.knownReportedUsageAcu} ACU${reconciliation.unknownUsageSessions?' · '+reconciliation.unknownUsageSessions+' sessions with unknown usage':''} · Terminal ceiling retained: ${reconciliation.retainedTerminalAcu} ACU. Provider usage is not settled; retained limits are not available for new dispatches.`:'Provider consumption and retained terminal ceilings are not reported by this controller.';
 $('revision').textContent=`Revision ${data.revision}${data.updatedAt?' · Saved '+new Date(data.updatedAt).toLocaleString():' · Defaults only; nothing authorized'}`;
 const runtime=data.runtime??{};const sessions=[...(runtime.engineering??[]),...(runtime.explorations??[])];const active=sessions.filter(s=>s.state==='running');$('active').textContent=String(active.length);const heartbeat=runtime.heartbeat;$('last-review').textContent=heartbeat?.checkedAt?new Date(heartbeat.checkedAt).toLocaleString():'Not recorded';$('next-review').textContent=heartbeat?.nextCheckAt?new Date(heartbeat.nextCheckAt).toLocaleString():p.paused?'Paused':'Not reported';$('runtime-note').textContent=`Provider: ${runtime.provider?.status??'not reported'} · ${active.length} recorded running sessions. Activity and limits refresh every 10 seconds.`;
 const list=$('session-list');list.replaceChildren();
 for(const item of sessions.filter(s=>s.remoteId)){const row=document.createElement('article');row.className='session-row';const link=document.createElement('a');const id=item.remoteId.replace(/^devin-/,'');if(!/^[a-zA-Z0-9_-]+$/.test(id))continue;link.href='https://app.devin.ai/sessions/'+id;link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.remoteId+' ↗';const state=document.createElement('span');state.textContent=item.state+(item.observedAt?' · observed '+new Date(item.observedAt).toLocaleTimeString():'');row.append(link,state);if(item.reason){const reason=document.createElement('small');reason.textContent=item.reason;row.append(reason);}list.append(row);}
}
function showMaintenance(data){
 maintenanceSnapshot=data;const list=$('verification-list');list.replaceChildren();
 const jobs=maintenanceAttempts(Array.isArray(data.jobs)?data.jobs:[]);
 const latest=jobs.filter(job=>!job.supersededBy);const queuedProfiles=Array.isArray(data.profiles)?data.profiles.filter(profile=>!jobs.some(job=>job.profileId===profile.id)).length:'Unknown number of';
 $('verification-status').textContent=`${jobs.length} recorded attempts · ${latest.filter(job=>['running','verifying','awaiting_verification'].includes(job.state)).length} active or checking · ${latest.filter(job=>job.state==='verified').length} verified · ${latest.filter(job=>['retryable','blocked'].includes(job.state)).length} need attention · ${queuedProfiles} approved profiles awaiting their first task. Refreshed ${new Date().toLocaleTimeString()}.`;
 $('more-verifications').hidden=visibleTasks>=jobs.length; $('more-verifications').textContent=`Show more attempts (${Math.max(0,jobs.length-visibleTasks)} remaining)`;
 const priority={verifying:0,awaiting_verification:1,running:2,retryable:3,blocked:4,held:5,planned:6,verified:7};
 for(const job of [...jobs].sort((a,b)=>Number(Boolean(a.supersededBy))-Number(Boolean(b.supersededBy))||(priority[a.state]??8)-(priority[b.state]??8)||String(b.updatedAt??'').localeCompare(String(a.updatedAt??''))).slice(0,visibleTasks)){
  const progress=maintenanceProgress(job);const card=document.createElement('article');card.className='verification-card';card.dataset.state=job.state;
  const title=document.createElement('h3');title.textContent=job.title??job.id;
  const stage=document.createElement('strong');stage.className='verification-stage';stage.textContent=(job.supersededBy?'Historical attempt · ':['verified','retryable','blocked'].includes(job.state)?'Recorded result · ':'Current · ')+progress.label;
  const meta=document.createElement('p');meta.className='hint';meta.textContent=`Attempt ${job.attempt??'—'}${job.maxAttempts?' of '+job.maxAttempts:''}${job.candidateSha?' · Candidate '+job.candidateSha.slice(0,12):''}${job.progress?.updatedAt?' · '+new Date(job.progress.updatedAt).toLocaleTimeString():''}`;
  const next=document.createElement('p');next.className='verification-next';next.textContent='Next: '+progress.next;
  card.append(title,stage,meta,next);
  if(job.reason){const reason=document.createElement('p');reason.className='verification-reason';reason.textContent=job.reason;card.append(reason);}
  const id=job.remoteId?.replace(/^devin-/,'');if(id&&/^[a-zA-Z0-9_-]+$/.test(id)){const link=document.createElement('a');link.href='https://app.devin.ai/sessions/'+id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Inspect Devin session ↗';card.append(link);}
  list.append(card);
 }
}
async function loadMaintenance(){
 try{showMaintenance(await responseJson(await fetch('/api/maintenance',{cache:'no-store',signal:AbortSignal.timeout(8000)})));}
 catch{$('verification-status').textContent='Verification status unavailable. Last recorded tasks retained.';}
}
async function responseJson(response){const value=await response.json();if(!response.ok)throw Error(value.error??'Settings unavailable');return value;}
async function load(){ void loadMaintenance();$('fields').disabled=true;try{show(await responseJson(await fetch('/api/operating-policy',{cache:'no-store'})));$('message').textContent='';}catch(error){$('message').textContent=error.message;} }
$('paused').addEventListener('change',saveLabel);
$('reload').addEventListener('click',load);
$('more-verifications').addEventListener('click',()=>{visibleTasks+=24;if(maintenanceSnapshot)showMaintenance(maintenanceSnapshot);});
$('policy-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!snapshot)return;
 const policy={...snapshot.policy};for(const key of numbers)policy[key]=Number($(key).value);for(const key of toggles)policy[key]=$(key).checked;
 policy.expiresAt=new Date($('expiresAt').value).toISOString();policy.testRepository=$('testRepository').value.trim()||null;policy.testFocus=$('testFocus').value.trim();
 $('fields').disabled=true;$('message').textContent='Saving your mandate…';
 try{const session=await responseJson(await fetch('/api/owner-session',{cache:'no-store'}));const data=await responseJson(await fetch('/api/operating-policy',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':session.token},body:JSON.stringify({revision:snapshot.revision,policy})}));show(data);$('message').textContent=policy.paused?'Saved. New paid dispatches are paused.':'Saved. Eligible work may run within these limits; task and release gates still apply.';}
 catch(error){$('fields').disabled=false;$('message').textContent=error.message;}
});
load();

let polling=false;
setInterval(async()=>{
 if(polling||document.hidden)return;polling=true;void loadMaintenance();
 try{
  const current=await responseJson(await fetch('/api/operating-policy',{cache:'no-store',signal:AbortSignal.timeout(8000)}));
  showStatus(current);
  if(snapshot&&current.revision!==snapshot.revision)$('message').textContent='Saved settings changed elsewhere. Reload before saving your edits.';
 }catch{ $('runtime-note').textContent='Live status unavailable. Last recorded values retained; reload to reconnect.'; }
 finally{polling=false;}
},10000);
