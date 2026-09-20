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

/** Escalate product direction, not the volume of technical findings.
 * This projection never grants spending, merge or release authority.
 */
export function ownerAttention(proposal: {category:string;title:string}) {
  if(proposal.category!=='feature')return false;
  return /\b(pricing|subscription|monetiz\w*|new market|new audience|pivot|replace|migrat\w*|framework|platform|billing|paid plan|redesign|rebrand|precios|suscripci[oó]n|nuevo mercado|migrar|redise[nñ]ar)\b/i.test(proposal.title);
}
export function decisionBrief(proposal:{category:string;title:string}) {
  const request=proposal.title.replace(/^(Feature request:|Investigate:|Review)\s*/i,'').trim();
  return {
    title:request.charAt(0).toUpperCase()+request.slice(1),
    question:'Should we explore this direction?',
    why:'This could change what the product offers or how people use it. Your direction matters before we invest in it.',
    recommendation:'Explore the idea first. Compare the benefit, effort and alternatives before committing to implementation.',
    current:'Keep the current product direction',
    proposed:request,
    consequence:'The team prepares a comparison. This choice does not launch paid engineering or publish a change.',
  };
}
