/** Recorded operating data feeds the same textures at every camera distance. */
export function applyOfficeRuntime(model, policy, maintenance) {
  if (model.mode !== 'live' || !policy) return model;
  const array = value => Array.isArray(value) ? value : [];
  const engineering = array(policy.runtime?.engineering);
  const testing = array(policy.runtime?.explorations);
  const jobs = array(maintenance?.jobs);
  const budget = policy.budget ?? {};
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  model.runtime = {
    engineering: engineering.filter(job => job.state === 'running').length,
    testing: testing.filter(job => job.state === 'running').length,
    held: [...engineering, ...testing].filter(job => ['held', 'reserved', 'stopping'].includes(job.state)).length,
    qaJobs: maintenance ? jobs.filter(job => job.state === 'verifying').length : null,
    maintenanceJobs: maintenance ? jobs.length : null,
    qaTask: jobs.find(job=>job.state==='verifying')?.title??null,
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
      task:jobs.find(job=>job.state==='running')?.title??`${model.runtime.engineering} engineering · ${model.runtime.testing} sandbox tests`,
      lines:[`Live provider sessions · ${active} running`, ...model.runtime.sessions.filter(job=>job.state==='running').map(job=>`${job.remoteId??job.id} · running`), ...model.engineering.lines]};
  } else {
    model.engineering = {...model.engineering,status:'idle',task:'No active Devin task',lines:['No active Devin task recorded.',...model.engineering.lines]};
  }
  return model;
}
export function officeTickerValues(model) {
  if (model.runtime) return [['ENGINEERING',model.runtime.engineering],['TESTING',model.runtime.testing],['HELD / RESERVED',model.runtime.held],['QA RUNNING',model.runtime.qaJobs??'—'],['ACU AVAILABLE',model.finance.remaining??'—'],['REVIEW',model.runtime.paused?'PAUSED':model.runtime.heartbeat?.status??'NOT RECORDED']];
  return [['XARTS / OPS',model.mode==='demo'?'DEMO':'LIVE'],['USAGE',model.usage??'—'],['ERRORS',model.errors??'—'],['BACKLOG',(model.kanban?.columns??[]).reduce((n,c)=>n+c.cards.length,0)],['QA',model.qa?.status??'idle'],['SPEND',model.finance.spent==null?'—':`${model.finance.currency??'?'} ${model.finance.spent}`]];
}
