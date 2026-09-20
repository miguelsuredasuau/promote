import { z } from 'zod';
import { GitSha, Id, Sha256, Timestamp } from './primitives';
import { Release } from './records';

export { ActiveRelease, ReleaseEnvelope } from './registry-wire.mjs';

/** Producer observations are intentionally not GateResult records. Additional producer fields are retained. */
export const ChatRunRecord = z.object({
  schema: z.literal('xarts-chat/run-record@1'),
  runId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  conversationId: z.string().min(1).max(256),
  startedAt: Timestamp, finishedAt: Timestamp,
  request: z.object({ message: z.string().min(1).max(4000), messageHash: Sha256 }).passthrough(),
  dataset: z.object({ sha256: Sha256.nullable(), nature: z.string() }).passthrough(),
  release: z.object({ kind: z.enum(['baseline', 'promote', 'unresolved']), sourceSha: GitSha.optional(), packageHash: Sha256.optional() }).passthrough(),
  outcome: z.string().min(1),
  agent: z.object({ completion: z.enum(['confirmed', 'missing', 'cancelled']).optional(), usage: z.unknown().optional() }).passthrough(),
  renders: z.array(z.object({ artifact: z.string().regex(/^chart-\d+$/), dataHash: Sha256.nullable().optional(), svgHash: Sha256.nullable().optional() }).passthrough()).max(1000),
  signals: z.array(z.object({ kind: z.enum(['input_error','possible_library_defect','packaging_workaround','tool_delivery_error']), code: z.string(), message: z.string(), recovered: z.boolean() }).passthrough()).max(1000),
}).passthrough();
export type ChatRunRecord = z.infer<typeof ChatRunRecord>;

/** Replaceable sweep output (coverage.json / quality.json). Shapes are checked before the orchestrator reads them. */
export const ChatDiagnostics = z.object({
  summary: z.object({
    total: z.number().int().nonnegative().optional(), fail: z.number().int().nonnegative().optional(), error: z.number().int().nonnegative().optional(),
    release: z.union([z.string().min(1).max(2000), z.object({ shims: z.array(z.object({ id: z.string().min(1).max(200) }).passthrough()).max(1000).optional() }).passthrough()]).nullable().optional(),
  }).passthrough(),
  results: z.array(z.object({ id: z.string().min(1).max(500), status: z.string().min(1).max(50) }).passthrough()).max(10000),
}).passthrough();
export type ChatDiagnostics = z.infer<typeof ChatDiagnostics>;

const FeedbackSubject = z.object({
  runId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), artifact: z.string().regex(/^chart-\d+$/),
  request: z.string(), chartId: z.string(), dataHash: Sha256.nullable(), svgHash: Sha256.nullable(),
  release: z.object({ kind: z.string(), sourceSha: GitSha.optional(), packageHash: Sha256.optional() }).passthrough(),
}).passthrough();
export const ChatFeedback = z.discriminatedUnion('kind', [
  z.object({ schema: z.literal('xarts-chat/feedback@1'), id: z.string().uuid(), at: Timestamp,
    conversationId: z.string(), kind: z.literal('rating'), value: z.enum(['up','down']),
    reasons: z.array(z.string()), note: z.string().max(500), subject: FeedbackSubject }).passthrough(),
  z.object({ schema: z.literal('xarts-chat/feedback@1'), id: z.string().uuid(), at: Timestamp,
    conversationId: z.string(), kind: z.literal('preference'), value: z.enum(['this','previous','same']), note: z.string().max(500),
    chosen: FeedbackSubject.nullable(), rejected: FeedbackSubject.nullable(), tie: z.array(FeedbackSubject).length(2).nullable() }).passthrough(),
]);
