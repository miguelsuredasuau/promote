import { describe, expect, it } from 'vitest';
import { advanceDemo, createDemoState, createOfficeModel, moveDemoCard, qaStageCopy } from '../web/office-model.js';

const incident = { id: 'live-task', status: 'evaluating', evaluatorRevision: 'eval', inputsHash: 'inputs', requestedOutcome: { summary: 'Real chart repair', kind: 'repair' } };
const candidate = (sha: string, sequence: number, attemptId = 'attempt-1') => ({ incidentId: incident.id, sequence, type: 'candidate.received', payload: { candidate: { candidateSha: sha, attemptId } } });
const gate = (id: string, sha: string, sequence: number, outcome = 'pass') => ({ incidentId: incident.id, sequence, type: 'gate.finished', payload: { result: { gateId: id, candidateSha: sha, evaluatorRevision: 'eval', inputHash: 'inputs', gateVersion: 1, outcome, logArtifactId: 'log-1', durationMs: 1 } } });
const live = (events: unknown[]) => createOfficeModel({ incidents: [incident], events }, 'live', createDemoState());

describe('shared office projection', () => {
  it('keeps all fixtures out of live mode and preserves unknown telemetry', () => {
    const model = createOfficeModel(null, 'live', createDemoState());
    expect(JSON.stringify(model)).not.toMatch(/DEMO|financial bridge|currency-unit/);
    expect(model.kanban.columns.flatMap(column => column.cards)).toEqual([]);
    expect(model.qa.stages.every(stage => stage.outcome === 'not_run')).toBe(true);
    expect(model.finance).toEqual({ budget: null, spent: null, reserved: null, burnRate: null, currency: null });
    expect(model.usage).toBeNull();
    expect(model.errors).toBeNull();
  });
  it('synchronizes demo card, task, terminal, QA and costs without mutation', () => {
    let state = createDemoState();
    const original = structuredClone(state);
    for (let phase = 0; phase <= 6; phase++) {
      const model = createOfficeModel(null, 'demo', state);
      const card = model.kanban.columns.flatMap(column => column.cards).find(card => card.id === 'demo-repair')!;
      expect(model.engineering.task).toBe(card.title);
      expect(model.engineering.status).toBe(card.status);
      expect(model.engineering.lines).toHaveLength(phase + 1);
      if (phase === 3) {
        expect(model.qa.status).toBe('failed');
        expect(model.qa.stages[1].outcome).toBe('fail');
        expect(model.kanban.columns[1].cards).toContainEqual(card);
      }
      if (phase === 4) {
        expect(model.qa.attempt).toBe(2);
        expect(model.qa.candidateId).toContain('candidate-2');
        expect(model.qa.stages.every(stage => stage.outcome === 'not_run')).toBe(true);
      }
      if (phase === 6) {
        expect(model.qa.status).toBe('completed');
        expect(model.kanban.columns[3].cards).toContainEqual(card);
        expect(model.finance.reserved).toBe(0);
      }
      const before = structuredClone(state);
      const next = advanceDemo(state);
      expect(state).toEqual(before);
      state = next;
    }
    expect(createDemoState()).toEqual(original);
    expect(state.phase).toBe(6);
  });
  it('permits local board edits while protecting the repair pipeline', () => {
    const state = createDemoState();
    expect(moveDemoCard(state, 'demo-repair', 'done')).toBe(state);
    expect(moveDemoCard(state, 'demo-export', 'invalid')).toBe(state);
    expect(moveDemoCard(state, 'missing', 'done')).toBe(state);
    const moved = moveDemoCard(state, 'demo-export', 'active');
    expect(state.cards[1].columnId).toBe('queued');
    expect(moved.cards[1]).toMatchObject({ columnId: 'active', status: 'engineering' });
    expect(advanceDemo(moved).cards[1]).toEqual(moved.cards[1]);
  });
  it('never infers passes from incident acceptance or partial gate groups', () => {
    expect(createOfficeModel({ incidents: [{ ...incident, status: 'completed' }] }, 'live', null).qa.status).toBe('idle');
    expect(live([candidate('sha1', 1), gate('A00', 'sha1', 2)]).qa.stages[0].outcome).toBe('not_run');
    expect(live([candidate('sha1', 1), gate('A03', 'sha1', 2, 'fail')]).qa.stages[1].outcome).toBe('fail');
  });
  it('requires full evidence from the latest candidate and never mixes hashes', () => {
    const old = [candidate('sha1', 1), gate('A00', 'sha1', 2), gate('A01', 'sha1', 3), gate('A02', 'sha1', 4)];
    expect(live(old).qa.stages[0].outcome).toBe('pass');
    const next = [...old, candidate('sha2', 5, 'attempt-2'), gate('A00', 'sha2', 6), gate('A01', 'sha1', 7), gate('A02', 'sha2', 8)];
    expect(live(next).qa).toMatchObject({ candidateId: 'sha2', attempt: 2 });
    expect(live(next).qa.stages[0].outcome).toBe('not_run');
  });
  it('fails closed for mismatched evaluator identity, duplicate or missing evidence', () => {
    const events = [candidate('sha1', 1), gate('A00', 'sha1', 2), gate('A01', 'sha1', 3), gate('A02', 'sha1', 4)];
    const mismatch = gate('A02', 'sha1', 4);
    mismatch.payload.result.evaluatorRevision = 'wrong';
    expect(live([...events.slice(0, 3), mismatch]).qa.stages[0].outcome).toBe('error');
    expect(live([...events, gate('A00', 'sha1', 5)]).qa.stages[0].outcome).toBe('error');
    const noLog = gate('A02', 'sha1', 4);
    noLog.payload.result.logArtifactId = '';
    expect(live([...events.slice(0, 3), noLog]).qa.stages[0].outcome).toBe('not_run');
  });
  it('preserves real zero costs but leaves unreported rates and counts unknown', () => {
    const model = createOfficeModel({ ownerReport: { economics: { approvedBudget: 100, reportedSpend: 0, reserved: null, currency: 'EUR' } } }, 'live', null);
    expect(model.finance).toEqual({ budget: 100, spent: 0, reserved: null, currency: 'EUR', burnRate: null });
    expect(model.usage).toBeNull();
    expect(model.errors).toBeNull();
  });
  it('uses readable QA copy without inventing a live failure cause', () => {
    const stage = { id: 'meaning', outcome: 'fail' };
    expect(qaStageCopy(stage, 'demo')).toEqual({ title: 'Chart correctness', headline: 'Rounding is wrong', detail: 'Expected €1.01 · received €1.00 (illustrative)' });
    const real = qaStageCopy(stage, 'live');
    expect(real.headline).toBe('Check failed');
    expect(JSON.stringify(real)).not.toMatch(/rounding|1\.01|1\.00|illustrative/i);
    expect(qaStageCopy({ id: 'provenance', outcome: 'pass' }, 'live')).toMatchObject({ title: 'Scope', headline: 'Scope verified' });
    expect(qaStageCopy({ id: 'regression', outcome: 'pass' }, 'live').headline).toBe('No regressions found');
    expect(qaStageCopy({ id: 'release', outcome: 'error' }, 'live').headline).toBe('Evidence needs attention');
  });
  it('classifies mismatched or duplicate failure evidence as an evidence error', () => {
    const failed = gate('A03', 'sha1', 2, 'fail');
    failed.payload.result.inputHash = 'stale-input';
    expect(live([candidate('sha1', 1), failed]).qa.stages[1].outcome).toBe('error');
    expect(live([candidate('sha1', 1), gate('A03', 'sha1', 2), gate('A03', 'sha1', 3, 'fail')]).qa.stages[1].outcome).toBe('error');
  });
  it('closes exhausted tasks and selects the remaining active task', () => {
    const exhausted = { ...incident, id: 'exhausted', status: 'budget_exhausted', requestedOutcome: { ...incident.requestedOutcome, summary: 'Closed budget task' } };
    const model = createOfficeModel({ incidents: [exhausted, incident] }, 'live', null);
    expect(model.kanban.columns[3].cards[0].id).toBe('exhausted');
    expect(model.engineering.task).toBe('Real chart repair');
  });

});

it('projects owner decisions into the backlog without presenting planning as a shipped feature',()=>{
 const proposals=['plan','change','decline'].map(id=>({id,title:id,category:'feature',status:'proposed'}));
 const model=createOfficeModel({operationsOverview:{proposals},ownerReport:{decisions:[{id:'plan',resolution:{action:'approve_plan',workId:'work'}},{id:'change',resolution:{action:'request_changes'}},{id:'decline',resolution:{action:'reject'}}],decisionWork:[{id:'work',state:'completed'}]}},'live',createDemoState());
 const cards=model.kanban.columns.flatMap(c=>c.cards);
 expect(cards.find(c=>c.id==='plan')).toMatchObject({status:'planning_completed'});
 expect(cards.find(c=>c.id==='change')).toMatchObject({status:'changes_requested'});
 expect(cards.find(c=>c.id==='decline')).toBeUndefined();
 expect(model.kanban.columns.find(c=>c.id==='review')?.cards.map((c:{id:string})=>c.id)).toEqual(['plan','change']);
});
