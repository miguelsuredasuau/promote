const list=x=>Array.isArray(x)?x:[];
export const words=x=>String(x??'').replaceAll('_',' ').replaceAll('.',' ');
export function reasonText(reason){return {
 candidate_scope_violation:'The repair changes a file outside its approved scope.',
 independent_runtime_checks_pending:'Scope checks passed. Isolated build and regression tests still need to run.',
 candidate_awaiting_independent_evaluation:'The engineer returned a candidate; QA has not accepted it yet.',
 engineering_adapter_and_mandate_not_configured:'Engineering was blocked while provider access and spending authority were being configured.',
 role_execution_failed:'This step could not finish. Its evidence needs inspection before retrying.',
 authorization_changed:'The approved task changed or its authorization expired.',
 candidate_branch_mismatch:'The remote branch no longer matches the submitted candidate.',
 sdk_build_not_accepted:'The isolated SDK build did not pass. The package cannot be released.',
 standalone_or_regeneration_not_accepted:'The installed package or original chart replay failed. The current release stays active.',
 delivery_infrastructure_failed:'The verification environment failed. This is not an accepted repair.',
 verified_release_activated:'The package passed independent checks and is now active for new chat requests.',
 delivery_requires_reconciliation:'An earlier delivery attempt must be reconciled before another attempt starts.',
 }[reason]??words(reason);}
/** Keep authorization, reserved ceilings and provider observations separate.
 * @param {{budget?: {totalCeilingAcu?: number|null, totalCommittedAcu?: number|null, totalRemainingAcu?: number|null}}|null} operating
 */
