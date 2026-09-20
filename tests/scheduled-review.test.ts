import { expect, it, vi } from 'vitest';
import { createScheduledReview } from '../server/scheduled-review';
it('still persists the scheduled review after orchestration fails, then respects its next due time', async () => {
  let due = true;
  const actions = { due: () => due, orchestrate: vi.fn().mockRejectedValue(Error('private details')),
    review: vi.fn(async () => { due = false; }), report: vi.fn() };
  const tick = createScheduledReview(actions);
  await tick(); await tick();
  expect(actions.review).toHaveBeenCalledTimes(1);
  expect(actions.orchestrate).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(actions.report.mock.calls)).not.toContain('private details');
});
it('prevents overlapping cycles and releases the lock after a review failure', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const actions = { due: () => true, orchestrate: vi.fn(async () => pending),
    review: vi.fn().mockRejectedValueOnce(Error('failed')).mockResolvedValue(undefined), report: vi.fn() };
  const tick = createScheduledReview(actions);
  const first = tick(); await tick();
  expect(actions.orchestrate).toHaveBeenCalledTimes(1);
  release(); await first; await tick();
  expect(actions.review).toHaveBeenCalledTimes(2);
});
