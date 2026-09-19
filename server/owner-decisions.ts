import { z } from 'zod';
import { hashCanonical } from '../contracts/hash';

export const OwnerDecisionInput = z.object({
  proposalId: z.string().min(1).max(160),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum(['approve_plan', 'request_changes', 'reject']),
  feedback: z.string().trim().max(2000).default(''),
}).strict().refine(v => v.action !== 'request_changes' || v.feedback.length > 0, 'Explain the requested changes');

/** Bind approval to proposal AND its evidence, not a mutable title or list position. */
export function decisionRevision(proposal: Record<string, unknown>) {
  return hashCanonical(proposal);
}
