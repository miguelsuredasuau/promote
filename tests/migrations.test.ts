import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../server/sqlite-migrations.mjs';
import { CONTROLLER_MIGRATIONS } from '../server/controller-schema';
import { ControllerStore } from '../server/store';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const tempDb = () => { const dir = mkdtempSync(join(tmpdir(), 'promote-migrations-')); directories.push(dir); return join(dir, 'test.sqlite'); };
const versions = (db: DatabaseSync) => db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();

describe('sqlite migrations', () => {
  it('applies pending migrations once and records them in order', () => {
    const db = new DatabaseSync(tempDb());
    const first = [{ version: 1, name: 'baseline', sql: 'CREATE TABLE a (id TEXT PRIMARY KEY) STRICT' }];
    expect(migrate(db, first)).toEqual({ applied: ['baseline'], version: 1 });
    expect(migrate(db, first)).toEqual({ applied: [], version: 1 });
    const second = [...first, { version: 2, name: 'add_b', sql: 'CREATE TABLE b (id TEXT PRIMARY KEY) STRICT' }];
    expect(migrate(db, second)).toEqual({ applied: ['add_b'], version: 2 });
    expect(versions(db)).toEqual([{ version: 1, name: 'baseline' }, { version: 2, name: 'add_b' }]);
    db.close();
  });

  it('adopts a database created before migrations existed', () => {
    const path = tempDb();
    const legacy = new DatabaseSync(path);
    legacy.exec(CONTROLLER_MIGRATIONS[0].sql);
    legacy.prepare("INSERT INTO service_state (id, record) VALUES ('x', '{}')").run();
    legacy.close();
    const store = new ControllerStore(path);
    store.close();
    const db = new DatabaseSync(path);
    expect(versions(db)).toEqual([{ version: 1, name: 'baseline' }]);
    expect(db.prepare('SELECT count(*) AS n FROM service_state').get()).toEqual({ n: 1 });
    db.close();
  });

  it('refuses databases newer than the code and rewritten history', () => {
    const db = new DatabaseSync(tempDb());
    migrate(db, [{ version: 1, name: 'baseline', sql: 'CREATE TABLE a (id TEXT) STRICT' }, { version: 2, name: 'two', sql: 'CREATE TABLE b (id TEXT) STRICT' }]);
    expect(() => migrate(db, [{ version: 1, name: 'baseline', sql: '' }])).toThrow('schema_newer_than_code');
    expect(() => migrate(db, [{ version: 1, name: 'renamed', sql: '' }, { version: 2, name: 'two', sql: '' }])).toThrow('migration_history_mismatch');
    expect(() => migrate(db, [{ version: 2, name: 'gap', sql: '' }])).toThrow('invalid_migration');
    db.close();
  });

  it('rolls back a failed migration without recording it', () => {
    const db = new DatabaseSync(tempDb());
    const broken = [{ version: 1, name: 'ok', sql: 'CREATE TABLE a (id TEXT) STRICT' }, { version: 2, name: 'broken', sql: 'CREATE TABLE b (id TEXT) STRICT; CREATE TABLE b (id TEXT) STRICT' }];
    expect(() => migrate(db, broken)).toThrow();
    expect(versions(db)).toEqual([{ version: 1, name: 'ok' }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='b'").get()).toBeUndefined();
    db.close();
  });
});
