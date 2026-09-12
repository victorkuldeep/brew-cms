import { describe, it, expect, beforeEach } from 'vitest';
import {
  chunkText,
  computeChunkHash,
} from '../chunking/chunker.js';
import { DeterministicMockEmbeddingProvider } from '../embedding/mock-provider.js';
import { MemorySemanticIndexAdapter } from '../adapters/semantic/memory-semantic-index.js';
import { SQLiteSemanticIndexAdapter } from '../adapters/semantic/sqlite-semantic-index.js';
import { MariaDbSemanticIndexAdapter } from '../adapters/semantic/mariadb-semantic-index.js';
import { MockContentSourceAdapter } from '../adapters/sources/mock-source.js';
import { DefaultSourceRegistry } from '../registry/source-registry.js';
import { IndexingService } from '../indexing/indexing-service.js';
import { HybridRetrievalService } from '../retrieval/hybrid-retrieval-service.js';
import { CanonicalSourceResolver } from '../resolution/canonical-resolver.js';
import { DatabaseSync } from 'node:sqlite';

describe('Federated Content Intelligence Engine', () => {
  describe('Deterministic Semantic Chunker', () => {
    const longArticle = `
# Enterprise Architecture as Distributed Systems

Distributed enterprise architecture requires intentional boundaries. When designing complex integration fabrics, each component must govern its internal state.

## Core Tenet: Immutable Events

Every mutation emits an immutable domain event. This allows asynchronous audit logging and eventual consistency across autonomous boundaries.

### Event Choreography vs Orchestration

In an event-choreographed topology, participants react to events without a centralized conductor. However, when complex multi-step sagas require compensatory rollbacks, deterministic orchestration engines (such as workflow DAGs) become indispensable.

## Observability and Traceability

Distributed tracing with correlation IDs ensures that every operation across services can be reconstructed in post-incident reviews (RCA).
`;

    it('chunks documents deterministically preserving section headings and bounded sizes', () => {
      const chunks1 = chunkText(longArticle, { targetTokens: 40, maxTokens: 80, minTokens: 15 }, 'Enterprise Architecture');
      const chunks2 = chunkText(longArticle, { targetTokens: 40, maxTokens: 80, minTokens: 15 }, 'Enterprise Architecture');

      expect(chunks1.length).toBeGreaterThan(1);
      expect(chunks1.length).toBe(chunks2.length);

      // Verify determinism of chunk hashes and indexes
      for (let i = 0; i < chunks1.length; i++) {
        expect(chunks1[i].chunkIndex).toBe(i);
        expect(chunks1[i].chunkHash).toBe(chunks2[i].chunkHash);
        expect(chunks1[i].text).toBe(chunks2[i].text);
        expect(chunks1[i].tokenCountEstimate).toBeLessThanOrEqual(120);
      }
    });

    it('returns a single chunk for concise essays within maxTokens threshold', () => {
      const shortText = 'A concise reflection on architectural clarity and deterministic state.';
      const chunks = chunkText(shortText, { maxTokens: 500 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].text).toBe(shortText);
      expect(chunks[0].chunkHash).toBe(computeChunkHash(shortText));
    });
  });

  describe('Embedding Provider Contract', () => {
    it('produces unit-normalized 384-dimensional vectors with identical dimensions for documents and queries', async () => {
      const provider = new DeterministicMockEmbeddingProvider();
      expect(provider.dimensions).toBe(384);

      const docTexts = ['Enterprise integration with CML and TMF 622', 'Agentic workflow orchestration'];
      const docEmbeddings = await provider.embedDocuments(docTexts);
      const queryEmbedding = await provider.embedQuery('How do agents participate in orchestration?');

      expect(docEmbeddings.length).toBe(2);
      expect(docEmbeddings[0].length).toBe(384);
      expect(docEmbeddings[1].length).toBe(384);
      expect(queryEmbedding.length).toBe(384);

      // Verify unit length (L2 norm ~ 1.0)
      const norm = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1.0, 2);
    });
  });

  describe('NON-NEGOTIABLE DATA RULE: Zero Canonical Content in Semantic Index', () => {
    let registry: DefaultSourceRegistry;
    let embeddingProvider: DeterministicMockEmbeddingProvider;
    let memoryIndex: MemorySemanticIndexAdapter;
    let indexingService: IndexingService;

    const sourceId = 'authoritative-vault';
    const contentId = 'essay-deterministic-systems';
    const confidentialBody = 'THIS IS CONFIDENTIAL PROPRIETARY ARCHITECTURAL CONTENT THAT MUST NEVER BE STORED IN THE VECTOR DB';

    beforeEach(() => {
      registry = new DefaultSourceRegistry();
      embeddingProvider = new DeterministicMockEmbeddingProvider();
      memoryIndex = new MemorySemanticIndexAdapter();
      indexingService = new IndexingService(registry, embeddingProvider, memoryIndex);

      const mockAdapter = new MockContentSourceAdapter(sourceId, [
        {
          sourceId,
          contentId,
          revisionId: 'rev-001',
          title: 'Grounding Intelligence in Deterministic Systems',
          canonicalUrl: '/thinking/grounding-intelligence',
          summary: 'Why AI agents must execute inside deterministic policy boundaries.',
          body: confidentialBody,
        },
      ]);
      registry.register(mockAdapter);
    });

    it('strictly indexes vectors and metadata while NEVER storing article body, HTML, or chunk text', async () => {
      const result = await indexingService.indexDocument(sourceId, contentId, 'rev-001');
      expect(result.status).toBe('INDEXED');

      // Inspect raw projections in the semantic index
      const projections = memoryIndex.getAllProjections();
      expect(projections.length).toBe(1);

      const proj = projections[0];
      expect(proj.sourceId).toBe(sourceId);
      expect(proj.contentId).toBe(contentId);
      expect(proj.revisionId).toBe('rev-001');
      expect(proj.embeddingDimensions).toBe(384);

      // NON-NEGOTIABLE ASSERTION 1: Top-level projection does NOT have body or markdown
      expect((proj as any).body).toBeUndefined();
      expect((proj as any).sourceMarkdown).toBeUndefined();
      expect((proj as any).content).toBeUndefined();
      expect((proj as any).html).toBeUndefined();

      // NON-NEGOTIABLE ASSERTION 2: Chunks have ONLY chunkIndex, chunkHash, embedding
      for (const chunk of proj.chunks) {
        expect((chunk as any).text).toBeUndefined();
        expect((chunk as any).body).toBeUndefined();
        expect((chunk as any).chunkText).toBeUndefined();
        expect(chunk.embedding.length).toBe(384);
        expect(chunk.chunkHash).toBeDefined();
      }

      // NON-NEGOTIABLE ASSERTION 3: Full confidential string does not appear in serialized projection
      const serialized = JSON.stringify(proj);
      expect(serialized).not.toContain(confidentialBody);
    });
  });

  describe('Multi-Source Federated Retrieval & Canonical Resolution', () => {
    let registry: DefaultSourceRegistry;
    let embeddingProvider: DeterministicMockEmbeddingProvider;
    let memoryIndex: MemorySemanticIndexAdapter;
    let indexingService: IndexingService;
    let retrievalService: HybridRetrievalService;
    let resolver: CanonicalSourceResolver;

    beforeEach(async () => {
      registry = new DefaultSourceRegistry();
      embeddingProvider = new DeterministicMockEmbeddingProvider();
      memoryIndex = new MemorySemanticIndexAdapter();
      indexingService = new IndexingService(registry, embeddingProvider, memoryIndex);
      retrievalService = new HybridRetrievalService(embeddingProvider, memoryIndex);
      resolver = new CanonicalSourceResolver(registry);

      // Source 1: BrewCMS SQLite Store
      const brewSource = new MockContentSourceAdapter('brewcms-sqlite', [
        {
          sourceId: 'brewcms-sqlite',
          contentId: 'doc-tmf-api',
          revisionId: 'rev-1',
          title: 'TMF 622 Product Ordering and TMF 764 Visualizer',
          canonicalUrl: '/case-studies/tmf-api-visualizer',
          summary: 'Visualizing TM Forum Open APIs for telecommunications orchestration.',
          body: 'Full Markdown content for TMF 622 Product Ordering and TMF 764 architecture visualizer.',
        },
      ]);

      // Source 2: MariaDB Articles Store (e.g. Victor Thinking)
      const mariaSource = new MockContentSourceAdapter('victor-mariadb', [
        {
          sourceId: 'victor-mariadb',
          contentId: 'article-agentic-orchestration',
          revisionId: 'rev-3',
          title: 'Agentic Enterprise Orchestration',
          canonicalUrl: '/thinking/agentic-orchestration',
          summary: 'Governed AI agent workflows and transactional boundaries.',
          body: 'Full canonical essay on agentic systems participating in enterprise orchestration.',
        },
      ]);

      // Source 3: External Documentation Store
      const externalSource = new MockContentSourceAdapter('docs-external', [
        {
          sourceId: 'docs-external',
          contentId: 'guide-cml-compiler',
          revisionId: 'v2.0',
          title: 'CML Domain-Specific Language Compiler',
          canonicalUrl: '/case-studies/cml-compiler',
          summary: 'A declarative syntax compiler producing deterministic AST outputs.',
          body: 'Technical specification of the CML compiler AST pipeline.',
        },
      ]);

      registry.register(brewSource);
      registry.register(mariaSource);
      registry.register(externalSource);

      // Index all 3 sources
      await indexingService.indexDocument('brewcms-sqlite', 'doc-tmf-api', 'rev-1');
      await indexingService.indexDocument('victor-mariadb', 'article-agentic-orchestration', 'rev-3');
      await indexingService.indexDocument('docs-external', 'guide-cml-compiler', 'v2.0');
    });

    it('retrieves content references across 3 disparate sources and resolves canonical source content', async () => {
      // 1. Search returns CONTENT REFERENCES (not article bodies)
      const results = await retrievalService.search({
        query: 'agentic enterprise orchestration',
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      const topResult = results[0];

      // Verifies reference structure
      expect(topResult.sourceId).toBeDefined();
      expect(topResult.contentId).toBeDefined();
      expect(topResult.revisionId).toBeDefined();
      expect(topResult.canonicalUrl).toBeDefined();
      expect(topResult.score).toBeGreaterThan(0);

      // Verifies reference does NOT contain article body
      expect((topResult as any).body).toBeUndefined();

      // 2. Resolver resolves the reference against the authoritative source adapter
      const resolved = await resolver.resolveMany(results);
      expect(resolved.length).toBe(results.length);

      const topResolved = resolved[0];
      expect(topResolved.content).not.toBeNull();
      expect(topResolved.content?.body).toContain('Full canonical essay on agentic systems');
      expect(topResolved.content?.canonicalUrl).toBe('/thinking/agentic-orchestration');
    });

    it('prioritizes exact technical term matches (e.g. CML, TMF 622)', async () => {
      const results = await retrievalService.search({
        query: 'CML compiler',
        limit: 3,
      });

      expect(results.length).toBeGreaterThan(0);
      // Top result should be the CML compiler guide
      expect(results[0].contentId).toBe('guide-cml-compiler');
      expect(results[0].canonicalUrl).toBe('/case-studies/cml-compiler');
    });
  });

  describe('Revision Replacement & Stale Invalidation', () => {
    let registry: DefaultSourceRegistry;
    let embeddingProvider: DeterministicMockEmbeddingProvider;
    let memoryIndex: MemorySemanticIndexAdapter;
    let indexingService: IndexingService;
    let mockAdapter: MockContentSourceAdapter;

    beforeEach(() => {
      registry = new DefaultSourceRegistry();
      embeddingProvider = new DeterministicMockEmbeddingProvider();
      memoryIndex = new MemorySemanticIndexAdapter();
      indexingService = new IndexingService(registry, embeddingProvider, memoryIndex);

      mockAdapter = new MockContentSourceAdapter('portfolio-source', [
        {
          sourceId: 'portfolio-source',
          contentId: 'post-1',
          revisionId: 'rev-1',
          title: 'Initial Draft Title',
          canonicalUrl: '/thinking/post-1',
          body: 'Initial draft content.',
        },
      ]);
      registry.register(mockAdapter);
    });

    it('marks revision 1 as STALE when revision 2 is published and resolves revision 2', async () => {
      // 1. Index revision 1
      await indexingService.indexDocument('portfolio-source', 'post-1', 'rev-1');
      let projections = memoryIndex.getAllProjections();
      expect(projections.find((p) => p.revisionId === 'rev-1')?.indexStatus).toBe('READY');

      // 2. Author updates canonical content to revision 2
      mockAdapter.set({
        sourceId: 'portfolio-source',
        contentId: 'post-1',
        revisionId: 'rev-2',
        title: 'Updated Published Title',
        canonicalUrl: '/thinking/post-1',
        body: 'Updated and refined published content.',
      });

      // 3. Re-index revision 2
      await indexingService.indexDocument('portfolio-source', 'post-1', 'rev-2');

      projections = memoryIndex.getAllProjections();
      const rev1 = projections.find((p) => p.revisionId === 'rev-1');
      const rev2 = projections.find((p) => p.revisionId === 'rev-2');

      expect(rev1?.indexStatus).toBe('STALE');
      expect(rev2?.indexStatus).toBe('READY');

      // 4. Search only returns READY projections
      const retrieval = new HybridRetrievalService(embeddingProvider, memoryIndex);
      const searchResults = await retrieval.search({ query: 'Updated Published Title' });

      expect(searchResults.length).toBe(1);
      expect(searchResults[0].revisionId).toBe('rev-2');
    });
  });

  describe('SQLite Semantic Index Provider', () => {
    it('initializes schema and executes vector upsert and search using SQLite BLOBs', async () => {
      const sqliteDb = new DatabaseSync(':memory:');
      const sqliteIndex = new SQLiteSemanticIndexAdapter(sqliteDb, 384);

      const provider = new DeterministicMockEmbeddingProvider();
      const vec1 = await provider.embedQuery('Distributed database architecture');
      const vec2 = await provider.embedQuery('Baking specialty sourdough bread');

      await sqliteIndex.upsert({
        id: 'doc-sqlite-1',
        sourceId: 'test-src',
        contentId: 'item-1',
        revisionId: 'rev-1',
        canonicalUrl: '/test/1',
        contentHash: 'hash1',
        embeddingModel: 'mock',
        embeddingVersion: '1.0',
        embeddingDimensions: 384,
        indexStatus: 'READY',
        chunks: [
          {
            chunkIndex: 0,
            chunkHash: 'chash1',
            embedding: vec1,
          },
        ],
      });

      await sqliteIndex.upsert({
        id: 'doc-sqlite-2',
        sourceId: 'test-src',
        contentId: 'item-2',
        revisionId: 'rev-1',
        canonicalUrl: '/test/2',
        contentHash: 'hash2',
        embeddingModel: 'mock',
        embeddingVersion: '1.0',
        embeddingDimensions: 384,
        indexStatus: 'READY',
        chunks: [
          {
            chunkIndex: 0,
            chunkHash: 'chash2',
            embedding: vec2,
          },
        ],
      });

      // Search with query vector closest to vec1
      const queryVec = await provider.embedQuery('Distributed systems database');
      const matches = await sqliteIndex.search(queryVec, { limit: 2 });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].contentId).toBe('item-1');

      const status = await sqliteIndex.getStatus();
      expect(status.ready).toBe(true);
      expect(status.chunkCount).toBe(2);
    });
  });

  describe('MariaDB Semantic Index Adapter (Mocked Executor)', () => {
    it('constructs valid SQL DDL and executes native / fallback vector queries', async () => {
      const executedSqls: string[] = [];
      const mockMariaDb = {
        async query(sql: string, _params?: any[]): Promise<[any[], any]> {
          executedSqls.push(sql.trim());
          if (sql.includes('VEC_DISTANCE_COSINE(VEC_FromText')) {
            // Simulate native vector support probe
            return [[{ dist: 0.5 }], null];
          }
          if (sql.includes('SELECT') && sql.includes('semantic_chunks')) {
            return [
              [
                {
                  source_id: 'mariadb-src',
                  content_id: 'art-101',
                  revision_id: 'r1',
                  canonical_url: '/thinking/art-101',
                  chunk_index: 0,
                  distance: 0.15,
                },
              ],
              null,
            ];
          }
          return [[], null];
        },
      };

      const adapter = new MariaDbSemanticIndexAdapter(mockMariaDb, 384);
      await adapter.initSchema();

      // Check DDL statements were executed
      expect(executedSqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS semantic_documents'))).toBe(true);
      expect(executedSqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS semantic_chunks'))).toBe(true);

      // Test search
      const matches = await adapter.search(new Array(384).fill(0.1), { limit: 5 });
      expect(matches.length).toBe(1);
      expect(matches[0].contentId).toBe('art-101');
      expect(matches[0].similarity).toBeCloseTo(0.85, 2);
    });
  });

  describe('Graceful Degradation During Vector Outage', () => {
    it('falls back to lexical keyword retrieval when vector embedding is unavailable', async () => {
      // Mock lexical provider
      const mockLexical = {
        async index(): Promise<void> {},
        async remove(): Promise<void> {},
        async search(): Promise<any[]> {
          return [
            {
              id: 'doc-failover',
              title: 'Failover Architecture in High-Availability Clouds',
              excerpt: 'How systems recover gracefully during transient outages.',
              score: 4.5,
              url: '/architecture/failover',
            },
          ];
        },
      };

      // Fails on query embedding
      const failingEmbeddingProvider = {
        modelId: 'failing-model',
        modelVersion: '1.0',
        dimensions: 384,
        async embedDocuments(): Promise<number[][]> {
          throw new Error('Connection refused to model runtime');
        },
        async embedQuery(): Promise<number[]> {
          throw new Error('Embedding runtime timeout');
        },
      };

      const hybrid = new HybridRetrievalService(failingEmbeddingProvider, undefined, mockLexical);

      // Search should not throw an unhandled error; it gracefully returns lexical matches
      const results = await hybrid.search({ query: 'Failover Architecture' });
      expect(results.length).toBe(1);
      expect(results[0].contentId).toBe('doc-failover');
      expect(results[0].reasons).toContain('Exact keyword match: Failover Architecture in High-Availability Clouds');
    });
  });
});
