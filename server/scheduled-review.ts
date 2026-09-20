/** One in-flight cycle; a failed orchestrator must not suppress the review heartbeat. */
export function createScheduledReview(actions: {
  due(): boolean;
  orchestrate(): Promise<unknown>;
  review(): Promise<unknown>;
  report(message: string): void;
}) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      if (!actions.due()) return;
      try { await actions.orchestrate(); }
      catch { actions.report('Orchestration cycle failed; the scheduled review continues'); }
      await actions.review();
    } catch {
      actions.report('Scheduled project review failed; retrying on the next check');
    } finally { running = false; }
  };
}
