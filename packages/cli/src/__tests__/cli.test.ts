import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { runCli } from '../cli.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('BrewCMS Developer CLI', () => {
  const testDb = path.resolve(process.cwd(), '.tmp_cli_test.db');

  function cleanupDb() {
    try {
      if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
    } catch {}
  }

  beforeEach(() => {
    cleanupDb();
  });

  afterAll(() => {
    cleanupDb();
  });

  it('runs brew doctor successfully', async () => {
    const res = await runCli(['doctor'], { dbPath: testDb });
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain('Node.js:');
    expect(res.output).toContain('Connected: true');
  });

  it('runs brew init and seeds database', async () => {
    const res = await runCli(['init'], { dbPath: testDb });
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain('initialized successfully');
  });

  it('creates and lists content through CLI commands', async () => {
    // 1. Init
    await runCli(['init'], { dbPath: testDb });

    // 2. Create content
    const createRes = await runCli(
      ['content', 'create', 'CLI Powered Article', 'cli-article', '# CLI Content\n\nCreated via CLI.'],
      { dbPath: testDb }
    );
    expect(createRes.exitCode).toBe(0);
    expect(createRes.output).toContain('Document created:');
    expect(createRes.output).toContain('cli-article');

    // 3. List content
    const listRes = await runCli(['content', 'list'], { dbPath: testDb });
    expect(listRes.exitCode).toBe(0);
    expect(listRes.output).toContain('cli-article');
    expect(listRes.output).toContain('CLI Powered Article');
  });
});
