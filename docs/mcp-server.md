# Model Context Protocol (MCP) Guide

BrewCMS includes a native **Model Context Protocol (MCP)** server, enabling AI coding agents (Claude Desktop, Cursor, Antigravity, Gemini CLI) to inspect, author, and propose content modifications under strict policy guardrails.

---

## 1. Why MCP for Content Management?

Modern developers frequently ask AI coding assistants to draft blog posts, update technical documentation, or generate changelogs. Traditional approaches either:
1. Require copying and pasting markdown between chatbot windows and CMS fields.
2. Give AI unconstrained API tokens with direct write access to production databases, creating severe risks of hallucinations, prompt injection, and unauthorized publishing.

BrewCMS solves this with **Bounded Agent Autonomy**:
- The agent is equipped with strongly typed MCP tools.
- Low-risk read and draft operations execute automatically.
- High-risk publishing operations trigger mandatory human approval gates.

---

## 2. Available MCP Tools

| Tool Name | Risk Level | Description |
| :--- | :--- | :--- |
| `brew_list_documents` | Low (Read) | Lists existing CMS documents with title, slug, status, and taxonomy tags. |
| `brew_get_document` | Low (Read) | Retrieves full Content IR, markdown body, frontmatter metadata, and revision history. |
| `brew_create_draft` | Low (Write) | Creates a new document in `draft` status. |
| `brew_update_draft` | Low (Write) | Updates an existing draft, producing a new immutable SHA-256 revision node. |
| `brew_request_publish` | High (Gated) | Enqueues a publication request for human editorial review. Does **not** go live automatically. |

---

## 3. Configuration

### 3.1 Claude Desktop Configuration
Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "brew-cms": {
      "command": "node",
      "args": ["path/to/brew-cms/packages/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "./data/brew.db",
        "BREW_API_KEY": "your-studio-secret-key"
      }
    }
  }
}
```

### 3.2 Cursor IDE Configuration
In `.cursor/mcp.json` or Cursor Settings → Features → MCP Servers:

```json
{
  "mcpServers": {
    "brew-cms": {
      "command": "npx",
      "args": ["-y", "@brew-cms/mcp"],
      "env": {
        "BREW_API_ENDPOINT": "http://localhost:3000/api/v1"
      }
    }
  }
}
```

---

## 4. Human-in-the-Loop Approval Workflow

1. **Agent Initiates**: The AI agent writes an article draft and calls `brew_request_publish(id: "doc_123")`.
2. **Policy Gate Intercepts**: The MCP server marks the approval request as `PENDING_REVIEW` and records the agent's reasoning.
3. **Studio Notification**: The human editor visits `/admin/cms/agents` in the BrewCMS Studio.
4. **Visual Diff Review**: The editor compares the proposed revision against the current published version.
5. **Decision**: The human editor clicks **Approve & Publish** or **Reject with Feedback**.
6. **Audit Trail**: The complete decision record is permanently archived in the immutable audit log.
