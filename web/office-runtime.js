/** A recorded stage is progress, not a release decision. */
export function maintenanceProgress(job) {
  const labels={identity:'Checking candidate identity',preparing:'Preparing isolated checks',typecheck:'Checking TypeScript',regressions:'Running behavioral tests',passed:'Candidate checks passed',failed:'Candidate checks failed',blocked:'Verification blocked'};
  // A previous worker's stage can survive a restart or a later blocker.
  const allowed={verifying:['identity','preparing','typecheck','regressions'],verified:['passed'],retryable:['failed'],blocked:['blocked']};
  const stage=(allowed[job.state]??[]).includes(job.progress?.stage)?job.progress.stage:null;
  const fallback={planned:'Waiting for dispatch',running:'Devin is working',awaiting_verification:'Queued for independent checks',verifying:'Independent checks running',verified:'Candidate checks passed',retryable:'Candidate checks failed',blocked:'Work blocked',held:'Dispatch needs review'};
  const label=stage?(job.progress.label||labels[stage]):(fallback[job.state]??'Status not reported');
  const next={planned:'Promote will dispatch when capacity and budget permit.',running:'Waiting for Devin to return a candidate.',awaiting_verification:'Waiting for an independent verification slot.',verifying:stage==='regressions'?'Await the test result; release remains a separate decision.':'Continue the isolated checks.',verified:'Candidate verified; no release or merge is implied.',retryable:job.maxAttempts&&job.attempt>=job.maxAttempts?'Attempt limit reached; review the failed checks before continuing.':'Promote may retry with this failure evidence, within attempt and budget limits.',blocked:'Resolve the recorded blocker before continuing.',held:'Reconcile the provider request before another dispatch.'};
  return {stage,label,next:job.supersededBy?`Historical attempt; continued in attempt ${job.supersededBy.attempt}.`:next[job.state]??'Await a recorded controller action.'};
}

/** Retain past attempts as evidence while identifying their recorded successor. */
export function maintenanceAttempts(jobs) {
  return jobs.map(job => {
    const successor=job.profileId&&jobs.filter(other=>other.profileId===job.profileId&&other.repo===job.repo&&other.baseSha===job.baseSha&&other.attempt>job.attempt).sort((a,b)=>b.attempt-a.attempt)[0];
    return {...job,supersededBy:successor?{id:successor.id,attempt:successor.attempt}:null};
  });
}

/** Dispatch eligibility is separate from sessions that may already be running. */
export function operatingDispatchStatus(data, now=Date.now()) {
  if(!data.configured)return 'Not configured';
  if(data.policy?.paused)return 'Paused';
  if(Date.parse(data.policy?.expiresAt)<=now)return 'Expired';
  const minimum=data.runtime?.minimumDispatchAcu??data.policy?.sessionAcu??1;
  if([data.budget?.remainingAcu,data.budget?.totalRemainingAcu].some(value=>typeof value==='number'&&value<minimum))return 'Budget held';
  if(data.runtime?.provider?.paidDispatchEnabled===false)return 'Provider blocked';
  return 'Authorized';
}

/** One card per approved profile; prior attempts remain in the operating journal. */
export function maintenancePipeline(maintenance, engineering=[]) {
  if(!Array.isArray(maintenance?.profiles))return null;
  const jobs=Array.isArray(maintenance.jobs)?maintenance.jobs:[];
  const cards=maintenance.profiles.map(profile=>{
    const job=jobs.filter(job=>job.profileId===profile.id).sort((a,b)=>String(b.createdAt??'').localeCompare(String(a.createdAt??''))||b.attempt-a.attempt)[0];
    const session=job&&engineering.find(session=>session.id===job.id||(session.remoteId&&session.remoteId===job.remoteId));
    const state=job?.state==='running'&&session?.state!=='running'?'held':job?.state??'planned';
    const progress=maintenanceProgress({...job,state});
    return {id:job?.id??`profile:${profile.id}`,profileId:profile.id,title:profile.title,kind:'maintenance',status:state,
      columnId:['planned'].includes(state)?'queued':state==='running'?'active':state==='verified'?'done':'review',
      detail:job?.state==='running'&&state==='held'?'Provider activity not confirmed; awaiting controller review.':progress.label,
      next:progress.next,attempt:job?.attempt??null,remoteId:job?.remoteId??null,candidateSha:job?.candidateSha??null};
  });
  const columns=[['queued','Queued'],['active','Devin working'],['review','QA / attention'],['done','Verified']].map(([id,label])=>({id,label,cards:cards.filter(card=>card.columnId===id)}));
  return {columns,total:cards.length,queued:columns[0].cards.length,active:columns[1].cards.length,review:columns[2].cards.length,verified:columns[3].cards.length,
    checking:cards.filter(card=>card.status==='verifying').length,qaQueued:cards.filter(card=>card.status==='awaiting_verification').length,
    attention:cards.filter(card=>['held','blocked','retryable'].includes(card.status)).length};
}

