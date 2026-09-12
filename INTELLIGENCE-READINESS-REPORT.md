# BrewCMS Federated Content Intelligence — Readiness Report

**Status:** APPROVED FOR IMPLEMENTATION  
**Date:** 2026-09-12  
**Author:** AI/ML & Distributed Systems Engineering Pair  
**Authoritative Specification:** `.artifacts/brewcms-intelligence-enhancement-artifacts/24-GEMINI-IMPLEMENTATION-PROMPT.md`

---

## 1. Executive Summary

This report documents the architectural inspection and readiness assessment for the **BrewCMS Federated Content Intelligence Enhancement**.

### Core Architectural Principle
> **Canonical content remains in its originating system. The semantic index stores only retrieval references, metadata, hashes, and embeddings. Search returns references; applications resolve canonical content and render it.**

This enhancement is strictly **additive**. It does not replace, migrate, or redesign the existing BrewCMS content operating system or its SQLite/file-backed core storage.

---

## 2. Current Architecture & Codebase Inspection

### 2.1 Workspace Structure
- **Monorepo Manager:** `pnpm` workspaces (v12.4.1) under Node.js v24.
- **Packages (13 packages under `packages/`):**
  - `@brew-cms/core`: Pure domain models, application services (`DocumentService`, `WorkflowService`, `AgentService`, `TaxonomyService`, `AuditService`), and decoupled ports (`DocumentRepository`, `RevisionRepository`, `UserRepository`, `TaxonomyRepository`, `MediaAssetRepository`, `AuditEventRepository`, `AgentRepository`, `SearchProvider`, `MediaProvider`, `PolicyEnginePort`, `EventBus`, `Clock`, `IdGenerator`).
  - `@brew-cms/content`: Unified Markdown parser, frontmatter extractor, Zod-validated Content IR (AST), SHA-256 cryptographic hasher (`computeContentHash`), metrics calculator, HTML renderer, and plain-text extractor (`extractSearchText`).
  - `@brew-cms/db`: SQLite implementation using Node built-in `node:sqlite` (`DatabaseSync`) in WAL mode. Stores documents and immutable revisions.
  - `@brew-cms/search`: `InMemorySearchProvider` implementing the core `SearchProvider` port (lexical token matching with title/topic/tag weighting).
  - `@brew-cms/policy`: Declarative RBAC and policy evaluation engine (`PolicyEngine`).
  - `@brew-cms/events`: In-memory and asynchronous event bus emitting `content.published`, `content.unpublished`, etc.
  - `@brew-cms/auth`: Session verification, API keys, password hashing (`scrypt`).
  - `@brew-cms/media`: Local filesystem and S3/R2 storage adapters.
  - `@brew-cms/api`: Framework-agnostic REST router.
  - `@brew-cms/cli`: Node CLI for document workflow, review, and publishing.
  - `@brew-cms/mcp`: Model Context Protocol server exposing tools for agents.
  - `@brew-cms/client`: TypeScript client SDK.
  - `@brew-cms/ui`: Shared React UI primitives.
- **Apps & Reference Consumers:**
  - `apps/studio`: Reference editorial Next.js Studio.
  - `portfolio` (`D:\Projects\web\portfolio`): Victor Kuldeep portfolio / Thinking archive (`thinking_articles` in MariaDB/MySQL).
  - `coffeediscussions` (`D:\Projects\web\coffeediscussions`): Publication platform (`articles` in MariaDB/MySQL).

### 2.2 Baseline Verification
- All 13 packages compile cleanly (`tsc -b`) with zero errors.
- Vitest suite executes with 100% passing rate (12 test suites, 45 unit tests passed in 2.3s).

---

## 3. Inspected Source Storage Systems

### 3.1 BrewCMS SQLite Canonical Source
- Canonical records live in SQLite `documents` and `revisions` tables (`packages/db/src/connection.ts`).
- Revisions are immutable: `source_markdown`, `content_ir_json`, `content_hash`, `compiler_version`, `word_count`, `reading_time_seconds`.
- When published, `documents.published_revision_id` points to the canonical revision.

### 3.2 Victor Thinking MariaDB/MySQL Canonical Source
- Canonical records live in `portfolio/lib/db.ts` under table `thinking_articles`:
  - Columns: `id`, `slug`, `title`, `topic`, `date`, `reading_time`, `summary`, `content` (LONGTEXT Markdown), `takeaways`, `related_topics`, `publication`, `canonical_url`, `status`.
  - Status: `PUBLISHED` vs `DRAFT`.
  - Content is authored in Markdown.

### 3.3 Coffee Discussions MariaDB/MySQL Canonical Source
- Canonical records live in `coffeediscussions/src/infrastructure/db/schema/index.ts` under table `articles`:
  - Columns: `id`, `slug`, `title`, `dek`, `body` (TEXT Markdown), `status`, `publishedAt`, `authorId`, `heroImageId`, `readingTimeMinutes`, `featured`, `canonicalUrl`.
  - Authors, topics, series are normalized across relational tables.

---

## 4. Reusable Abstractions & Building Blocks

