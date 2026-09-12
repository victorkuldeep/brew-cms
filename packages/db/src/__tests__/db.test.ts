import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseConnection } from '../connection.js';
import { seedInitialData } from '../seed.js';
import { SQLiteDocumentRepository } from '../repositories/document-repository.js';
import { SQLiteRevisionRepository } from '../repositories/revision-repository.js';
import { SQLiteUserRepository } from '../repositories/user-repository.js';
import { SQLiteAgentRepository } from '../repositories/agent-repository.js';
import type { DatabaseSync } from 'node:sqlite';

describe('Database Adapter & SQLite Repositories', () => {
  let db: DatabaseSync;
  let docRepo: SQLiteDocumentRepository;
  let revRepo: SQLiteRevisionRepository;
  let userRepo: SQLiteUserRepository;
  let agentRepo: SQLiteAgentRepository;

  beforeEach(() => {
    db = createDatabaseConnection({ filePath: ':memory:' });
    seedInitialData(db);
    docRepo = new SQLiteDocumentRepository(db);
    revRepo = new SQLiteRevisionRepository(db);
    userRepo = new SQLiteUserRepository(db);
    agentRepo = new SQLiteAgentRepository(db);
  });

  it('initializes schema and seeds default admin and roles', async () => {
    const admin = await userRepo.findByEmail('admin@brewcms.org');
    expect(admin).not.toBeNull();
    expect(admin?.displayName).toBe('BrewCMS Administrator');

    const perms = await userRepo.getUserPermissions(admin!.id);
    expect(perms).toContain('*');
  });

  it('creates and updates document in SQLite', async () => {
    const doc = await docRepo.create({
      id: 'doc_db_1',
      type: 'post',
      slug: 'hello-brew',
      title: 'Hello BrewCMS',
      status: 'DRAFT',
      authorId: 'usr_admin_default',
      publishedRevisionId: null,
      canonicalUrl: null,
      scheduledAt: null,
      seo: { metaTitle: 'SEO Title' },
    });

    expect(doc.id).toBe('doc_db_1');
    expect(doc.slug).toBe('hello-brew');
    expect(doc.seo?.metaTitle).toBe('SEO Title');

    const updated = await docRepo.update('doc_db_1', {
      title: 'Updated Hello BrewCMS',
      status: 'PUBLISHED',
    });

    expect(updated.title).toBe('Updated Hello BrewCMS');
    expect(updated.status).toBe('PUBLISHED');
  });

  it('stores immutable revisions and retrieves latest', async () => {
    await docRepo.create({
      id: 'doc_rev_test',
      type: 'post',
      slug: 'rev-test',
      title: 'Rev Test',
      status: 'DRAFT',
      authorId: 'usr_admin_default',
    });

    const rev1 = await revRepo.create({
      id: 'rev_1',
      documentId: 'doc_rev_test',
      revisionNumber: 1,
      sourceMarkdown: '# Rev 1',
      frontmatter: { version: 1 },
      contentIr: { type: 'root' },
      contentHash: 'hash_1',
      compilerVersion: '1.0.0',
      wordCount: 2,
      readingTimeSeconds: 1,
      createdBy: 'usr_admin_default',
    });

    const rev2 = await revRepo.create({
      id: 'rev_2',
      documentId: 'doc_rev_test',
      revisionNumber: 2,
      sourceMarkdown: '# Rev 2',
      frontmatter: { version: 2 },
      contentIr: { type: 'root' },
      contentHash: 'hash_2',
      compilerVersion: '1.0.0',
      wordCount: 2,
      readingTimeSeconds: 1,
      createdBy: 'usr_admin_default',
    });

    const latest = await revRepo.getLatestByDocumentId('doc_rev_test');
    expect(latest?.id).toBe(rev2.id);
    expect(latest?.revisionNumber).toBe(2);

    const all = await revRepo.listByDocumentId('doc_rev_test');
    expect(all).toHaveLength(2);
    expect(all.some((r) => r.id === rev1.id)).toBe(true);
  });

  it('persists and retrieves agent action runs', async () => {
    const run = await agentRepo.createActionRun({
      id: 'run_test_1',
      actorType: 'agent',
      actorId: 'agent_editorial_assistant',
      action: 'content:create',
      resourceType: 'document',
      resourceId: 'doc_test',
      idempotencyKey: 'key_123',
      policyDecision: 'ALLOW',
      status: 'completed',
      dryRun: false,
      input: { title: 'New Article' },
      output: { id: 'doc_test' },
      error: null,
      completedAt: new Date(),
    });

    expect(run.id).toBe('run_test_1');
    expect(run.policyDecision).toBe('ALLOW');

    const fetched = await agentRepo.getActionRunById('run_test_1');
    expect(fetched?.idempotencyKey).toBe('key_123');
    expect(fetched?.output).toEqual({ id: 'doc_test' });
  });
});
