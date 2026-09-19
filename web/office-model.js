import { operationsStory } from './operations-model.js';
/** Pure browser projection. Demo phases are local fixtures, never controller commands. */
const COLUMNS = [['queued', 'Queued'], ['active', 'Active'], ['review', 'Review'], ['done', 'Done']];
const GROUPS = [
  ['provenance', 'Provenance · A00–A02', ['A00', 'A01', 'A02']],
  ['meaning', 'Meaning · A03–A04', ['A03', 'A04']],
  ['regression', 'Regression · A05–A07', ['A05', 'A06', 'A07']],
  ['release', 'Release · A08–A10', ['A08', 'A09', 'A10']],
];
const array = value => Array.isArray(value) ? value : [];
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const stages = outcomes => GROUPS.map(([id, label], index) => ({ id, label, outcome: outcomes[index] ?? 'not_run' }));
const board = cards => ({ columns: COLUMNS.map(([id, label]) => ({ id, label, cards: cards.filter(card => card.columnId === id).map(({ columnId, ...card }) => ({ ...card })) })) });
const columnFor = status => ['completed', 'cancelled', 'refused', 'budget_exhausted'].includes(status) ? 'done' : ['evaluating', 'accepted', 'releasing'].includes(status) ? 'review' : status === 'received' ? 'queued' : 'active';


/** Shared presentation copy. Specific failure causes belong only to known demo fixtures. */
export function qaStageCopy(stage, mode) {
  const copy = {
    provenance: { title: 'Scope', pass: 'Scope verified', detail: 'A00–A02 · Candidate origin, inputs and change scope' },
    meaning: { title: 'Chart correctness', pass: 'Chart checks passed', detail: 'A03–A04 · Independent checks of chart meaning and values' },
    regression: { title: 'Regressions', pass: 'No regressions found', detail: 'A05–A07 · Existing behavior and protected tests' },
    release: { title: 'Release', pass: 'Release checks passed', detail: 'A08–A10 · Release evidence and delivery checks' },
  }[stage.id] ?? { title: stage.label || 'Check', pass: 'Check passed', detail: 'Recorded acceptance check' };
  if (mode === 'demo' && stage.id === 'meaning' && stage.outcome === 'fail') {
    return { title: copy.title, headline: 'Rounding is wrong', detail: 'Expected €1.01 · received €1.00 (illustrative)' };
  }
  const headline = { pass: copy.pass, fail: 'Check failed', error: 'Evidence needs attention', not_run: 'Not checked yet', pending: 'Checking…' }[stage.outcome] ?? 'Not checked yet';
  return { title: copy.title, headline, detail: copy.detail };
}

export function createDemoState() {
  return { phase: 0, cards: [
    { id: 'demo-repair', title: 'Fix Xarts financial bridge rounding · PR DEMO-42', kind: 'repair', status: 'received', columnId: 'queued' },
    { id: 'demo-export', title: 'Add accessible labels to Xarts chart exports', kind: 'capability', status: 'received', columnId: 'queued' },
    { id: 'demo-gate', title: 'Strengthen independent currency-unit checks', kind: 'gate_strengthening', status: 'evaluating', columnId: 'review' },
    { id: 'demo-docs', title: 'Document waterfall chart input contracts', kind: 'capability', status: 'completed', columnId: 'done' },
  ] };
}

// 0 queued; 1 engineering; 2 provenance; 3 meaning failure; 4 correction;
// 5 all checks pass on attempt 2; 6 completed. The final phase is stable.
export function advanceDemo(state) {
  const phase = Math.min(6, state.phase + 1);
  const status = ['received', 'engineering', 'evaluating', 'engineering', 'engineering', 'accepted', 'completed'][phase];
  return { ...state, phase, cards: state.cards.map(card => card.id === 'demo-repair' ? { ...card, status, columnId: columnFor(status) } : { ...card }) };
}

export function moveDemoCard(state, id, columnId) {
  // The PR's lifecycle belongs to the pipeline; manual movement cannot imply QA success.
  if (id === 'demo-repair' || !COLUMNS.some(([column]) => column === columnId) || !state.cards.some(card => card.id === id)) return state;
  const status = { queued: 'received', active: 'engineering', review: 'evaluating', done: 'completed' }[columnId];
  return { ...state, cards: state.cards.map(card => card.id === id ? { ...card, columnId, status } : { ...card }) };
}