1. **`extractSearchText(contentIr)`** (`@brew-cms/content/renderer/text.js`):
   - Extracts plain, clean text from structured nodes without markdown syntax or HTML tags.
   - Ideal for generating normalized `textForEmbedding` from any content without saving chunk text.
2. **`computeContentHash(...)`** (`@brew-cms/content/compiler/hasher.js`):
   - Cryptographic SHA-256 hash across content components.
   - Directly re-usable for detecting whether a document's semantic projection is stale or unchanged.
3. **`EventBus`** (`@brew-cms/core/ports/services.js`):
   - Decoupled event publishing for `content.published`, `content.unpublished`, allowing asynchronous indexing without stalling publication.
4. **`SearchProvider`** (`@brew-cms/core/ports/services.js`):
   - Serves as the lexical retrieval port for hybrid search fusion.

---

## 5. Enhancement Architecture: `@brew-cms/intelligence`

We introduce a dedicated modular package `@brew-cms/intelligence` adhering to strict port-and-adapter architecture.

```text
CANONICAL SOURCES
(BrewCMS SQLite, MariaDB Thinking Articles, MariaDB Coffee Articles, Future Sources)
       │
       ▼
ContentSourceAdapters (BrewCMSSqliteSourceAdapter, MariaDbArticleSourceAdapter)
       │
       ▼
IndexableContent (Transient Normalized Text + Metadata + Content Hash)
       │
       ▼
Deterministic Semantic Chunking (600–900 tokens, structured boundaries)
       │
       ▼
EmbeddingProvider (Transformers.js: Xenova/bge-small-en-v1.5, 384 dims, CPU inference)
       │
       ▼
SemanticIndexProvider (MariaDB 11.8 native VECTOR / Memory / SQLite fallback)
[STORES ONLY: sourceId, contentId, revisionId, chunkIndex, contentHash, modelMetadata, vector]
[STORES ZERO ARTICLE BODIES / ZERO CHUNK TEXT]
       ▲
       │ Query Vector (same Xenova/bge-small-en-v1.5 model)
HybridRetrievalService
(Lexical Score + Vector Cosine Distance -> Reciprocal Rank / Weighted Fusion -> Deduplication by Canonical Content)
       │
       ▼
Content References ([sourceId, contentId, revisionId, canonicalUrl, score])
       │
       ▼
CanonicalSourceResolver -> SourceRegistry -> ContentSourceAdapter.getContent()
       │
       ▼
Consumer UI Composition (Victor Thinking / Coffee Discussions)
```

### 5.1 Core Ports & Contracts

#### `ContentSourceAdapter`
```typescript
export interface ContentSourceAdapter {
  readonly sourceId: string;
  readonly capabilities: { supportsRevisions: boolean; supportsSubscriptions: boolean };
  getContent(ref: ContentReference): Promise<CanonicalContent | null>;
  getRevision?(ref: ContentRevisionReference): Promise<CanonicalContentRevision | null>;
  getIndexableContent(ref: ContentReference): Promise<IndexableContent | null>;
  listIndexableReferences(options?: { cursor?: string; limit?: number }): Promise<{
    items: ContentReference[];
    nextCursor?: string;
  }>;
}
```

#### `SourceRegistry`
Maps `sourceId -> ContentSourceAdapter` with safe registration, lookup, and iteration.

#### `EmbeddingProvider`
```typescript
export interface EmbeddingProvider {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly dimensions: number;
  embedDocuments(texts: readonly string[]): Promise<readonly number[][]>;
  embedQuery(text: string): Promise<readonly number[]>;
}
```
Baseline: `Xenova/bge-small-en-v1.5`, 384 dimensions. Singleton lazy model loading, bounded batching, CPU execution.

#### `SemanticIndexProvider`
```typescript
export interface SemanticIndexProvider {
  readonly providerId: string;
  upsert(projection: SemanticDocumentProjection): Promise<void>;
  search(queryVector: readonly number[], options?: SemanticSearchOptions): Promise<SemanticMatch[]>;
  markStale(sourceId: string, contentId: string, revisionId?: string): Promise<void>;
  delete(sourceId: string, contentId: string): Promise<void>;
  getStatus(): Promise<SemanticIndexStatus>;
}
```

### 5.2 Non-Negotiable Storage Rule
**NO FULL CONTENT IN THE SEMANTIC INDEX:**
- `semantic_documents`: `id`, `source_id`, `content_id`, `revision_id`, `canonical_url`, `content_hash`, `embedding_model`, `embedding_version`, `embedding_dimensions`, `index_status`, `created_at`, `updated_at`.
- `semantic_chunks`: `id`, `semantic_document_id`, `chunk_index`, `chunk_hash`, `embedding` (VECTOR(384)), `created_at`.
- Neither table contains `markdown`, `html`, `body`, or `chunk_text`.
- Chunks exist solely for vector indexing and cosine matching. Once embedded, the text is discarded from memory.

---

## 6. Hybrid Search & Ranking

