import { z } from 'zod';
import { GitSha, Id, ReasonCode, SchemaVersion, Timestamp } from './primitives';
import { BudgetObservation, Candidate, Decision, GateResult, IncidentStatus, SessionState } from './records';

export const EVENT_TYPES = [
  'incident.received',
  'incident.transitioned',
  'baseline.observed',
  'dispatch.pending',
  'session.created',
  'session.observed',
  'candidate.received',
  'gate.started',
  'gate.finished',
  'feedback.sent',
  'decision.pending',
  'decision.recorded',
  'release.started',
  'release.activated',
  'artifact.created',
  'budget.observed',
  'incident.blocked',
  'incident.refused',
  'incident.completed',
  'control.paused',
  'control.resumed',
  'cancel.requested',
  'cancel.confirmed',
] as const;
export const EventType = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventType>;

export const EventActor = z.union([
  z.enum(['controller', 'policy', 'harness_adapter', 'library_adapter', 'runner', 'evaluator']),
  z.string().regex(/^human:.+/, 'human actors are `human:<id>`'),
]);

const Loose = z.record(z.unknown());

/** Typed payloads for events other workers depend on; the rest are open records. */
export const EVENT_PAYLOADS: Partial<Record<EventType, z.ZodTypeAny>> = {
  'dispatch.pending': z.object({ operationId: Id, harnessId: Id }).passthrough(),
  'session.created': z.object({ operationId: Id, remoteSessionId: z.string().min(1) }).passthrough(),
  'session.observed': z
    .object({
      remoteSessionId: z.string().min(1),
      state: SessionState,
      /** Provider-reported time if any; controller observation time is `occurredAt`. */
      providerTime: Timestamp.nullable(),
    })
    .passthrough(),
  'candidate.received': z.object({ candidate: Candidate }).strict(),
  'gate.started': z.object({ gateId: Id, gateVersion: z.number().int().positive(), candidateSha: GitSha }).passthrough(),
  'gate.finished': z.object({ result: GateResult }).strict(),
  'decision.pending': z.object({ decision: Decision }).strict(),
  'decision.recorded': z.object({ decision: Decision }).strict(),
  'budget.observed': z.object({ observation: BudgetObservation }).strict(),
  'incident.blocked': z.object({ fromStatus: IncidentStatus, reason: ReasonCode }).passthrough(),
  'incident.refused': z.object({ reason: ReasonCode }).passthrough(),
};

export const WorkshopEvent = z
  .object({
    eventId: Id,
    sequence: z.number().int().positive(),
    schemaVersion: SchemaVersion,
    type: EventType,
    incidentId: Id,
    attemptId: Id.optional(),
    occurredAt: Timestamp,
    actor: EventActor,
    payload: Loose,
  })
  .strict()
  .superRefine((e, ctx) => {
    const schema = EVENT_PAYLOADS[e.type];
    if (!schema) return;
    const r = schema.safeParse(e.payload);
    if (!r.success) {
      for (const issue of r.error.issues) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payload', ...issue.path], message: issue.message });
      }
    }
  });
export type WorkshopEvent = z.infer<typeof WorkshopEvent>;

/** Shared live/replay reducer shape: the same reducer powers both views. */
export type EventReducer<S> = (state: S, event: WorkshopEvent) => S;

export interface Folded<S> {
  state: S;
  lastSequence: number;
}

/**
 * Applies events in sequence order, skipping already-applied sequences
 * (SSE is at-least-once). Does not detect gaps; callers reload a snapshot.
 */
export function foldEvents<S>(reducer: EventReducer<S>, start: Folded<S>, events: readonly WorkshopEvent[]): Folded<S> {
  let { state, lastSequence } = start;
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (e.sequence <= lastSequence) continue;
    state = reducer(state, e);
    lastSequence = e.sequence;
  }
  return { state, lastSequence };
}