function demoModel(state) {
  const phase = state.phase;
  const outcomes = [[], [], ['pass', 'pending'], ['pass', 'fail'], [], ['pass', 'pass', 'pass', 'pass'], ['pass', 'pass', 'pass', 'pass']][phase];
  const lines = [
    'Queued PR DEMO-42: reproduce financial bridge rounding mismatch.',
    'Attempt 1: reproduce currency-unit mismatch and prepare a candidate.',
    'Attempt 1: provenance checks passed; independent meaning checks running.',
    'Attempt 1: meaning check failed — expected €1.01, received €1.00. Return to engineering.',
    'Attempt 2: correct rounding boundary; previous candidate evidence is discarded.',
    'Attempt 2: provenance, meaning, regression and release checks passed.',
    'PR DEMO-42 completed. Verified correction delivered in the local demo.',
  ];
  const repair = state.cards.find(card => card.id === 'demo-repair');
  return {
    mode: 'demo', kanban: board(state.cards),
    engineering: { lines: lines.slice(0, phase + 1), status: repair.status, task: repair.title },
    strategy: { ideas: state.cards.filter(card => card.id !== 'demo-repair').map(card => ({ id: card.id, title: card.title, body: card.kind === 'gate_strengthening' ? 'Use an independent oracle to protect financial output meaning.' : 'Improve how customers create and understand Xarts charts.', status: card.status })) },
    qa: { executionMode: 'fixture', candidateId: phase < 2 ? null : phase < 4 ? 'DEMO-42 / candidate-1' : 'DEMO-42 / candidate-2', attempt: phase === 0 ? 0 : phase < 4 ? 1 : 2, stageIndex: phase === 2 || phase === 3 ? 1 : phase >= 5 ? 3 : -1, status: phase === 3 ? 'failed' : phase >= 5 ? 'completed' : phase === 2 ? 'running' : 'idle', stages: stages(outcomes) },
    finance: { budget: 100, spent: [0, 1.2, 2.1, 3.4, 4.9, 6.2, 6.2][phase], reserved: phase === 0 || phase === 6 ? 0 : 8, burnRate: phase === 0 || phase === 6 ? 0 : 3.3, currency: 'EUR' },
    usage: [0, 12000, 22000, 34000, 49000, 62000, 62000][phase], errors: phase >= 3 ? 1 : 0,
  };
}

function liveQA(incident, events) {
  const candidates = events.filter(event => event.type === 'candidate.received' && event.payload?.candidate?.candidateSha);
  const latest = candidates.at(-1);
  const candidateId = latest?.payload.candidate.candidateSha ?? null;
  // No accepted identity fallback: it may refer to an older candidate than the visible events.
  const results = events.filter(event => event.type === 'gate.finished' && candidateId && event.payload?.result?.candidateSha === candidateId && event.sequence > latest.sequence).map(event => event.payload.result);
  const outcomes = GROUPS.map(([, , ids]) => {
    const matching = results.filter(result => ids.includes(result.gateId));
    if (matching.length && (typeof incident?.evaluatorRevision !== 'string' || !incident.evaluatorRevision || typeof incident?.inputsHash !== 'string' || !incident.inputsHash)) return 'error';
    if (matching.some(result => result.evaluatorRevision !== incident?.evaluatorRevision || result.inputHash !== incident?.inputsHash || !Number.isInteger(result.gateVersion) || result.gateVersion < 1)) return 'error';
    // Reject ambiguous duplicates, absent evidence, N/A, and partial group coverage.
    if (ids.some(id => matching.filter(result => result.gateId === id).length > 1)) return 'error';
    if (matching.some(result => result.outcome === 'error')) return 'error';
    if (matching.some(result => result.outcome === 'fail')) return 'fail';
    if (ids.every(id => matching.some(result => result.gateId === id && result.outcome === 'pass' && typeof result.logArtifactId === 'string' && result.logArtifactId.length > 0 && numeric(result.durationMs) !== null && result.durationMs >= 0))) return 'pass';
    return 'not_run';
  });
  const failedIndex = outcomes.findIndex(outcome => outcome === 'fail' || outcome === 'error');
  const allPassed = outcomes.every(outcome => outcome === 'pass');
  const pendingIndex = outcomes.findIndex(outcome => outcome !== 'pass');
  return { candidateId, attempt: new Set(candidates.map(event => event.payload.candidate.attemptId).filter(Boolean)).size, stageIndex: failedIndex >= 0 ? failedIndex : allPassed ? 3 : candidateId ? pendingIndex : -1, status: failedIndex >= 0 ? 'failed' : allPassed ? 'completed' : candidateId && incident?.status === 'evaluating' ? 'running' : 'idle', stages: stages(outcomes) };
}

