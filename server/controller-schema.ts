/** Controller SQLite schema history. Append new migrations; never edit a released one. */
export const CONTROLLER_MIGRATIONS = [
  {
    version: 1,
    name: 'baseline',
    sql: `
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
        canonical_request TEXT NOT NULL, record TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id TEXT NOT NULL REFERENCES incidents(id), record TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(id),
        record TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS inbox (
        source_key TEXT PRIMARY KEY, digest TEXT NOT NULL, record TEXT NOT NULL,
        incident_id TEXT REFERENCES incidents(id), disposition TEXT NOT NULL, received_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS engineering_mandates (id TEXT PRIMARY KEY, record TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS engineering_reservations (
        incident_id TEXT PRIMARY KEY REFERENCES incidents(id), mandate_id TEXT NOT NULL REFERENCES engineering_mandates(id),
        task_hash TEXT NOT NULL, max_acu INTEGER NOT NULL, state TEXT NOT NULL, record TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS service_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL,
        category TEXT NOT NULL, summary TEXT NOT NULL, details TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS service_state (id TEXT PRIMARY KEY, record TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, record TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS proposal_sources (proposal_id TEXT NOT NULL REFERENCES proposals(id), source_key TEXT NOT NULL REFERENCES inbox(source_key), PRIMARY KEY(proposal_id,source_key)) STRICT;
      CREATE TABLE IF NOT EXISTS work_queue (id TEXT PRIMARY KEY, state TEXT NOT NULL, token TEXT, record TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS chat_progress (
        source_key TEXT PRIMARY KEY, run_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
        digest TEXT NOT NULL, record TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS jobs (
        incident_id TEXT PRIMARY KEY REFERENCES incidents(id), state TEXT NOT NULL,
        token TEXT, record TEXT NOT NULL
      ) STRICT;
    `,
  },
] as const;
