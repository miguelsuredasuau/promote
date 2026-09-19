// Browser-safe lifecycle table (for display/derivation). Authoritative guards: ./state (server-only).
import { ACTIONABLE_PHASES, type IncidentStatus } from './records';

/** Canonical table from 02-contracts.md. `blocked -> <phase>` is further restricted to the recorded phase. */
export const INCIDENT_TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  received: ['reproducing', 'refused', 'cancelled'],
  reproducing: ['engineering', 'evaluating', 'refused', 'blocked', 'cancelled'],
  engineering: ['evaluating', 'blocked', 'budget_exhausted', 'cancel_pending'],
  evaluating: ['engineering', 'accepted', 'refused', 'blocked', 'budget_exhausted', 'cancelled'],
  accepted: ['releasing', 'blocked', 'cancelled'],
  releasing: ['completed', 'blocked', 'cancelled'],
  cancel_pending: ['cancelled', 'blocked'],
  blocked: [...ACTIONABLE_PHASES, 'cancel_pending', 'cancelled'],
  completed: [],
  refused: [],
  budget_exhausted: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly IncidentStatus[] = ['completed', 'refused', 'budget_exhausted', 'cancelled'];
export const isTerminal = (s: IncidentStatus) => TERMINAL_STATUSES.includes(s);
