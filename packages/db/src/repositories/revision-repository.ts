import type { DatabaseSync } from 'node:sqlite';
import type { Revision, RevisionRepository } from '@brew-cms/core';

export class SQLiteRevisionRepository implements RevisionRepository {
  constructor(private readonly db: DatabaseSync) {}

  async findById(id: string): Promise<Revision | null> {
    const stmt = this.db.prepare('SELECT * FROM revisions WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  async listByDocumentId(documentId: string): Promise<Revision[]> {
    const stmt = this.db.prepare('SELECT * FROM revisions WHERE document_id = ? ORDER BY revision_number DESC');
    const rows = stmt.all(documentId) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  async getLatestByDocumentId(documentId: string): Promise<Revision | null> {
    const stmt = this.db.prepare('SELECT * FROM revisions WHERE document_id = ? ORDER BY revision_number DESC LIMIT 1');
    const row = stmt.get(documentId) as any;
    return row ? this.mapRow(row) : null;
  }

  async create(revision: Omit<Revision, 'createdAt'>): Promise<Revision> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO revisions (
        id, document_id, revision_number, source_markdown,
        frontmatter_json, content_ir_json, content_hash,
        compiler_version, word_count, reading_time_seconds,
        created_by, change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      revision.id,
      revision.documentId,
      revision.revisionNumber,
      revision.sourceMarkdown,
      JSON.stringify(revision.frontmatter),
      JSON.stringify(revision.contentIr),
      revision.contentHash,
      revision.compilerVersion,
      revision.wordCount,
      revision.readingTimeSeconds,
      revision.createdBy,
      revision.changeSummary ?? null,
      now
    );

    return (await this.findById(revision.id))!;
  }

  private mapRow(row: any): Revision {
    return {
      id: row.id,
      documentId: row.document_id,
      revisionNumber: row.revision_number,
      sourceMarkdown: row.source_markdown,
      frontmatter: JSON.parse(row.frontmatter_json),
      contentIr: JSON.parse(row.content_ir_json),
      contentHash: row.content_hash,
      compilerVersion: row.compiler_version,
      wordCount: row.word_count,
      readingTimeSeconds: row.reading_time_seconds,
      createdBy: row.created_by,
      changeSummary: row.change_summary,
      createdAt: new Date(row.created_at),
    };
  }
}
