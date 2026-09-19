import { z } from 'zod';
import rawCatalog from './gate-catalog.json';
import { GateProfile } from '../../contracts/profile';
import { hashCanonical } from '../../contracts/hash';
import { GitSha, Id, RelativePath, SchemaVersion } from '../../contracts/primitives';

const NonemptyText = z.string().trim().min(1);
const Argv = z.array(NonemptyText).min(1);
export const XartsCatalogEntry = z.object({
  id: Id,
  label: NonemptyText,
  argv: Argv,
  classification: z.enum(['independent', 'consistency', 'regression', 'ratchet', 'smoke']),
  autonomyGateIds: z.array(z.string().regex(/^A(?:0[0-9]|10)$/)).min(1),
  prerequisites: z.array(NonemptyText).min(1),
  oracleIndependence: z.enum(['proven', 'not_independent', 'unreviewed']),
  productionHelpers: z.enum(['yes', 'no', 'unknown']),
  selfTest: Argv.nullable(),
  failureMeaning: NonemptyText,
  limitations: NonemptyText,
  auditBasis: z.literal('source_inspection'),
  sourceFiles: z.array(RelativePath).min(1),
  executionStatus: z.literal('not_run'),
}).strict().superRefine((entry, ctx) => {
  if (new Set(entry.autonomyGateIds).size !== entry.autonomyGateIds.length) {
    ctx.addIssue({ code: 'custom', message: 'duplicate autonomy gate mapping' });
  }
  if (entry.classification === 'independent' &&
      (entry.oracleIndependence !== 'proven' || entry.productionHelpers !== 'no')) {
    ctx.addIssue({ code: 'custom', message: 'independent classification needs proven independence without production helpers' });
  }
});
export type XartsCatalogEntry = z.infer<typeof XartsCatalogEntry>;

export const XartsGateCatalog = z.object({
  schemaVersion: SchemaVersion,
  projectId: z.literal('xarts'),
  sourceRevision: GitSha,
  entries: z.array(XartsCatalogEntry).min(1),
}).strict().superRefine((catalog, ctx) => {
  if (new Set(catalog.entries.map(entry => entry.id)).size !== catalog.entries.length) {
    ctx.addIssue({ code: 'custom', message: 'duplicate catalog id' });
  }
});
export type XartsGateCatalog = z.infer<typeof XartsGateCatalog>;
export const xartsGateCatalog = XartsGateCatalog.parse(rawCatalog);

const ProtectedGate = z.object({
  gateId: Id,
  gateVersion: z.number().int().positive(),
  evaluatorRevision: GitSha,
}).strict();
const ProfileRequest = z.object({
  profileId: Id,
  selectedCatalogIds: z.array(Id).min(1),
  evaluatorRevision: GitSha,
  protectedGates: z.object({ semantic: ProtectedGate, artifact: ProtectedGate }).strict(),
}).strict();
export type XartsProfileRequest = z.infer<typeof ProfileRequest>;

/**
 * Trusted controller configuration only. Never feed candidate, browser, or provider
 * selections here. Identities identify separately provisioned protected evaluators;
 * this builder does not attest their deployment, independence or successful results.
 * Every explicitly selected check is mandatory, even when its oracle is not independent.
 */
export function buildXartsGateProfile(input: XartsProfileRequest): GateProfile {
  const request = ProfileRequest.parse(input);
  if (new Set(request.selectedCatalogIds).size !== request.selectedCatalogIds.length) {
    throw new Error('duplicate catalog selection');
  }
  // Re-parse private imported data: mutation of the exported display copy cannot
  // change the command identity allowlist used to build profiles.
  const catalog = XartsGateCatalog.parse(rawCatalog);
  const known = new Set(catalog.entries.map(entry => entry.id));
  for (const id of request.selectedCatalogIds) {
    if (!known.has(id)) throw new Error(`unknown catalog selection: ${id}`);
  }
  const protectedGates = Object.values(request.protectedGates);
  for (const gate of protectedGates) {
    if (known.has(gate.gateId)) throw new Error('protected gate identity must be distinct from catalog checks');
    if (gate.evaluatorRevision !== request.evaluatorRevision) throw new Error('protected evaluator revision mismatch');
  }
  return GateProfile.parse({
    schemaVersion: 1,
    profileId: `xarts-profile:${hashCanonical({ requestedProfileId: request.profileId, catalog })}`,
    libraryId: 'xarts',
    evaluatorRevision: request.evaluatorRevision,
    gates: [
      ...request.selectedCatalogIds.map(gateId => ({ gateId, gateVersion: 1 })),
      ...protectedGates.map(({ gateId, gateVersion }) => ({ gateId, gateVersion })),
    ].map(gate => ({ ...gate, requirement: 'required', notApplicableAllowed: false })),
  });
}