/** Recorded operating data feeds the same textures at every camera distance. */
export function applyOfficeRuntime(model, policy, maintenance) {
  if (model.mode !== 'live' || !policy) return model;
  const array = value => Array.isArray(value) ? value : [];
  const engineering = array(policy.runtime?.engineering);
  const testing = array(policy.runtime?.explorations);
  const jobs = maintenanceAttempts(array(maintenance?.jobs));
  const activeEngineering = engineering.filter(session => session.state === 'running');
  const activeJob = jobs.find(job => activeEngineering.some(session => session.id === job.id || (session.remoteId && session.remoteId === job.remoteId)));
  const pipeline=maintenancePipeline(maintenance,engineering);
  if(pipeline){model.proposalKanban??=model.kanban;model.maintenancePipeline=pipeline;model.kanban={columns:pipeline.columns};}
  else if(model.maintenancePipeline){model.kanban=model.proposalKanban;delete model.maintenancePipeline;delete model.proposalKanban;}
  const verifying = jobs.filter(job => job.state === 'verifying');
  const budget = policy.budget ?? {};
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  model.runtime = {
    engineering: engineering.filter(job => job.state === 'running').length,
    testing: testing.filter(job => job.state === 'running').length,
    held: [...engineering, ...testing].filter(job => ['held', 'reserved', 'stopping'].includes(job.state)).length,
    qaJobs: maintenance ? verifying.length : null,
    qaQueued: maintenance ? jobs.filter(job => job.state === 'awaiting_verification').length : null,
    maintenanceJobs: maintenance ? jobs.length : null,
    pendingProfiles: Array.isArray(maintenance?.profiles) ? maintenance.profiles.filter(profile=>!jobs.some(job=>job.profileId===profile.id)).length : null,
    qaTask: verifying[0]?.title??null,
    qaProgress: verifying[0]?maintenanceProgress(verifying[0]).label:null,
    heartbeat: policy.runtime?.heartbeat ?? null,
    paused: policy.policy?.paused ?? true,
    sessions: [...engineering, ...testing],
  };
  if (policy.configured) {
    model.finance = {...model.finance, unit:'ACU', currency:'ACU', budget:finite(budget.totalCeilingAcu),
      reserved:finite(budget.totalCommittedAcu), remaining:finite(budget.totalRemainingAcu),
      dailyRemaining:finite(budget.remainingAcu), spent:null, burnRate:null};
  }
  const active = model.runtime.engineering + model.runtime.testing;
  if (active) {
    model.engineering = {...model.engineering, status:'engineering',
      task:activeJob?.title??`${model.runtime.engineering} engineering · ${model.runtime.testing} sandbox tests`,
      sessions:activeEngineering.map(session=>({...session,title:jobs.find(job=>job.id===session.id||(session.remoteId&&job.remoteId===session.remoteId))?.title??session.remoteId??session.id})),
      lines:[`Live provider sessions · ${active} running · ${model.runtime.held} held`, `Independent QA: ${model.runtime.qaJobs??'unknown'} verifying · ${model.runtime.qaQueued??'unknown'} queued · ${pipeline?.verified??jobs.filter(job=>job.state==='verified').length} verified ${pipeline?'tasks':'candidate attempts'}`, ...(activeJob?[`Current: ${activeJob.title} · ${activeJob.remoteId??activeJob.id??'recorded session'}`]:activeEngineering.length?[`Session: ${activeEngineering[0].remoteId??activeEngineering[0].id}`]:[]), `${model.runtime.pendingProfiles??'Unknown'} approved profiles awaiting their first task. Returned candidates require independent checks before release.`]};
  } else {
    model.engineering = {...model.engineering,status:'idle',task:'No active Devin task',sessions:[],lines:['No active Devin task recorded.',`Independent QA: ${model.runtime.qaJobs??'unknown'} verifying · ${model.runtime.qaQueued??'unknown'} queued · ${pipeline?.verified??jobs.filter(job=>job.state==='verified').length} verified ${pipeline?'tasks':'candidate attempts'}`, `${model.runtime.pendingProfiles??'Unknown'} approved profiles awaiting their first task. Returned candidates require independent checks before release.`]};
  }
  const candidate = [...jobs].filter(job=>!job.supersededBy&&job.candidateSha&&['verifying','awaiting_verification','verified','retryable','blocked'].includes(job.state)).sort((a,b)=>({verifying:0,awaiting_verification:1}[a.state]??2)-({verifying:0,awaiting_verification:1}[b.state]??2)||String(b.updatedAt??'').localeCompare(String(a.updatedAt??'')))[0];
  if (candidate) {
    // A running worker is not evidence that any individual acceptance gate passed.
    model.qa = {executionMode:'maintenance', candidateId:candidate.candidateSha,
      attempt:candidate.attempt ?? 1, stageIndex:0, status:candidate.state==='verifying'?'running':candidate.state==='verified'?'completed':['blocked','retryable'].includes(candidate.state)?'failed':'idle',
      historical:!['verifying','awaiting_verification'].includes(candidate.state),
      headline:maintenanceProgress(candidate).label, task:candidate.title ?? 'Maintenance candidate',
      progress:maintenanceProgress(candidate),
      stages:['provenance','meaning','regression','release'].map(id => ({id,outcome:'not_run'}))};
  } else if (model.qa?.executionMode==='maintenance') {
    model.qa={executionMode:'maintenance',candidateId:null,attempt:0,stageIndex:-1,status:'idle',headline:maintenance?'Waiting for a candidate':'Verification status unavailable',task:'No current verification candidate',stages:[]};
  }
  return model;
}
export function officeTickerValues(model) {
  if (model.runtime) return [['ENGINEERING',model.runtime.engineering],['TESTING',model.runtime.testing],['HELD / RESERVED',model.runtime.held],['QA RUNNING',model.runtime.qaJobs??'—'],['ACU AVAILABLE',model.finance?.remaining??'—'],['REVIEW',model.runtime.paused?'PAUSED':model.runtime.heartbeat?.status??'NOT RECORDED']];
  return [['XARTS / OPS',model.mode==='demo'?'DEMO':'LIVE'],['USAGE',model.usage??'—'],['ERRORS',model.errors??'—'],['BACKLOG',(model.kanban?.columns??[]).reduce((n,c)=>n+c.cards.length,0)],['QA',model.qa?.status??'idle'],['SPEND',model.finance?.spent==null?'—':`${model.finance?.currency??'?'} ${model.finance?.spent}`]];
}
