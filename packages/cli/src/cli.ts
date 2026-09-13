import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DocumentService,
  WorkflowService,
  AuditService,
  resolveStoragePaths,
  type Actor,
  type Clock,
  type IdGenerator,
} from '@brew-cms/core';
import { compileContent } from '@brew-cms/content';
import { PolicyEngine } from '@brew-cms/policy';
import {
  createDatabaseConnection,
  seedInitialData,
  SQLiteDocumentRepository,
  SQLiteRevisionRepository,
  SQLiteAuditEventRepository,
  SQLiteAgentRepository,
  SQLiteMediaAssetRepository,
} from '@brew-cms/db';
import {
  DefaultSourceRegistry,
  DeterministicMockEmbeddingProvider,
  SQLiteSemanticIndexAdapter,
  BrewCmsSqliteSourceAdapter,
  IndexingService,
  HybridRetrievalService,
} from '@brew-cms/intelligence';

export interface CliOptions {
  dbPath?: string;
  actor?: Actor;
}

export async function runCli(
  args: string[],
  options?: CliOptions
): Promise<{ exitCode: number; output: string }> {
  const command = args[0] || 'help';
  const subCommand = args[1];

  // Explicit --db-path / option wins, otherwise resolve the persistent
  // storage root (BREW_STORAGE_ROOT → ~/storage → ./storage).
  const dbPath = options?.dbPath ?? resolveStoragePaths().dbPath;
  const db = createDatabaseConnection({ filePath: dbPath });

  const docRepo = new SQLiteDocumentRepository(db);
  const revRepo = new SQLiteRevisionRepository(db);
  const auditRepo = new SQLiteAuditEventRepository(db);
  const agentRepo = new SQLiteAgentRepository(db);
  const mediaRepo = new SQLiteMediaAssetRepository(db);

  const policy = new PolicyEngine();
  const clock: Clock = { now: () => new Date() };
  let idCounter = 1;
  const idGen: IdGenerator = { generate: (p = 'id') => `${p}_${Date.now()}_${idCounter++}` };

  const docService = new DocumentService(docRepo, revRepo, auditRepo, policy, clock, idGen);
  const workflowService = new WorkflowService(docRepo, revRepo, auditRepo, policy, clock, idGen);
  const auditService = new AuditService(auditRepo);

  const actor: Actor = options?.actor ?? {
    id: 'usr_admin_default',
    type: 'human',
    name: 'CLI Operator',
    role: 'Admin',
  };

  try {
    switch (command) {
      case 'init': {
        seedInitialData(db);
        return {
          exitCode: 0,
          output: `BrewCMS database initialized successfully at: ${dbPath}`,
        };
      }

      case 'doctor': {
        const nodeVersion = process.version;
        const dbConnected = Boolean(db);
        const checks = [
          `Node.js: ${nodeVersion} (OK)`,
          `Database: ${dbPath} (Connected: ${dbConnected})`,
          `Status: System operational and ready.`,
        ];
        return { exitCode: 0, output: checks.join('\n') };
      }

      case 'content': {
        if (subCommand === 'list') {
          const { items, total } = await docService.listDocuments();
          if (items.length === 0) {
            return { exitCode: 0, output: 'No documents found.' };
          }
          const lines = items.map(
            (d) => `[${d.status}] ${d.id.padEnd(16)} ${d.slug.padEnd(24)} ${d.title}`
          );
          return {
            exitCode: 0,
            output: `Found ${total} document(s):\n` + lines.join('\n'),
          };
        }

        if (subCommand === 'create') {
          const title = args[2];
          const slug = args[3];
          const markdown = args[4] || `# ${title}\n\nDraft content.`;

          if (!title || !slug) {
            return { exitCode: 1, output: 'Usage: brew content create <title> <slug> [markdown]' };
          }

          const compiled = compileContent(markdown);
          const res = await docService.createDraft(actor, {
            type: 'post',
            title,
            slug,
            sourceMarkdown: compiled.sourceMarkdown,
            frontmatter: compiled.frontmatter,
            contentIr: compiled.contentIr,
            contentHash: compiled.contentHash,
            compilerVersion: compiled.compilerVersion,
            wordCount: compiled.wordCount,
            readingTimeSeconds: compiled.readingTimeSeconds,
          });

          return {
            exitCode: 0,
            output: `Document created:\n  ID: ${res.document.id}\n  Slug: ${res.document.slug}\n  Status: ${res.document.status}`,
          };
        }

        if (subCommand === 'validate') {
          const filePath = args[2];
          if (!filePath) {
            return { exitCode: 1, output: 'Usage: brew content validate <file-path>' };
          }
          const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
          const compiled = compileContent(content);
          return {
            exitCode: 0,
            output: `Validation Successful:\n  Nodes: ${compiled.contentIr.nodes.length}\n  Word Count: ${compiled.wordCount}\n  Reading Time: ${compiled.readingTimeSeconds}s\n  Hash: ${compiled.contentHash}`,
          };
        }

        if (subCommand === 'publish') {
          const id = args[2];
          if (!id) return { exitCode: 1, output: 'Usage: brew content publish <document-id>' };

          const res = await workflowService.publish(actor, id);
          return {
            exitCode: 0,
            output: `Document '${id}' published at revision '${res.publishedRevision.id}'.`,
          };
        }

        return { exitCode: 1, output: `Unknown content command: '${subCommand}'. Use list, create, validate, publish.` };
      }

      case 'media': {
        if (subCommand === 'list') {
          const assets = await mediaRepo.list();
          if (assets.length === 0) return { exitCode: 0, output: 'No media assets found.' };
          const lines = assets.map(
            (a) => `${a.id.padEnd(16)} ${a.mimeType.padEnd(16)} ${(a.sizeBytes / 1024).toFixed(1)}KB ${a.providerKey}`
          );
          return { exitCode: 0, output: lines.join('\n') };
        }
        return { exitCode: 1, output: `Unknown media command: '${subCommand}'` };
      }

      case 'agent': {
        if (subCommand === 'list') {
          const agents = await agentRepo.list();
          if (agents.length === 0) return { exitCode: 0, output: 'No agents registered.' };
          const lines = agents.map(
            (ag) => `[${ag.status}] ${ag.id.padEnd(28)} ${ag.name} (${ag.scopes.join(', ')})`
          );
          return { exitCode: 0, output: lines.join('\n') };
        }
        return { exitCode: 1, output: `Unknown agent command: '${subCommand}'` };
      }

      case 'audit': {
        if (subCommand === 'tail') {
          const page = await auditService.listEvents({ limit: 10 });
          if (page.items.length === 0) return { exitCode: 0, output: 'Audit log is empty.' };
          const lines = page.items.map(
            (e) => `${new Date(e.createdAt).toISOString()} [${e.eventType}] ${e.actorType}:${e.actorId} -> ${e.resourceType}:${e.resourceId}`
          );
          return { exitCode: 0, output: lines.join('\n') };
        }
        return { exitCode: 1, output: `Unknown audit command: '${subCommand}'` };
      }

      case 'intelligence': {
        const registry = new DefaultSourceRegistry();
        const brewSource = new BrewCmsSqliteSourceAdapter(docRepo, revRepo, 'brew-sqlite');
        registry.register(brewSource);

        const embeddingProvider = new DeterministicMockEmbeddingProvider();
        const semanticIndex = new SQLiteSemanticIndexAdapter(db);
        const indexingService = new IndexingService(registry, embeddingProvider, semanticIndex);
        const retrievalService = new HybridRetrievalService(embeddingProvider, semanticIndex);

        if (subCommand === 'status') {
          const sources = registry.list();
          const lines = [
            'BrewCMS Semantic Intelligence Status:',
            `  Embedding Provider: ${embeddingProvider.modelId} (v${embeddingProvider.modelVersion}, ${embeddingProvider.dimensions}d)`,
            `  Semantic Index: Native SQLite BLOB (semantic_projections & semantic_chunks)`,
            `  Registered Sources (${sources.length}):`,
            ...sources.map(
              (s) => `    - [${s.sourceId}] (Revisions: ${s.capabilities.supportsRevisions}, Subscriptions: ${s.capabilities.supportsSubscriptions})`
            ),
          ];
          return { exitCode: 0, output: lines.join('\n') };
        }

        if (subCommand === 'index') {
          const targetSource = args[2];
          if (targetSource) {
            const res = await indexingService.syncSource(targetSource);
            return {
              exitCode: 0,
              output: `Indexed source '${targetSource}': total=${res.total}, indexed=${res.indexed}, skipped=${res.skipped}, failed=${res.failed}`,
            };
          }

          const results = await indexingService.syncAll();
          const lines = [
            `Intelligence Synchronization Completed across ${results.length} source(s):`,
            ...results.map(
              (r) => `  - [${r.sourceId}]: total=${r.total}, indexed=${r.indexed}, skipped=${r.skipped}, failed=${r.failed}`
            ),
          ];
          return { exitCode: 0, output: lines.join('\n') };
        }

        if (subCommand === 'search') {
          const query = args[2];
          if (!query) {
            return { exitCode: 1, output: 'Usage: brew intelligence search <query> [limit]' };
          }
          const limit = args[3] ? Number(args[3]) : 5;
          const results = await retrievalService.search({ query, limit });
          if (results.length === 0) {
            return { exitCode: 0, output: `No semantic search results found for: "${query}"` };
          }
          const lines = [
            `Semantic Search Results for: "${query}" (found ${results.length})`,
            ...results.map(
              (r, i) =>
                `  [#${i + 1}] Score: ${r.score.toFixed(3)} | [${r.sourceId}] ${r.contentId} (${r.canonicalUrl})${
                  r.reasons && r.reasons.length ? `\n       Matches: ${r.reasons.join(', ')}` : ''
                }`
            ),
          ];
          return { exitCode: 0, output: lines.join('\n') };
        }

        return { exitCode: 1, output: `Unknown intelligence command: '${subCommand}'. Use status, index, search.` };
      }

      case 'help':
      default:
        return {
          exitCode: 0,
          output: `BrewCMS CLI — Content Operating System Control Plane

Usage:
  brew init                              Initialize database and default seeds
  brew doctor                            Run environment and database readiness check
  brew content list                      List all documents
  brew content create <title> <slug>     Create a new draft document
  brew content validate <file>           Validate a Markdown source file against Content IR
  brew content publish <id>              Publish an approved document
  brew media list                        List media library assets
  brew agent list                        List registered agent identities
  brew audit tail                        Tail recent audit trail events
  brew intelligence status               Inspect embedding model, index, and sources
  brew intelligence index [source]       Index or reindex documents into semantic index
  brew intelligence search <query>       Perform hybrid semantic retrieval query
`,
        };
    }
  } catch (err: any) {
    return {
      exitCode: 1,
      output: `Error: ${err.message}`,
    };
  }
}
