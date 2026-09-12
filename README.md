# BrewCMS

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15%20App%20Router-black.svg)](https://nextjs.org/)
[![Node.js 22](https://img.shields.io/badge/Node.js-22%20LTS-green.svg)](https://nodejs.org/)
[![Pluggable Storage](https://img.shields.io/badge/Storage-SQLite%20·%20PostgreSQL%20·%20MySQL-blue.svg)](docs/architecture.md)
[![Model Context Protocol](https://img.shields.io/badge/AI-MCP%20Ready-purple.svg)](https://modelcontextprotocol.io/)

> **An open-source, database-agnostic Content Control Plane for modern web applications.**  
> *Immutable revisions · governed publishing · agent-ready operations.*

---

## What is BrewCMS?

BrewCMS is not a website builder, an AI chatbot, or a WordPress clone.

WordPress made publishing accessible. Headless CMS platforms (Sanity, Contentful, Strapi) separated content from presentation but introduced SaaS lock-in, vendor bills, and latency. **BrewCMS takes the next architectural step:** content becomes a governed, versioned, database-agnostic control plane with local-first and enterprise storage adapters.

```
       Apps (Next.js Studio, Custom Frontends)
                         ↓
  Interfaces (REST API /v1, Brew CLI, MCP Server)
                         ↓
               Application Services
                         ↓
                 Domain Core (Pure)
                         ↓
                    Domain Ports
                         ↓
        Adapters (SQLite, Postgres, MySQL, Media, Search, Events)
```

### Architectural Pillars

* **Pluggable Storage Architecture**: Hexagonal storage port decoupled from domain logic. Supports zero-dependency in-process SQLite (Node.js 22 native `node:sqlite` WAL mode) for <0.2ms local query latency and zero daemon overhead, alongside PostgreSQL and MySQL adapters for distributed clusters.
* **Deterministic Content Kernel**: Markdown + Frontmatter parsed into versioned Content Intermediate Representation (IR). Cryptographic content hashing (`SHA-256`) ensures reproducibility.
* **Immutable Revisions**: Historical revisions are never mutated. Published documents point to explicit revision snapshots.
* **Explicit Editorial Workflow**: Controlled state machine: `DRAFT` → `IN_REVIEW` → `APPROVED` → `SCHEDULED` / `PUBLISHED` → `ARCHIVED`.
* **Bounded Agent Autonomy**: AI agents discover capabilities, draft, search, and propose changes. Publishing, unpublishing, and destructive operations require human approval gates.
* **Model Context Protocol (MCP)**: Native MCP adapter exposing tools (`brew_*`) and resources (`brew://*`) that call the same application services as humans.

---

## 📖 Comprehensive Documentation

Deep-dive documentation guides are available in the [`docs/`](./docs) directory:

* 📐 [**Systems Architecture & Topology**](./docs/architecture.md) — Pure Domain Kernel, Deterministic Content IR, In-Process SQLite WAL.
* 🚀 [**Getting Started Guide**](./docs/getting-started.md) — Embedded integration into Next.js 15, container setup, route handlers.
* 🤖 [**AI Agents & Model Context Protocol (MCP)**](./docs/mcp-server.md) — Bounded agent tools, Claude Desktop / Cursor setup, human approval gates.
* 📡 [**REST API Reference**](./docs/api-reference.md) — Endpoints for documents, media uploads, taxonomy, and agent proposals.
* ✍️ [**Studio Editorial Guide**](./docs/studio-guide.md) — Publishing lifecycles, Markdown editor, immutable revisions, and visual diffs.

---

## Two Operating Modes

BrewCMS is uniquely engineered to run in **two flexible deployment topologies**:

### Mode A: Embedded In-Process (The Flagship Pattern)
Embed BrewCMS directly inside your existing Next.js App Router project:
* **Zero SaaS Dependencies**: Runs entirely in-process within your web application.
* **Zero Network Latency**: Server Components query the SQLite B-tree in **<0.2 ms** with zero HTTP serialization.
* **Hostinger & Shared Hosting Friendly**: Uses **zero extra webapp slots** and requires **no subdomains**.
* **Flagship Case Studies**:
  * [**CoffeeDiscussions**](https://github.com/victorkuldeep/coffeediscussions) — Multi-author editorial magazine. Studio embedded at `/admin/cms`.
  * [**VictorKuldeep Portfolio**](https://github.com/victorkuldeep/portfolio) — Personal engineering essays and case studies. Studio embedded at `/admin/cms`.

### Mode B: Standalone Headless Control Plane
Run `apps/studio` as an independent web application (e.g. at `http://localhost:3001` or `https://cms.yourdomain.com`):
* Serves the editorial UI for writers.
* Provides the public REST API (`/api/v1/documents`) consumed by external frontends via `@brew-cms/client`.
* Hosts the MCP server for AI coding agents.

---

## Quick Start (Monorepo)

### Prerequisites
* **Node.js**: `20.x` or `22.x` (Node.js 22 recommended for built-in `node:sqlite`)
* **Package Manager**: `pnpm` (version 9 or 10)

### 1. Clone & Install
```bash
git clone https://github.com/victorkuldeep/brew-cms.git
cd brew-cms

# Install dependencies across all monorepo packages
pnpm install
```

### 2. Verify Compilation & Test Suite
```bash
# Typecheck all packages and apps (tsc -b)
pnpm typecheck

# Run full Vitest suite (12 test suites, 45 passing tests)
pnpm test

# Build all packages
pnpm build
```

### 3. Launch the Studio
```bash
# Starts the Next.js App Router Studio on port 3001
pnpm --filter @brew-cms/studio run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser:
* **Editorial Studio**: Write markdown, view real-time HTML previews, manage revisions, and publish documents.
* **Media Library**: Catalog checksummed digital assets with safe MIME validation.
* **Taxonomy**: Manage hierarchical topics, freeform tags, and ordered narrative series.
* **Agents & Approvals**: Inspect agent execution queues, policy decisions, and approve/reject actions.
* **Audit Trail**: Append-only log of all operations.

---

## Monorepo Packages

| Package | Path | Description |
| :--- | :--- | :--- |
| **`@brew-cms/core`** | [`packages/core`](packages/core) | Pure domain entities, ports, and application services (`DocumentService`, `WorkflowService`, etc.). Zero dependencies. |
| **`@brew-cms/db`** | [`packages/db`](packages/db) | Drizzle schemas and native `node:sqlite` repository implementations with WAL mode. |
| **`@brew-cms/content`** | [`packages/content`](packages/content) | Content IR, AST parser, Markdown compiler, SHA-256 hasher, reading time calculator. |
| **`@brew-cms/policy`** | [`packages/policy`](packages/policy) | RBAC and AI agent governance policy engine (`ALLOW`, `DENY`, `REQUIRE_APPROVAL`). |
| **`@brew-cms/events`** | [`packages/events`](packages/events) | In-memory and persistent domain event bus. |
| **`@brew-cms/auth`** | [`packages/auth`](packages/auth) | Cryptographic password hashing, session tokens, and scoped API key verification. |
| **`@brew-cms/media`** | [`packages/media`](packages/media) | Local filesystem and S3/R2 compatible media providers with magic-byte validation. |
| **`@brew-cms/search`** | [`packages/search`](packages/search) | In-memory search indexer and deterministic recommendation engine. |
| **`@brew-cms/api`** | [`packages/api`](packages/api) | Framework-agnostic REST API router, OpenAPI spec, and idempotency store. |
| **`@brew-cms/mcp`** | [`packages/mcp`](packages/mcp) | Model Context Protocol server exposing tools (`brew_*`) and resources for AI agents. |
| **`@brew-cms/client`** | [`packages/client`](packages/client) | Type-safe SDK with Next.js ISR cache support (`next: { revalidate: 60 }`). |
| **`@brew-cms/cli`** | [`packages/cli`](packages/cli) | Command-line interface (`brew`) for document drafting, publishing, and database seeding. |
| **`@brew-cms/ui`** | [`packages/ui`](packages/ui) | Warm editorial design system tokens and status badges. |

---

## How to Embed BrewCMS into Any Next.js App

To give any Next.js 15 App Router application an embedded editorial control plane:

### 1. Initialize the CMS Container
Create `src/cms/container.ts` (or `lib/cms/container.ts`):
```typescript
import { DocumentService, WorkflowService, AgentService, AuditService, TaxonomyService } from '@brew-cms/core';
import { createDatabaseConnection, seedInitialData, SQLiteDocumentRepository, SQLiteRevisionRepository } from '@brew-cms/db';
import { PolicyEngine } from '@brew-cms/policy';

class CmsContainer {
  public db = createDatabaseConnection({ filePath: process.env.CMS_DB_PATH || './data/brew.db' });
  public docRepo = new SQLiteDocumentRepository(this.db);
  public revRepo = new SQLiteRevisionRepository(this.db);

  constructor() {
    seedInitialData(this.db);
  }
}

const globalForCms = globalThis as unknown as { cms?: CmsContainer };
export const cms = globalForCms.cms ?? new CmsContainer();
if (process.env.NODE_ENV !== 'production') globalForCms.cms = cms;
```

### 2. Configure Next.js External Packages
In `next.config.mjs`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["node:sqlite"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
```

### 3. Expose the REST API Route
Create `src/app/api/v1/[...route]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { handleApiRequest } from '@brew-cms/api';
import { cms } from '@/cms';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, context: { params: Promise<{ route: string[] }> }) {
  const { route } = await context.params;
  const path = `/api/v1/${route.join('/')}`;
  const actor = { id: 'usr_admin', type: 'human', name: 'Admin', role: 'Admin' };

  const apiResponse = await handleApiRequest(
    { method: req.method, path, query: Object.fromEntries(req.nextUrl.searchParams), headers: {}, actor },
    cms.getApiContext()
  );

  return NextResponse.json(apiResponse.body, { status: apiResponse.status });
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
```

### 4. Direct In-Process Queries in Server Components
```typescript
// app/blog/[slug]/page.tsx (Sub-millisecond execution, 0 network overhead)
import { cms } from '@/cms';
import { notFound } from 'next/navigation';

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await cms.docRepo.findBySlug(slug);
  if (!doc || doc.status !== 'PUBLISHED') notFound();

  const rev = await cms.revRepo.findById(doc.publishedRevisionId!);

  return (
    <article className="prose max-w-3xl mx-auto py-12">
      <h1>{doc.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: rev?.contentIr?.html || '' }} />
    </article>
  );
}
```

---

## Model Context Protocol (MCP) Integration

BrewCMS includes a first-class Model Context Protocol (MCP) server. AI agents in Cursor, Claude Desktop, or custom agent frameworks can govern and query content programmatically.

### Claude Desktop / Cursor Configuration
Add to `claude_desktop_config.json` or Cursor MCP settings:
```json
{
  "mcpServers": {
    "brew-cms": {
      "command": "node",
      "args": ["/path/to/brew-cms/packages/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "file:/path/to/brew-cms/apps/studio/data/brew.db"
      }
    }
  }
}
```

### Available MCP Tools & Resources
* `brew_list_documents`: Search and list documents with status filtering.
* `brew_get_document`: Retrieve document metadata and active published revision.
* `brew_create_draft`: Propose a new document draft with markdown and frontmatter.
* `brew_request_publish`: Submit a document to the human editorial approval queue.
* `brew_audit_log`: View the append-only governance trail.
* `brew://documents/{id}`: Direct read resource.

---

## REST API Overview

All routes follow strict REST semantics under `/api/v1`:

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/documents` | List published or filtered documents |
| `POST` | `/api/v1/documents` | Create a new document draft |
| `GET` | `/api/v1/documents/:id` | Get document with latest revision |
| `PUT` | `/api/v1/documents/:id` | Update document and create a new immutable revision |
| `POST` | `/api/v1/documents/:id/publish` | Publish approved document revision |
| `POST` | `/api/v1/documents/:id/unpublish` | Revert document to draft |
| `POST` | `/api/v1/documents/:id/restore` | Restore a historical revision snapshot |
| `GET` | `/api/v1/media` | List cataloged media assets |
| `POST` | `/api/v1/media/upload` | Upload asset with checksum validation |
| `GET` | `/api/v1/taxonomy/topics` | List taxonomy topics |
| `GET` | `/api/v1/audit` | Retrieve immutable audit events |

---

## Production Deployment & Hostinger Guidelines

1. **Database Persistence**:
   * SQLite creates `./data/brew.db` upon initial startup.
   * Add `data/*.db*` to your `.gitignore` so local test content never overwrites production databases.
2. **Memory Footprint**:
   * Next.js in production consumes **~50–80 MB RAM**.
   * SQLite LRU page cache operates in-process with **~12 MB RAM**.
   * Fits effortlessly inside shared hosting plans (e.g. Hostinger Business / Cloud hosting with 1GB–3GB RAM quotas).
3. **Environment Variables**:
   ```env
   NODE_ENV=production
   # Optional: customize database location (defaults to ./data/brew.db)
   CMS_DB_PATH=./data/brew.db
   # Optional: customize port for standalone mode (defaults to 3001)
   PORT=3001
   ```

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).  
Copyright © 2026 Kuldeep Singh (Victor Kuldeep).
