/** Recorded operating data feeds the same textures at every camera distance. */
export function applyOfficeRuntime(model, policy, maintenance) {
  if (model.mode !== 'live' || !policy) return model;
  const array = value => Array.isArray(value) ? value : [];
  const engineering = array(policy.runtime?.engineering);
  const testing = array(policy.runtime?.explorations);
  const jobs = array(maintenance?.jobs);
  const activeEngineering = engineering.filter(session => session.state === 'running');
  const activeJob = jobs.find(job => activeEngineering.some(session => session.id === job.id || (session.remoteId && session.remoteId === job.remoteId)));
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
    qaTask: verifying[0]?.title??null,
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
      lines:[`Live provider sessions · ${active} running`, ...model.runtime.sessions.filter(job=>job.state==='running').map(job=>`${job.remoteId??job.id} · running`), `Independent QA: ${model.runtime.qaJobs??'unknown'} verifying · ${model.runtime.qaQueued??'unknown'} queued · ${jobs.filter(job=>job.state==='verified').length} verified candidates`, 'Returned candidates require independent checks before release.']};
  } else {
    model.engineering = {...model.engineering,status:'idle',task:'No active Devin task',lines:['No active Devin task recorded.',`Independent QA: ${model.runtime.qaJobs??'unknown'} verifying · ${model.runtime.qaQueued??'unknown'} queued · ${jobs.filter(job=>job.state==='verified').length} verified candidates`, 'Returned candidates require independent checks before release.']};
  }
  const candidate = verifying.find(job => typeof job.candidateSha === 'string' && job.candidateSha.length > 0);
  if (candidate) {
    // A running worker is not evidence that any individual acceptance gate passed.
    model.qa = {executionMode:'maintenance', candidateId:candidate.candidateSha,
      attempt:candidate.attempt ?? 1, stageIndex:0, status:'running',
      headline:'Independent checks running', task:candidate.title ?? 'Maintenance candidate',
      stages:['provenance','meaning','regression','release'].map(id => ({id,outcome:'not_run'}))};
  }
  return model;
}
export function officeTickerValues(model) {
  if (model.runtime) return [['ENGINEERING',model.runtime.engineering],['TESTING',model.runtime.testing],['HELD / RESERVED',model.runtime.held],['QA RUNNING',model.runtime.qaJobs??'—'],['ACU AVAILABLE',model.finance?.remaining??'—'],['REVIEW',model.runtime.paused?'PAUSED':model.runtime.heartbeat?.status??'NOT RECORDED']];
  return [['XARTS / OPS',model.mode==='demo'?'DEMO':'LIVE'],['USAGE',model.usage??'—'],['ERRORS',model.errors??'—'],['BACKLOG',(model.kanban?.columns??[]).reduce((n,c)=>n+c.cards.length,0)],['QA',model.qa?.status??'idle'],['SPEND',model.finance?.spent==null?'—':`${model.finance?.currency??'?'} ${model.finance?.spent}`]];
}
