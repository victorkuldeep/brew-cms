# REST API Reference

BrewCMS provides a clean, predictable REST API mounted at `/api/v1` for programmatic document management, media uploads, and agent interactions.

---

## 1. Authentication

All mutation endpoints require bearer token authentication unless running in local development mode with authentication disabled.

```http
Authorization: Bearer <YOUR_BREW_API_KEY>
```

---

## 2. Documents API

### `GET /api/v1/documents`
Lists documents with optional status, tag, and search filtering.

**Query Parameters:**
- `status` (`draft` | `review` | `published` | `archived`): Filter by lifecycle state.
- `tag` (string): Filter by taxonomy tag slug.
- `limit` (number, default: 20): Number of items per page.
- `offset` (number, default: 0): Pagination offset.

**Response:**
```json
{
  "data": [
    {
      "id": "doc_01j7x8a9",
      "slug": "welcome-to-brew-cms",
      "title": "Welcome to BrewCMS",
      "status": "published",
      "sha256": "3a8f9c1e4d...",
      "tags": ["architecture", "nextjs"],
      "publishedAt": "2026-03-12T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

### `GET /api/v1/documents/:id`
Retrieves full document details, including Markdown body and parsed Content IR AST.

### `POST /api/v1/documents`
Creates a new document draft.

**Request Body:**
```json
{
  "slug": "in-process-sqlite-deep-dive",
  "title": "Deep Dive: In-Process SQLite with Node 22",
  "content": "# Deep Dive\n\nContent goes here...",
  "frontmatter": {
    "readingTime": "6 min",
    "featured": true
  },
  "tags": ["sqlite", "architecture"]
}
```

### `PATCH /api/v1/documents/:id`
Updates an existing document draft. Creates an append-only revision entry in the revision tree.

### `POST /api/v1/documents/:id/publish`
Publishes a document. (Requires administrative privileges or approved policy ticket).

---

## 3. Media API

### `POST /api/v1/media/upload`
Uploads an image, diagram, or asset to local storage (`./uploads`) or configured CDN.

**Request:** `multipart/form-data` with `file` field.

**Response:**
```json
{
  "id": "med_01j7x9b2",
  "url": "/uploads/architecture-diagram.webp",
  "mimeType": "image/webp",
  "size": 48210,
  "width": 1920,
  "height": 1080
}
```

---

## 4. Agent Approvals API

### `GET /api/v1/agents/approvals`
Lists pending publication requests proposed by AI coding assistants.

### `POST /api/v1/agents/approvals/:id/decide`
Submits a human editorial decision (`APPROVE` or `REJECT`).

**Request Body:**
```json
{
  "decision": "APPROVE",
  "reviewerNotes": "Reviewed and approved for publication."
}
```
