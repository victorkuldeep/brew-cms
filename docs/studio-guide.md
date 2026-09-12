# BrewCMS Studio Editorial Guide

The BrewCMS Studio is a responsive, distraction-free control plane embedded directly inside your application at `/admin/cms`.

---

## 1. Studio Dashboard Overview

When navigating to `/admin/cms`, the dashboard displays immediate telemetry on content status:
- **Total Documents**: Count of active items across all stages.
- **Published**: Live items serving public traffic.
- **Drafts & In-Review**: Work in progress awaiting publication or review.
- **Pending AI Approvals**: Agent-proposed actions awaiting human authorization.
- **Storage Metrics**: Database file size and revision tree depth.

---

## 2. Document Authoring & Markdown Editor

### Creating a New Document
1. Click **+ New Document** from the Documents page.
2. Enter the **Title** and unique URL **Slug**.
3. Add **Taxonomy Tags** (e.g., `Architecture`, `Systems`, `AI`).
4. Write your post in the Markdown editor.
5. Provide optional **Frontmatter** (e.g., `readingTime`, `canonicalUrl`, `featured: true`).

### Markdown & Content IR Compilation
Unlike traditional editors that save unchecked raw HTML strings, BrewCMS compiles your text into a **Deterministic Content IR AST**:
- Syntax errors and malformed YAML frontmatter are caught immediately.
- A cryptographic **SHA-256** checksum is minted upon every save.
- All saves produce non-destructive revision snapshots.

---

## 3. Revision Trees & Visual Diffing

From any document's detail view (`/admin/cms/documents/:id`):
- Click **Revisions** to see the chronological timeline of changes.
- Click **Compare Revisions** to inspect a side-by-side visual diff of additions and deletions.
- If a mistake is made, click **Rollback to Revision** to restore any historical snapshot instantaneously.

---

## 4. Media Management

The Media Library (`/admin/cms/media`) provides drag-and-drop asset management:
- Upload images (`.png`, `.jpg`, `.webp`, `.svg`).
- Copy markdown image insertion tags (`![alt text](/uploads/filename.webp)`).
- Assets are stored with SHA-256 fingerprinting to prevent accidental overwrites.

---

## 5. Agents & Policy Approvals

Under `/admin/cms/agents`:
- View all publication requests submitted by AI coding assistants via the Model Context Protocol (MCP).
- Read the agent's explanation for why the article was drafted or modified.
- Review the proposed text changes before approving or rejecting.
