import { z } from 'zod';

export const Proposal = z.object({
  id:z.string().min(1),category:z.enum(['bug','feature','feedback','infrastructure']),
  title:z.string().min(1).max(500),priority:z.number().int().min(0).max(100),
  evidenceKey:z.string().min(1),nextAction:z.string().min(1),
}).strict();
export type Proposal = z.infer<typeof Proposal>;

export const WorkItem = z.object({
  id:z.string().min(1),kind:z.enum(['proposal_assessment','candidate_review','engineering_dispatch']),
  role:z.enum(['product','feedback','qa','engineer']),lane:z.enum(['reliability','discovery']),
  priority:z.number().int().min(0).max(100),payload:z.record(z.unknown()),promptHash:z.string().length(64),
}).strict();
export type WorkItem = z.infer<typeof WorkItem>;
