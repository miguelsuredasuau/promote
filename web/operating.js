const $=id=>document.getElementById(id);
const numbers=['totalAcu','dailyAcu','sessionAcu','reviewMinutes','testEveryMinutes','testMinutes','maxConcurrentSessions'];
const toggles=['paused','approvedRepairs','proactiveTests'];
let snapshot=null;
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
 const expired=Date.parse(p.expiresAt)<=Date.now();$('state').textContent=!data.configured?'Not configured':p.paused?'Paused':expired?'Expired':'Authorized';$('state').dataset.paused=String(p.paused||expired||!data.configured);
 $('total-remaining').textContent=data.budget.totalRemainingAcu==null?'Not set':String(data.budget.totalRemainingAcu);
 $('committed').textContent=String(data.budget.committedAcu);$('remaining').textContent=data.budget.remainingAcu==null?'Not set':String(data.budget.remainingAcu);
 $('accounting').textContent=`${data.budget.accounting}. ACU is not billed currency; provider costs may remain unknown.`;
 $('revision').textContent=`Revision ${data.revision}${data.updatedAt?' · Saved '+new Date(data.updatedAt).toLocaleString():' · Defaults only; nothing authorized'}`;
 const runtime=data.runtime??{};const sessions=[...(runtime.engineering??[]),...(runtime.explorations??[])];const active=sessions.filter(s=>s.state==='running');$('active').textContent=String(active.length);if(active.length&&!p.paused&&!expired)$('state').textContent='Running';else if(data.configured&&!p.paused&&!expired&&runtime.provider?.paidDispatchEnabled===false)$('state').textContent='Blocked';const heartbeat=runtime.heartbeat;$('last-review').textContent=heartbeat?.checkedAt?new Date(heartbeat.checkedAt).toLocaleString():'Not recorded';$('next-review').textContent=heartbeat?.nextCheckAt?new Date(heartbeat.nextCheckAt).toLocaleString():p.paused?'Paused':'Not reported';$('runtime-note').textContent=`Provider: ${runtime.provider?.status??'not reported'}. ${active.length?'Recorded running sessions: '+active.map(s=>s.remoteId??s.id).join(', '):'No running sessions recorded.'} See the activity journal for dispatches, refusals and evidence.`;
}
async function responseJson(response){const value=await response.json();if(!response.ok)throw Error(value.error??'Settings unavailable');return value;}
async function load(){ $('fields').disabled=true;try{show(await responseJson(await fetch('/api/operating-policy',{cache:'no-store'})));$('message').textContent='';}catch(error){$('message').textContent=error.message;} }
$('paused').addEventListener('change',saveLabel);
$('reload').addEventListener('click',load);
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
 if(polling||document.hidden)return;polling=true;
 try{
  const current=await responseJson(await fetch('/api/operating-policy',{cache:'no-store',signal:AbortSignal.timeout(8000)}));
  showStatus(current);
  if(snapshot&&current.revision!==snapshot.revision)$('message').textContent='Saved settings changed elsewhere. Reload before saving your edits.';
 }catch{ $('runtime-note').textContent='Live status unavailable. Last recorded values retained; reload to reconnect.'; }
 finally{polling=false;}
},10000);