### 6.1 Hybrid Retrieval Flow
1. **Query Normalization:** Clean tokens, preserve key technical exact matches (e.g. `CML`, `TMF 622`, `TMF 764`, `RCA`, `DAG`, `LWC`, `Agentforce`).
2. **Lexical Retrieval:** Keyword matching against indexed metadata/titles.
3. **Semantic Vector Retrieval:** Query embedded with `Xenova/bge-small-en-v1.5` -> Cosine similarity search against vector index.
4. **Candidate Fusion & Score Normalization:**
   - Normalizes lexical and semantic scores into $[0, 1]$.
   - Fuses with deterministic weighting:
     $$\text{Score} = 0.55 \cdot S_{\text{semantic}} + 0.30 \cdot S_{\text{keyword}} + 0.10 \cdot S_{\text{topic}} + 0.05 \cdot S_{\text{recency}}$$
5. **Canonical Deduplication:**
   - Multiple chunks matching the same canonical document collapse into one entry (keeping the strongest semantic chunk score).
6. **Reference Emission:** Emits `SearchResultReference` with `sourceId`, `contentId`, `revisionId`, `canonicalUrl`, `score`.
7. **Resolution:** UI resolves references against originating source adapter to render actual canonical content.

---

## 7. MariaDB 11.8.9 Integration Strategy

- Target database: `11.8.9-MariaDB-log`.
- MariaDB 11.8 introduced native `VECTOR(dim)` column type and `VEC_DISTANCE_COSINE(v1, v2)` function.
- All MariaDB-specific SQL is strictly contained within `MariaDbSemanticIndexAdapter`.
- Application and domain services contain **ZERO** direct SQL.
- A memory/SQLite vector adapter is provided for hermetic offline testing and environments without native vector extensions.

---

## 8. Risks, Unknowns, and Mitigations

| Risk / Unknown | Impact | Mitigation |
| :--- | :--- | :--- |
| **Transformers.js model size (~130MB ONNX)** | Cold start latency & disk usage | Cache model locally in `.cache/transformers`; load once per process (singleton pattern); lazy initialize on first embed call. |
| **Hostinger CPU/Memory Limits** | Out-of-memory or high CPU spikes during bulk indexing | Bounded concurrency (batch size $\le 4-8$ chunks per forward pass); asynchronous queue/job runner with backoff. |
| **MariaDB Vector Syntax Variations** | Syntax error on untested DDL | Guard MariaDB vector operations with runtime feature-detection query; provide memory/fallback adapter for test suites. |
| **Outage of Source DB** | Search results fail to resolve | Graceful degradation: search returns valid references with available metadata; source outage reports a clean unavailable status rather than crashing. |
| **Data Duplication Leak** | Storing content in vector DB | Automated contract test explicitly querying semantic tables and asserting that no column contains full article markdown, html, or chunk text. |

---

## 9. Migration & Deployment Safety

- **BrewCMS SQLite:** 0 changes to existing SQLite schema or tables. 100% backward compatible.
- **MariaDB Production:** Strictly additive DDL (`CREATE TABLE IF NOT EXISTS semantic_documents`, `CREATE TABLE IF NOT EXISTS semantic_chunks`). Existing `thinking_articles` and `articles` tables remain completely untouched.
- **Git Discipline:** No commits or pushes without explicit user instruction.

---

## 10. Verification & Test Plan

1. **Unit Tests:**
   - Deterministic semantic chunker (verifying bounded sizes, heading preservation, deterministic chunk hashes).
   - Content normalization and cryptographic hashing.
   - Reciprocal Rank Fusion / Deterministic hybrid ranker.
   - Deduplication (multi-chunk collapse to single canonical document).
   - Source registry lifecycle.
2. **Contract Tests:**
   - `ContentSourceAdapter` test suite against `BrewCMSSqliteSourceAdapter` and `MariaDbArticleSourceAdapter`.
   - `SemanticIndexProvider` test suite against `MemorySemanticIndexAdapter` and `MariaDbSemanticIndexAdapter`.
3. **Multi-Source Retrieval Integration Test:**
   - Multiple disparate sources (SQLite + MariaDB) indexed into a single semantic index; single hybrid query retrieves and fuses results across both sources.
4. **No-Duplication Invariant Test:**
   - Inspects all records in the semantic index; asserts that full body text, markdown, HTML, and chunk text are NOT persisted.
5. **Revision Replacement Test:**
   - Publishing revision 2 marks revision 1 projection as stale, verifies query returns revision 2 reference.
6. **Graceful Degradation Test:**
   - Simulates embedding failure or semantic index outage; verifies keyword retrieval functions independently without failing publication.

---

## 11. Readiness Declaration

All prerequisites have been inspected and satisfied:
- [x] Complete repository inspected.
- [x] All `.artifacts` and new enhancement artifacts read and understood.
- [x] `24-GEMINI-IMPLEMENTATION-PROMPT.md` established as authoritative specification.
- [x] Test runner and package builds verified 100% clean (12 suites, 45 tests passing).
- [x] Non-negotiable data rules and architectural boundaries mapped.

**Ready to proceed to Phase 1: Implementation of Core Intelligence Contracts.**
