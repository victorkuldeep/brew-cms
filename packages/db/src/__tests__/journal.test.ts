import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createDatabaseConnection } from '../connection.js';

describe('SQLite journal safety', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brew-journal-'));
    file = path.join(dir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recovers uncheckpointed WAL content when reopening in DELETE mode', () => {
    // Simulate a crashed WAL-mode session: a separate process writes and
    // exits abruptly, leaving committed frames stranded in the -wal file.
    // (The child exits non-zero by design — that IS the simulated crash.)
    const escaped = file.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    try {
      execFileSync(
        process.execPath,
        [
          '-e',
          `const {DatabaseSync}=require('node:sqlite');` +
            `const db=new DatabaseSync('${escaped}');` +
            `db.exec('PRAGMA journal_mode=WAL;` +
            `CREATE TABLE t(id TEXT PRIMARY KEY,v TEXT);` +
            `INSERT INTO t VALUES(\\'a\\',\\'hello\\');');` +
            `process.exit(1);`,
        ],
        { stdio: 'ignore' }
      );
      expect.unreachable('crash-simulating child should exit non-zero');
    } catch (err: any) {
      expect(err?.status).toBe(1);
    }
    expect(fs.existsSync(file + '-wal')).toBe(true);

    // Reopen with package defaults (DELETE) — committed data must survive
    const db = createDatabaseConnection({ filePath: file });
    const row = db.prepare(`SELECT v FROM t WHERE id = 'a'`).get() as
      | { v: string }
      | undefined;
    expect(row?.v).toBe('hello');
    db.close();
  });

  it('keeps a fresh database in a single file without WAL artifacts', () => {
    const db = createDatabaseConnection({ filePath: file });
    db.exec(
      `INSERT INTO users (id, email, display_name, status, created_at, updated_at)
       VALUES ('u1', 'a@b.c', 'T', 'active', 'x', 'x')`
    );
    db.close();

    expect(fs.existsSync(file + '-wal')).toBe(false);

    const db2 = createDatabaseConnection({ filePath: file });
    const row = db2.prepare(`SELECT email FROM users WHERE id = 'u1'`).get() as
      | { email: string }
      | undefined;
    expect(row?.email).toBe('a@b.c');
    db2.close();
  });
});
