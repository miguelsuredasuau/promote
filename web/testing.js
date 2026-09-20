const $=s=>document.querySelector(s);
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
let target=null,requestId=crypto.randomUUID(),pending=false;
function renderRun(run){
 const box=node('article',null,'report');box.append(node('span',run.state==='stopped'?'Test ended · report unverified':run.state,'badge'),node('h3',run.report?.summary || run.spec.focus),node('p',`${run.spec.repository} · ${run.spec.baseSha.slice(0,12)} · ceiling ${run.spec.maxAcu} ACU · reported ${run.usageAcu??'unknown'} ACU`,'meta'));
 if(run.remoteId){const a=node('a','Open Devin session ↗');a.href='https://app.devin.ai/sessions/'+encodeURIComponent(run.remoteId.replace(/^devin-/,''));a.target='_blank';a.rel='noopener noreferrer';box.append(a);}
 if(run.reason)box.append(node('p',run.reason.replaceAll('_',' '),'meta'));
 if(run.report){
  box.append(node('p',`${run.report.findings.length} findings · ${run.report.coverage.length} scenarios reported. Independent reproduction required.`));
  for(const finding of run.report.findings){const f=node('div',null,'finding');f.append(node('h4',`${finding.severity.toUpperCase()} · ${finding.title}`));const steps=node('ol');finding.steps.forEach(s=>steps.append(node('li',s)));f.append(steps,node('p','Expected: '+finding.expected),node('p','Observed: '+finding.observed));const evidence=node('details');evidence.append(node('summary','Evidence references'),node('pre',finding.evidence.join('\n')));f.append(evidence);box.append(f);}
  const coverage=node('details');coverage.append(node('summary','Coverage & limitations'),node('pre',JSON.stringify({coverage:run.report.coverage,limitations:run.report.limitations},null,2)));box.append(coverage);
 }
 return box;
}
async function refresh(){
 try{const response=await fetch('/api/explorations');if(!response.ok)throw Error('Testing status unavailable');const data=await response.json();target=data.target;$('#target').textContent=target?`${target.repository} · commit ${target.baseSha.slice(0,12)}${target.dirty?' · uncommitted changes; commit before testing':''}`:'Test target unavailable. Configure PROMOTE_TEST_PROJECT_PATH to a checkout with the sandbox setup.';$('#launch').disabled=pending||!target||target.dirty;$('#runs').replaceChildren(...(data.runs.length?data.runs.map(renderRun):[node('p','No recorded tests yet.')]));}catch(e){$('#message').textContent=e.message;}
}
$('#test-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!target||pending)return;pending=true;$('#launch').disabled=true;$('#message').textContent='Reserving the limit and submitting one session…';
 try{const session=await fetch('/api/owner-session').then(r=>r.json());const response=await fetch('/api/explorations',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':session.token},body:JSON.stringify({id:requestId,baseSha:target.baseSha,maxAcu:Number($('#acu').value),minutes:Number($('#minutes').value),focus:$('#focus').value})});const result=await response.json();if(!response.ok)throw Error(result.error||'Test could not start');$('#message').textContent=result.state==='running'?'Devin is testing. Progress and the report will appear here.':`Request ${result.state}. No automatic paid retry.`;requestId=crypto.randomUUID();}catch(e){$('#message').textContent=e.message;}finally{pending=false;await refresh();}
});
$('#refresh').onclick=refresh;await refresh();setInterval(()=>{if(!document.hidden&&!pending)void refresh();},10000);
