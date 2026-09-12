# BrewCMS Adoption & Migration Guide: CoffeeDiscussions

This guide outlines the architectural blueprint and drop-in adapter code for migrating `coffeediscussions` (`D:\Projects\web\coffeediscussions`) from its current direct-database content model to **BrewCMS**.

---

## 1. Architectural Motivation

`coffeediscussions` is a multi-author editorial publication built on Next.js 15, React 19, and Tailwind CSS.
Currently, articles and content reside directly in a relational database with potential schema friction and without:
- Cryptographically verifiable revision history (content hashing).
- Bounded autonomous AI agent workflows (safe multi-agent draft generation and automated review).
- Content Intermediate Representation (IR) isolation from rendering code.
- Deterministic explainable recommendations.

By adopting **BrewCMS**, `coffeediscussions` retains 100% of its custom UI, styling, and branding, while delegating the content control plane, revision immutability, editorial review workflows, and agent operations to BrewCMS.

---

## 2. Integration Modes

### Option A: Headless API Consumer (Recommended)
`coffeediscussions` installs `@brew-cms/client` and consumes content over HTTP with Next.js ISR.
```bash
pnpm add @brew-cms/client
```

Configure `.env.local`:
```env
BREW_CMS_URL=http://localhost:3000
BREW_CMS_API_KEY=brew_live_secret_key_here
```

### Option B: Shared SQLite Monorepo / Worktree
In a unified repository deployment, `coffeediscussions` can run on the same server, reading from the shared SQLite database using `@brew-cms/core` and `@brew-cms/db` repository adapters with zero network hops.

---

## 3. Drop-in Content Adapter for CoffeeDiscussions

Create `src/infrastructure/cms/brew-adapter.ts` inside `coffeediscussions`:

```typescript
import { createBrewClient, type Document, type Revision } from '@brew-cms/client';

export const brewClient = createBrewClient({
  baseUrl: process.env.BREW_CMS_URL || 'http://localhost:3000',
  apiKey: process.env.BREW_CMS_API_KEY,
  defaultRevalidate: 60, // 60s ISR
});

export interface EditorialArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentHtml: string;
  authorId: string;
  publishedAt: Date;
  readingTimeMinutes: number;
  wordCount: number;
}

/**
 * Fetch all published articles with Next.js ISR
 */
export async function getPublishedArticles(): Promise<EditorialArticle[]> {
  const { items } = await brewClient.documents.list({
    type: 'post',
    status: 'PUBLISHED',
    limit: 50,
  });

  return items.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt,
    contentHtml: '', // Loaded in detail view
    authorId: doc.authorId,
    publishedAt: new Date(doc.updatedAt),
    readingTimeMinutes: 5,
    wordCount: 1000,
  }));
}

/**
 * Fetch a single article by slug and render its Content IR
 */
export async function getArticleBySlug(slug: string): Promise<EditorialArticle | null> {
  const doc = await brewClient.documents.getBySlug(slug);
  if (!doc) return null;

  const { revisions } = await brewClient.documents.getRevisions(doc.id);
  const targetRevision = doc.publishedRevisionId
    ? revisions.find((r) => r.id === doc.publishedRevisionId)
    : revisions[0];

  const contentHtml = targetRevision?.contentIr
    ? brewClient.renderHtml(targetRevision.contentIr)
    : `<p>${targetRevision?.sourceMarkdown || ''}</p>`;

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt,
    contentHtml,
    authorId: doc.authorId,
    publishedAt: new Date(doc.updatedAt),
    readingTimeMinutes: Math.ceil((targetRevision?.readingTimeSeconds || 300) / 60),
    wordCount: targetRevision?.wordCount || 0,
  };
}
```

---

## 4. Next.js App Router Page Integration

In `src/app/articles/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getArticleBySlug, getPublishedArticles } from '@/infrastructure/cms/brew-adapter';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const articles = await getPublishedArticles();
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: 'Article Not Found' };

  return {
    title: `${article.title} — CoffeeDiscussions`,
    description: article.excerpt || undefined,
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <article className="max-w-3xl mx-auto py-12 px-6">
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold text-neutral-900 tracking-tight mb-4">
          {article.title}
        </h1>
        <div className="flex items-center space-x-3 text-sm text-neutral-500">
          <time dateTime={article.publishedAt.toISOString()}>
            {article.publishedAt.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </time>
          <span>&bull;</span>
          <span>{article.readingTimeMinutes} min read</span>
        </div>
      </header>

      {/* Rendered Safe HTML from BrewCMS Content IR */}
      <div
        className="prose prose-neutral max-w-none text-neutral-800 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: article.contentHtml }}
      />
    </article>
  );
}
```

---

## 5. Migration Strategy for Existing Content

To import existing articles from CoffeeDiscussions into BrewCMS:
1. Run the Brew CLI or use a one-time migration script:
   ```bash
   pnpm --filter @brew-cms/cli exec brew content create \
     --type post \
     --title "Understanding Coffee Processing" \
     --slug "understanding-coffee-processing" \
     --file "./data/legacy-articles/processing.md"
   ```
2. The compiler extracts frontmatter, parses Markdown into Content IR, computes SHA-256 content hashes, and creates initial revision `#1`.
3. An editor reviews and publishes the document in the BrewCMS Studio or via:
   ```bash
   pnpm --filter @brew-cms/cli exec brew content publish <doc_id>
   ```
