# Systems Architecture & Topology

BrewCMS is engineered around clean architectural boundaries, zero-dependency domain isolation, and sub-millisecond local-first evaluation.

---

## 1. Architectural Philosophy

Traditional Content Management Systems typically suffer from one of two design pathologies:

1. **Monolithic Heavyweight Platforms**: WordPress, Drupal, or legacy CMS frameworks that bundle relational databases, plugin interpreters, rendering engines, and administrative backends into a high-memory daemon.
2. **Headless SaaS Platforms**: Contentful, Sanity, or Strapi Cloud, which solve presentation coupling by introducing external HTTP network latency (20ms–80ms per page request), escalating monthly subscription fees, and vendor lock-in.

BrewCMS pioneers a third paradigm: **The Governed In-Process Content Operating System**.

```
┌─────────────────────────────────────────────────────────────┐
│                 Modern Next.js Application                  │
│                                                             │
│   ┌─────────────────────────┐   ┌───────────────────────┐   │
│   │ Server Components (RSC) │   │ Next.js Route Handler │   │
│   └────────────┬────────────┘   └───────────┬───────────┘   │
│                │ Direct in-process query    │               │
│                ▼ (<0.2ms latency)           ▼               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 BrewCMS Engine                      │   │
│   │                                                     │   │
│   │   ┌─────────────────┐       ┌───────────────────┐   │   │
│   │   │ Pure Domain Core│ ◄───► │ In-Process SQLite │   │   │
│   │   │ (Zod & AST IR)  │       │ (Node.js 22 WAL)  │   │   │
│   │   └────────┬────────┘       └───────────────────┘   │   │
│   │            │                                        │   │
│   │   ┌────────▼────────┐                               │   │
│   │   │ Policy Gate     │                               │   │
│   │   └────────▲────────┘                               │   │
│   └────────────┼────────────────────────────────────────┘   │
│                │                                            │
│   ┌────────────┴────────────┐                               │
│   │   Model Context (MCP)   │ ◄── AI Agents (Cursor/Claude) │
│   └─────────────────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Pillars

### 2.1 Pure Domain Kernel (`@brew-cms/core`)
The center of BrewCMS is a zero-dependency TypeScript domain model. It defines:
- **Document Entities**: Immutable content entities accompanied by strongly typed schemas.
- **Deterministic Content Intermediate Representation (IR)**: Raw markdown and frontmatter are tokenized, parsed, and normalized into an Abstract Syntax Tree (AST).
- **Cryptographic Hashes**: Every document revision is anchored by a cryptographic SHA-256 hash calculated over its canonical AST. If two documents have identical semantics, their hashes match; if a single character changes, a new hash is minted.
- **Append-Only Revision DAG**: Documents never mutate destructively. Updates produce child nodes in an immutable revision tree, enabling instant, zero-risk rollbacks.

### 2.2 In-Process Storage Engine (`@brew-cms/db`)
Rather than requiring an external database server (PostgreSQL/MySQL) or compiling native C++ binaries (`better-sqlite3`), BrewCMS uses Node.js 22 native `node:sqlite`:
- **Zero Native Compilation**: Runs out of the box on Windows, Linux, and macOS without Python, Visual Studio Build Tools, or gcc.
- **Write-Ahead Logging (WAL)**: SQLite runs in `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = NORMAL;`, allowing unlimited concurrent readers while writes execute safely.
- **Sub-0.2ms Query Latency**: Reading content in Next.js React Server Components executes as a direct memory/NVMe B-tree lookup in microseconds, avoiding HTTP serialization and network hops.

### 2.3 Bounded AI Autonomy via MCP (`@brew-cms/mcp`)
AI coding agents (Cursor, Claude Desktop, Antigravity, Gemini) interact with BrewCMS via the official **Model Context Protocol (MCP)**:
- **Audited Tools**: `brew_list_documents`, `brew_create_draft`, `brew_request_publish`.
- **Policy Gates**: Agents can query content and propose drafts freely. However, high-risk actions (`publish`, `delete`) are routed to a human approval queue.
- **Immutable Telemetry**: Every agent action is recorded in an append-only audit trail with timestamp, agent model identity, and proposed diff.

---

## 3. Deployment Topologies

### Topology A: Native Embedded (Recommended)
- BrewCMS runs directly inside your Next.js application runtime.
- Content is stored in `./data/brew.db` on local disk or persistent volume.
- React Server Components fetch data directly in-process via `getBrewClient()`.
- Studio editor is served at `/admin/cms`.
- Consumes **0 extra webapp slots** and **0 subdomains**.

### Topology B: Standalone Headless Control Plane
- BrewCMS runs as an independent Node.js microservice (`http://cms.yourdomain.com:3001`).
- Multiple external frontend consumer applications query the REST API (`/api/v1/documents`).
- Ideal for decoupled enterprise multi-app ecosystems.
