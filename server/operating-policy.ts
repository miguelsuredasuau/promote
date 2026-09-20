import { z } from 'zod';

export const OperatingPolicy = z.object({
  paused: z.boolean(),
  maxConcurrentSessions: z.number().int().min(1).max(20).default(1),
  reviewMinutes: z.number().int().min(1).max(60),
  totalAcu: z.number().int().min(0).max(10000).default(0),
  dailyAcu: z.number().int().min(0).max(10000),
  sessionAcu: z.number().int().min(1).max(100),
  expiresAt: z.string().datetime(),
  approvedRepairs: z.boolean(),
  proactiveTests: z.boolean(),
  testEveryMinutes: z.number().int().min(15).max(1440),
  testMinutes: z.number().int().min(5).max(120),
  testRepository: z.string().regex(/^[\w.-]+\/[\w.-]+$/).nullable(),
  testFocus: z.string().trim().min(1).max(2000),
}).strict().superRefine((p,ctx)=>{
  if (!p.paused && p.totalAcu < p.sessionAcu) ctx.addIssue({code:'custom',message:'Total ceiling must cover a session'});
  if (!p.paused && p.dailyAcu < p.sessionAcu) ctx.addIssue({code:'custom',message:'Daily ceiling must cover a session'});
  if (p.proactiveTests && !p.testRepository) ctx.addIssue({code:'custom',message:'A verified test repository is required'});
});
export type OperatingPolicy = z.infer<typeof OperatingPolicy>;
export const PolicyUpdate = z.object({revision:z.number().int().nonnegative(),policy:OperatingPolicy}).strict();
export function defaultOperatingPolicy(now=Date.now()): OperatingPolicy {
  return {paused:true,maxConcurrentSessions:1,reviewMinutes:10,totalAcu:0,dailyAcu:0,sessionAcu:5,expiresAt:new Date(now+86400000).toISOString(),
    approvedRepairs:true,proactiveTests:false,testEveryMinutes:60,testMinutes:20,testRepository:null,
    testFocus:'Explore the sandbox as a user: inspect browser console/network errors, exercise chart creation and history, and return reproducible findings with screenshots. Do not change source or use production credentials.'};
}