export function serviceTelemetry(service={},operating=null,now=Date.now()) {
 const spend=service.engineeringSpend??{},sessions=list(spend.sessions),budget=operating?.budget;
 const running=sessions.filter(row=>row.state==='running').length;
 const held=sessions.filter(row=>['held','reserved','dispatching','stopping'].includes(row.state)).length;
 const observed=sessions.map(row=>Date.parse(row.observedAt)).filter(Number.isFinite);
 const unknown=sessions.filter(row=>row.reportedAcu==null).length;
 const usage=spend.reportedUsage;
 const usageText=usage==null?(spend.knownReportedUsage>0?`${spend.knownReportedUsage} ACU known · ${unknown} pending`:'Pending provider report'):usage===0?'0 ACU reported · not settled':`${usage} ACU reported · not settled`;
 const oldest=observed.length?Math.max(0,Math.floor((now-Math.min(...observed))/1000)):null;
 const latest=observed.length?Math.max(0,Math.floor((now-Math.max(...observed))/1000)):null;
 const freshness=latest===null?'No usage observation recorded.':`Latest usage observation ${latest}s ago; oldest ${oldest}s ago.${observed.length<sessions.length?' Some sessions have no observation.':''}`;
 return {pairs:[['Chat intake',service.intake?.status==='watching'?'Receiving normally':words(service.intake?.status??'unknown')],['Received records',service.receivedRecords??'—'],['Progress events',service.progressEvents??'—'],['Sessions running',running],['Sessions held / reserved',held],['Campaign authorization',budget?.totalCeilingAcu==null?'Unavailable':`${budget.totalCeilingAcu} ACU`],['Reserved session ceilings',budget?.totalCommittedAcu==null?(spend.committedCeilings==null?'Unavailable':`${spend.committedCeilings} ACU · all recorded`):`${budget.totalCommittedAcu} ACU`],['Campaign available',budget?.totalRemainingAcu==null?'Unavailable':`${budget.totalRemainingAcu} ACU`],['Provider-reported usage',usageText],['Indicative cost',spend.estimatedDollarCost>0?`$${spend.estimatedDollarCost.toFixed(2)} · estimate`:'Pending usage / rate'],['Billed cost','Not available']],note:`Authorization is a spending limit; reserved ceilings are not measured spend. Provider usage can arrive late, including after a session stops. Zero is not confirmed free work. ${freshness}`};
}
export function operationsStory(service={}){
 const work=list(service.workQueue),sessions=list(service.engineeringSpend?.sessions),proposals=list(service.proposals);
 const delivery=work.filter(w=>w.payload?.deliveryTask).at(-1);
 const review=delivery??work.filter(w=>w.kind==='candidate_review').at(-1);
 const released=service.delivery?.status==='active'||delivery?.state==='completed'&&['verified_release_activated','release_already_activated'].includes(delivery.result?.reason);
 const waitingForDocker=service.delivery?.status==='waiting_for_docker';
 const session=sessions.at(-1),objective=list(service.objectives).find(o=>o.id===delivery?.result?.incidentId)??list(service.objectives).find(o=>!['completed','cancelled','refused'].includes(o.status));
 const active=sessions.filter(s=>s.state==='running'),held=sessions.filter(s=>s.state==='held');
 const scopeBlocked=review?.result?.reason==='candidate_scope_violation';
 const heading=active.length?`${active.length} Devin sessions working`:held.length?`${held.length} Devin sessions held`:waitingForDocker?'Verification is waiting for Docker':released?'Verified release is active':delivery?.state==='running'?'QA is verifying the package':delivery?.state==='blocked'?'Release held after verification':scopeBlocked?'QA found a scope mismatch':held.length?'Engineering needs reconciliation':active.length?'Devin is working on the repair':session?.candidateSha?'Candidate ready for independent checks':'Reviewing project priorities';
 const detail=active.length?`${active.length} authorized sessions are running${held.length?'; '+held.length+' additional sessions are held':''}. Provider observations determine these counts.`:held.length?'Held sessions retain their reservations while Promote checks continuation, provider approval or termination.':waitingForDocker?'The candidate is saved. No verification container is running and no new release has been activated.':released?'Independent build, standalone package and original chart checks passed. New chat requests can use this release.':delivery?.state==='running'?'Building and testing in isolated containers. Activation waits for every required check.':delivery?.state==='blocked'?reasonText(delivery.result?.reason):scopeBlocked?`${list(review.result.outsideAllowedPaths).join(', ')} is outside the approved paths. The candidate has not been accepted.`:held.length?'The existing session needs inspection before more work can start.':active.length?'One authorized engineering session is active. Usage is polled every 15 seconds.':session?.candidateSha?'Engineering has stopped. QA and release checks must pass before this reaches the chat.':'The orchestrator groups evidence, assesses proposals and assigns authorized work.';
 const next=active.length?'Observe the active sessions and independently check each returned candidate.':held.length?'Inspect each held session’s recorded reason; only authorized continuations may resume.':waitingForDocker?service.delivery.nextAction:released?'Verify the release label in the chat; continue reviewing incoming feedback.':delivery?.state==='running'?'Finish standalone checks and regenerate the original SQL-backed chart.':review?.result?.nextAction??(active.length?'Wait for the candidate, then run independent QA.':service.provider?.paidDispatchEnabled?'Select the next authorized task.':service.provider?.explanation??'Review new evidence and prepare a scoped task.');
 const roleState=role=>{
  const jobs=work.filter(w=>w.role===role),running=jobs.find(w=>w.state==='running'),blocked=jobs.filter(w=>w.state==='blocked').at(-1);
  if(role==='qa'&&released)return{status:'Verified',detail:'The delivery passed and its release is active.'};
  if(role==='qa'&&waitingForDocker)return{status:'Waiting for Docker',detail:service.delivery.nextAction};
  if(running)return{status:'Working',detail:'Processing an assigned work item.'};
  if(blocked)return{status:'Needs attention',detail:reasonText(blocked.result?.reason)};
  if(jobs.some(w=>w.state==='queued'))return{status:'Queued',detail:'An assignment is ready for the next review.'};
  return{status:jobs.length?'Up to date':'Waiting',detail:jobs.length?`${jobs.filter(w=>w.state==='completed').length} assessments completed.`:'No work assigned yet.'};
 };
 const agents=[{id:'orchestrator',name:'Orchestrator',location:'Planning desk',mode:'Local scheduler',status:service.orchestrator?'Monitoring':'Starting',detail:'Reviews the project every 10 minutes.'},
 {id:'feedback',name:'Feedback analyst',location:'Work queue',mode:'Local rules',...roleState('feedback')},
 {id:'product',name:'Product analyst',location:'Ideas wall',mode:'Local rules',...roleState('product')},
 {id:'engineer',name:'Devin engineer',location:'Engineering desk',mode:'Remote AI agent',status:active.length?'Working':held.length?'Needs attention':session?'Stopped':'Waiting',detail:active.length?`${active.length} authorized Devin sessions are running.`:held.length?`${held.length} sessions are held; inspect their recorded reasons.`:session?.candidateSha?'Candidate submitted. No engineering process is running.':'No paid session is running.'},
 {id:'qa',name:'Independent QA',location:'QA line',mode:'Local checks',...roleState('qa')}];
 const stages=[{label:'Evidence received',state:service.receivedRecords?'done':'pending'},{label:'Triage',state:list(service.proposals).length||list(service.workQueue).length?'done':'pending'},{label:'Engineering',state:active.length?'active':session?.candidateSha?'done':'pending'},{label:'Independent QA',state:released?'done':review?.state==='blocked'?'blocked':review?.state==='running'?'active':'pending'},{label:'Release',state:released?'done':'pending'}];
 return{objective:objective?.title??'Improve Xarts from real usage',heading,detail,next,agents,stages,
  ticker:`${heading}. ${waitingForDocker?'Waiting for the local execution environment.':released?'Ready for new chat requests.':delivery?.state==='running'?'Build, package and original-request checks running.':scopeBlocked?'Review the additional test path.':active.length?`${active.length} Devin sessions active.`:session?.candidateSha?'No release yet.':'Monitoring incoming evidence.'}`,
  proposals,work,review,session,activeCount:active.length,blockedCount:work.filter(w=>w.state==='blocked').length+held.length};
}
export function eventCopy(event){
 const d=event.details??{},role={qa:'QA',feedback:'Feedback analyst',product:'Product analyst',engineer:'Engineer'}[d.role]??'Orchestrator';
 const titles={
 'Feedback analyst triaged record':`Feedback reviewed · ${list(d.proposalIds).length} proposals identified`,
 'Work assigned':`${role} received a new assignment`,
 'Role started work':`${role} started an assigned step`,
 'Role completed work':`${role} completed an assessment`,
 'Role requires follow-up':`${role} needs follow-up`,
 'Scheduled project review completed':'Orchestrator reviewed the project',
 'Engineering capacity and ACU budget reserved':'Budget reserved for the SDK repair',
 'Sending Devin session creation':'Starting the authorized Devin session',
 'Devin session observation':d.state==='stopped'?'Devin stopped; candidate retained':d.state==='held'?'Devin session needs reconciliation':`Devin is ${words(d.state)}`,
 'Engineering provider readiness changed':'Engineering readiness updated',
 'Demo record received':'New evidence received from the chat',
 'Chat progress received':`Chat: ${words(d.eventType)}`,
 'incident.transitioned':`Repair moved from ${words(d.from)} to ${words(d.to)}`,
 'baseline.observed':'SDK build failure reproduced',
 'incident.received':'SDK repair added to the incident backlog',
 'incident.blocked':'Repair paused for a prerequisite',
 'session.created':'Devin session created',
 'gate.started':`Verification started: ${words(d.gateId)}`,
 'gate.finished':`Verification ${words(d.result?.outcome)}: ${words(d.result?.gateId)}`,
 'release.activated':'Verified release activated for the chat',
 };
 return{title:titles[event.summary]??event.summary,detail:d.result?.reason?reasonText(d.result.reason):d.result?.nextAction??(d.reason?reasonText(d.reason):d.role?`Assigned role: ${role}`:'')};
}
