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

  it('runs intelligence status, index, and search commands', async () => {
    // 1. Init
    await runCli(['init'], { dbPath: testDb });

    // 2. Intelligence status
    const statusRes = await runCli(['intelligence', 'status'], { dbPath: testDb });
    expect(statusRes.exitCode).toBe(0);
    expect(statusRes.output).toContain('BrewCMS Semantic Intelligence Status:');
    expect(statusRes.output).toContain('Embedding Provider:');
    expect(statusRes.output).toContain('brew-sqlite');

    // 3. Create and publish an article
    const createRes = await runCli(
      [
        'content',
        'create',
        'Federated Content Architecture',
        'federated-content-arch',
        '# Federated Content Architecture\n\nDecoupled semantic retrieval without content duplication.',
      ],
      { dbPath: testDb }
    );
    expect(createRes.exitCode).toBe(0);
    const docIdMatch = createRes.output.match(/ID:\s+(doc_[^\s]+)/);
    expect(docIdMatch).not.toBeNull();
    const docId = docIdMatch![1];

    const pubRes = await runCli(['content', 'publish', docId], { dbPath: testDb });
    expect(pubRes.exitCode).toBe(0);

    // 4. Index source
    const indexRes = await runCli(['intelligence', 'index'], { dbPath: testDb });
    expect(indexRes.exitCode).toBe(0);
    expect(indexRes.output).toContain('Intelligence Synchronization Completed');
    expect(indexRes.output).toContain('indexed=');

    // 5. Search
    const searchRes = await runCli(['intelligence', 'search', 'federated architecture'], { dbPath: testDb });
    expect(searchRes.exitCode).toBe(0);
    expect(searchRes.output).toContain('Semantic Search Results for: "federated architecture"');
    expect(searchRes.output).toContain(docId);
  });
});
