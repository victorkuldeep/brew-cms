# Getting Started with BrewCMS

This guide explains how to integrate BrewCMS into modern Next.js 15 applications using the native in-process embedded pattern.

---

## 1. Prerequisites

- **Node.js**: Version `22.x` or higher (required for native `node:sqlite`).
- **Framework**: Next.js 15 with App Router.
- **Package Manager**: `pnpm` or `npm`.

---

## 2. Option A: Embedded In-Process Integration (Recommended)

The embedded pattern integrates the BrewCMS engine directly into your existing Next.js codebase.

### Step 1: Copy Engine Packages
Copy the core engine packages (`core`, `db`, `content`, `mcp`, `policy`) into your project under `src/cms/engine` (or `lib/cms/engine`).

### Step 2: Configure Path Mappings
In `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@brew-cms/core": ["./src/cms/engine/packages/core/src"],
      "@brew-cms/db": ["./src/cms/engine/packages/db/src"],
      "@brew-cms/content": ["./src/cms/engine/packages/content/src"],
      "@brew-cms/mcp": ["./src/cms/engine/packages/mcp/src"],
      "@brew-cms/policy": ["./src/cms/engine/packages/policy/src"]
    }
  }
}
```

### Step 3: Configure `next.config.mjs`
To allow Next.js App Router and Webpack to load `node:sqlite` and resolve ESM modules:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["node:sqlite"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
```

### Step 4: Initialize In-Process Container
Create `src/cms/container.ts`:

```typescript
import { createSqliteStorageEngine } from "@brew-cms/db";
import { BrewCoreService } from "@brew-cms/core";
import path from "node:path";

let serviceInstance: BrewCoreService | null = null;

export function getBrewService(): BrewCoreService {
  if (!serviceInstance) {
    const dbPath = path.resolve(process.cwd(), "data", "brew.db");
    const storage = createSqliteStorageEngine({ path: dbPath });
    serviceInstance = new BrewCoreService({ storage });
  }
  return serviceInstance;
}
```

### Step 5: Mount the REST API Route
Create `src/app/api/v1/[...route]/route.ts`:

```typescript
import { getBrewService } from "@/cms/container";
import { createBrewApiHandler } from "@brew-cms/api";

const handler = createBrewApiHandler(getBrewService());

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
```

---

## 3. Querying Content in Server Components

Because BrewCMS is embedded directly in-process, querying documents from Next.js React Server Components executes with **zero network overhead**:

```tsx
import { getBrewService } from "@/cms/container";

export default async function BlogPage() {
  const cms = getBrewService();
  const documents = await cms.listDocuments({ status: "published" });

  return (
    <main>
      <h1>Latest Articles</h1>
      <ul>
        {documents.map((doc) => (
          <li key={doc.id}>
            <a href={`/blog/${doc.slug}`}>{doc.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
```
Query execution latency is typically **0.1ms to 0.2ms**, completely eliminating the 40ms–100ms HTTP latency of SaaS headless CMS solutions.
