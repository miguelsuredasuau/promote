/**
 * Ordered, forward-only SQLite migrations recorded in `schema_migrations`.
 * Migrations are never edited once released; add a new one instead.
 * @typedef {{ version: number, name: string, sql: string }} Migration
 */

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {readonly Migration[]} migrations
 * @returns {{ applied: string[], version: number }}
 */
export function migrate(db, migrations) {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1 || !/^[a-z0-9_-]+$/.test(m.name)) throw new Error(`invalid_migration:${m.version}:${m.name}`);
  });
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
  const rows = /** @type {{version:number,name:string}[]} */ (db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all());
  const current = rows.at(-1)?.version ?? 0;
  if (current > migrations.length) throw new Error(`schema_newer_than_code:${current}>${migrations.length}`);
  for (const row of rows) {
    if (migrations[row.version - 1].name !== row.name) throw new Error(`migration_history_mismatch:${row.version}:${row.name}`);
  }
  const applied = [];
  const insert = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
  for (const m of migrations.slice(current)) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.sql);
      insert.run(m.version, m.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    applied.push(m.name);
  }
  return { applied, version: migrations.length };
}
