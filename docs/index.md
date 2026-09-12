# BrewCMS Documentation Portal

Welcome to the official documentation for **BrewCMS** — the open-source, local-first Content Operating System and AI Agent Control Plane for modern Next.js applications.

BrewCMS eliminates the false dichotomy between fragile, expensive SaaS headless CMS vendors and monolithic legacy platforms. It combines sub-0.2ms in-process SQLite evaluation with deterministic Content IR and bounded Model Context Protocol (MCP) AI autonomy.

---

## 📚 Table of Contents

1. [Architecture & Systems Topology](./architecture.md)
   - Hexagonal Pure Domain Kernel
   - Deterministic Content IR & SHA-256 Hashes
   - Node.js 22 `node:sqlite` WAL In-Process Engine
   - Deployment Topologies (Embedded vs. Standalone)

2. [Getting Started Guide](./getting-started.md)
   - Prerequisites (Node.js 22+)
   - Option A: Native Embedded in Next.js 15 App Router
   - Option B: Standalone Headless Service
   - Directory Structure & Database Initialization

3. [AI Agents & Model Context Protocol (MCP)](./mcp-server.md)
   - Architecture & Bounded Autonomy
   - Available Agent Tools (`brew_list_documents`, `brew_create_draft`, `brew_request_publish`)
   - Human-in-the-Loop Approval Policies
   - Cursor, Claude Desktop, and Antigravity Configuration

4. [REST API Reference](./api-reference.md)
   - Documents Endpoint (`/api/v1/documents`)
   - Media Endpoint (`/api/v1/media`)
   - Taxonomies Endpoint (`/api/v1/taxonomies`)
   - Agent Approvals Endpoint (`/api/v1/agents/approvals`)
   - Health & Telemetry (`/api/v1/health`)

5. [Studio Editorial Guide](./studio-guide.md)
   - Studio Dashboard (`/admin/cms`)
   - Drafting, Revisions, and Visual Diffing
   - Markdown & Frontmatter Authoring
   - Media Library & Image Optimization
   - Review and Approval Workflows

6. [Reference Adoptions](./ADOPTION_PORTFOLIO.md)
   - [Portfolio Adoption Guide](./ADOPTION_PORTFOLIO.md)
   - [CoffeeDiscussions Magazine Adoption Guide](./ADOPTION_COFFEEDISCUSSIONS.md)

---

## 🚀 Quick Highlights

| Feature | BrewCMS Embedded | Traditional Headless SaaS |
| :--- | :--- | :--- |
| **Query Latency** | **<0.2ms** (in-process B-Tree) | 20ms – 80ms (remote HTTP) |
| **Hosting Cost** | **$0** (zero SaaS subscription) | $99 – $1,200+/month |
| **Database Overhead** | Native `node:sqlite` (zero daemons) | External DB or proprietary cloud |
| **AI Agent Tooling** | Native Model Context Protocol (MCP) | Custom webhook scraping |
| **Agent Safety** | Strict human approval policy gates | Dangerous direct database writes |
| **Revision History** | Immutable SHA-256 DAG | Mutable database records |

---

## 🔗 Community & Source Code

- **GitHub Repository**: [https://github.com/victorkuldeep/brew-cms](https://github.com/victorkuldeep/brew-cms)
- **Flagship Case Study**: [https://victorkuldeep.com/case-studies/brew-cms](https://victorkuldeep.com/case-studies/brew-cms)
- **Architectural Essay**: [https://victorkuldeep.com/thinking/building-brew-cms-content-operating-system-nextjs](https://victorkuldeep.com/thinking/building-brew-cms-content-operating-system-nextjs)
- **License**: Apache 2.0
