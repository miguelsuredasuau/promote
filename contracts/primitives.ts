import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
export const SchemaVersion = z.literal(SCHEMA_VERSION);

/** Opaque controller-generated ID. Never a URL or filesystem path. */
export const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'opaque id: letters, digits, . _ : - only');

/** Lowercase hex SHA-256. */
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'expected lowercase hex SHA-256');

/** Full Git object ID (SHA-1 or SHA-256 repositories). Abbreviations are rejected. */
export const GitSha = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, 'expected full lowercase Git object id');

/** UTC ISO-8601 with `Z`. */
export const Timestamp = z.string().datetime({ offset: false });

export const DurationMs = z.number().int().nonnegative();

/** Machine-readable reason code, e.g. `infrastructure_error`. */
export const ReasonCode = z.string().regex(/^[a-z][a-z0-9_]*$/, 'expected snake_case reason code');

/** Repository-relative path; no absolute paths, backslashes or traversal. */
export const RelativePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'), 'expected safe relative path');

/** Where a record came from. Fixtures and replays never count as real runs. */
export const Provenance = z.enum(['live', 'replay', 'fixture']);
export type Provenance = z.infer<typeof Provenance>;
