import { createHash } from 'node:crypto';
import { readdir, readFile, lstat, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ChatRunRecord, ChatFeedback } from '../contracts/integration';
import { hashCanonical } from '../contracts/hash';
import type { ControllerStore } from './store';

/** A failed source must not stop independent evidence streams. Error details contain no input text. */
export async function importChatCycle(store: ControllerStore, outbox: string, receiptRoot: string) {
  const failures: { stage: string; reason: string }[] = [];
  async function stage<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    try { return await run(); }
    catch (error) {
      const e = error as { code?: string; message?: string };
      const reason = error instanceof SyntaxError ? 'invalid_json_or_incomplete_write'
        : ['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'SQLITE_BUSY', 'SQLITE_LOCKED'].includes(e?.code ?? '') ? e.code!
        : ['invalid_diagnostics', 'invalid_progress'].includes(e?.message ?? '') ? e.message!
        : e?.message?.includes('history changed') ? 'progress_history_changed' : 'read_or_persistence_failed';
      failures.push({ stage: name, reason });
      return null;
    }
  }
  const records = await stage('outbox', () => importChatOutbox(store, outbox, receiptRoot));
  const diagnostics = await stage('diagnostics', () => importChatDiagnostics(store, dirname(outbox)));
  const progress = await stage('progress', () => importChatProgress(store, dirname(outbox)));
  return { status: failures.length ? 'error' : records?.quarantined ? 'attention' : 'watching',
    configured: true, records, diagnostics, progress, failures };
}

/** Read-only source, durable receiver. No automatic engineering authority is inferred from user feedback. */
export async function importChatOutbox(store: ControllerStore, outbox: string, receiptRoot: string) {
  await mkdir(receiptRoot, { recursive: true });
  const counts = { imported: 0, duplicates: 0, quarantined: 0 };
  const files = (await readdir(outbox)).filter(name => /^[A-Za-z0-9_-]+\.json$/.test(name)).sort();
  for (const file of files) {
    const path = join(outbox, file);
    let receipt: Record<string, unknown>;
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('invalid_file');
      const raw = JSON.parse(await readFile(path, 'utf8'));
      const feedback = raw.schema === 'xarts-chat/feedback@1';
      const record = feedback ? ChatFeedback.parse(raw) : ChatRunRecord.parse(raw);
      const identity = feedback ? (record as { id: string }).id : (record as ChatRunRecord).runId;
      if (file !== `${feedback ? 'feedback-' : ''}${identity}.json`) throw new Error('filename_identity_mismatch');
      if (!feedback) {
        const run = record as ChatRunRecord;
        if (createHash('sha256').update(run.request.message).digest('hex') !== run.request.messageHash) throw new Error('request_hash_mismatch');
      }
      // Hash the original record: even unknown producer fields are immutable on retry.
      const result = store.ingest(`xarts-chat:${file}`, hashCanonical(raw), raw, null);
      counts[result.duplicate ? 'duplicates' : 'imported']++;
      receipt = { schemaVersion: 1, source: file, status: 'received', disposition: 'awaiting_triage', incidentId: result.incidentId };
    } catch {
      counts.quarantined++;
      // Never export raw parser errors/transcripts through the receipt surface.
      receipt = { schemaVersion: 1, source: file, status: 'quarantined', reason: 'invalid_or_conflicting_record' };
    }
    const temp = join(receiptRoot, `${file}.${process.pid}.tmp`);
    await writeFile(temp, JSON.stringify({ ...receipt, observedAt: new Date().toISOString() }) + '\n');
    await rename(temp, join(receiptRoot, file));
  }
  return counts;
}


/** Archive replaceable sweep results under immutable receiver identities. No gate authority. */
export async function importChatDiagnostics(store: ControllerStore, runs: string) {
  let imported = 0;
  for (const kind of ['coverage', 'quality']) {
    const path = join(runs, `${kind}.json`);
    const stat = await lstat(path).catch(() => null);
    if (!stat?.isFile() || stat.size > 16 * 1024 * 1024) continue;
    const raw = JSON.parse(await readFile(path, 'utf8'));
    if (!raw.summary || !Array.isArray(raw.results)) throw new Error('invalid_diagnostics');
    const digest = hashCanonical(raw);
    const snapshot = { schema: 'xarts-chat/quality-snapshot@1', kind, digest,
      summary: `${kind}: ${raw.summary.total ?? '?'} forms, ${raw.summary.fail ?? raw.summary.error ?? '?'} reported failures`,
      observations: raw };
    if (!store.ingest(`xarts-chat:${kind}:${digest}`, digest, snapshot, null).duplicate) imported++;
  }
  return imported;
}

export async function importChatProgress(store: ControllerStore, runs: string) {
  let imported = 0;
  const dirs = (await readdir(runs)).filter(name => /^[0-9TZ]+-[a-f0-9]{8}$/.test(name));
  for (const runId of dirs) {
    const path = join(runs, runId, 'events.jsonl');
    const stat = await lstat(path).catch(() => null);
    if (!stat?.isFile() || stat.size > 16 * 1024 * 1024) continue;
    const lines = (await readFile(path, 'utf8')).split('\n');
    // Incomplete trailing writes are retried at the next poll, never acknowledged early.
    for (let i=0; i<lines.length-1; i++) {
      if (!lines[i]) continue;
      const event = JSON.parse(lines[i]);
      if (event.schema !== 'xarts-chat/progress@1' || event.runId !== runId || typeof event.t !== 'string') throw new Error('invalid_progress');
      if (store.ingestProgress(runId, i+1, hashCanonical(event), event)) imported++;
    }
  }
  return imported;
}
