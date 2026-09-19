import { expect, it } from 'vitest';
import { DeliveryTask, executionPassed } from '../server/xarts-delivery';
import type { ExecutionEvidence } from '../contracts/adapters';
const evidence: ExecutionEvidence = {runId:'run',planId:'plan',runnerIdentity:'docker-protected-v1',isolation:'container',exitCode:0,outcome:'completed',durationMs:1,
  artifactIds:[`log:${'a'.repeat(64)}`,`output:package:${'b'.repeat(64)}`,`output:manifest:${'c'.repeat(64)}`],startedAt:'2026-09-19T00:00:00Z',finishedAt:'2026-09-19T00:00:01Z'};
it('requires successful isolation, a retained log and every exported artifact',()=>{
 expect(executionPassed(evidence,['package','manifest'])).toBe(true);
 for(const patch of [{isolation:'process'}, {exitCode:1}, {outcome:'timeout'}, {artifactIds:evidence.artifactIds.slice(1)}, {artifactIds:evidence.artifactIds.slice(0,2)}, {artifactIds:[...evidence.artifactIds,evidence.artifactIds[1]]}])
  expect(executionPassed({...evidence,...patch} as ExecutionEvidence,['package','manifest'])).toBe(false);
});
it('rejects unbounded attempts, traversal in chat inputs and unpinned candidates',()=>{
 const task={schemaVersion:1,checkout:'/repo',repo:'owner/repo',candidateSha:'a'.repeat(40),baseSha:'b'.repeat(40),chatRoot:'/chat',runId:'run-1',chartId:'chart-1',registry:'/registry',allowedPaths:['core'],protectedPaths:['docs']};
 expect(DeliveryTask.parse(task).attempt).toBe(1);
 for(const patch of [{attempt:4},{runId:'../outside'},{chartId:'../../secret'},{candidateSha:'main'}])expect(DeliveryTask.safeParse({...task,...patch}).success).toBe(false);
});