export function createOfficeModel(snapshot, mode, demoState) {
  if (mode === 'demo') return demoModel(demoState ?? createDemoState());
  const incidents = array(snapshot?.incidents);
  const cards = incidents.map(incident => ({ id: incident.id, title: incident.requestedOutcome.summary, kind: incident.requestedOutcome.kind, status: incident.status, columnId: columnFor(incident.status) }));
  const selected = incidents.find(incident => !['completed', 'cancelled', 'refused', 'budget_exhausted'].includes(incident.status)) ?? incidents[0];
  const events = array(snapshot?.events).filter(event => event.incidentId === selected?.id).slice().sort((a, b) => a.sequence - b.sequence);
  const economics = snapshot?.ownerReport?.economics;
  const operations=snapshot?.operationsOverview?operationsStory(snapshot.operationsOverview):null;
  if(operations){
    for(const proposal of operations.proposals)cards.push({id:proposal.id,title:proposal.title,kind:proposal.category,status:'proposed',columnId:'queued'});
    if(operations.review&&selected){const card=cards.find(c=>c.id===selected.id);if(card){card.columnId='review';card.status=operations.review.state==='blocked'?'blocked':'evaluating';}}
  }
  return {
    mode: 'live', operations, kanban: board(cards),
    engineering: { lines: operations?[operations.heading,operations.detail,`Next: ${operations.next}`]:events.slice(-14).map(event => `${event.occurredAt} · ${event.type}${event.payload?.reason ? ` · ${event.payload.reason}` : ''}`), status: operations?.activeCount?'engineering':operations?.session?.state==='stopped'?'stopped':selected?.status ?? 'idle', task: selected?.requestedOutcome.summary ?? 'No controller tasks received' },
    strategy: { ideas: cards.filter(card => card.kind !== 'repair').map(card => ({ id: card.id, title: card.title, body: card.kind === 'gate_strengthening' ? 'Controller request to strengthen acceptance gates.' : 'Controller capability request.', status: card.status })) },
    qa: operations?.review?{executionMode:'local_checks',candidateId:operations.review.result?.candidateSha??operations.session?.candidateSha??null,attempt:1,stageIndex:0,status:operations.review.state==='blocked'?'failed':'running',stages:[{id:'provenance',label:'Candidate scope',outcome:operations.review.result?.checks?.scope??'not_run'},{id:'meaning',label:'Independent build',outcome:'not_run'},{id:'regression',label:'Regression checks',outcome:'not_run'},{id:'release',label:'Release',outcome:'not_run'}]}:projectedQA(snapshot, selected, events),
    finance: { budget: numeric(economics?.approvedBudget), spent: numeric(economics?.reportedSpend), reserved: numeric(economics?.reserved), burnRate: null, currency: typeof economics?.currency === 'string' ? economics.currency : null },
    usage: null, errors: null,
  };
}

function projectedQA(snapshot, incident, events) {
  const fallback = liveQA(incident, events);
  const projection = snapshot?.evaluations?.[incident?.id];
  if (!projection) return { ...fallback, executionMode: 'unknown' };
  return { candidateId: projection.candidateId, attempt: Number(projection.attempt), stageIndex: Number(projection.stageIndex),
    status: String(projection.status), executionMode: String(projection.executionMode),
    stages: array(projection.stages).map(stage => ({ id: String(stage.id), label: String(stage.label), outcome: String(stage.outcome) })) };
}
