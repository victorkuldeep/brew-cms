# BrewCMS Adoption & Integration Guide: Developer Portfolio

This guide details how `portfolio` (`D:\Projects\web\portfolio`) can consume case studies, project logs, and technical blog posts directly from **BrewCMS**.

---

## 1. Architectural Motivation

The portfolio is built with Next.js 15, React 19, and `@next/mdx`.
While local MDX files work well for static content, managing case studies, live project updates, and long-form writing in code creates friction:
- Every typo fix requires a git commit, PR, and rebuild.
- No central media library with deduplicated, checksummed assets.
- No support for AI agent-assisted drafting, proofreading, or tagging.
- No versioned revisions or rollback mechanism without git surgery.

By integrating **BrewCMS**:
- Case studies and blog posts are authored in BrewCMS Studio or via Brew CLI / MCP.
- The portfolio website fetches live or statically generated content via `@brew-cms/client`.
- Rich metadata (SEO tags, canonical URLs, reading time) is automatically computed by the BrewCMS content compiler.

---

## 2. Integration Setup

Inside `D:\Projects\web\portfolio`:

1. Install `@brew-cms/client`:
   ```bash
   pnpm add @brew-cms/client
   ```

2. Add environment variables to `.env.local`:
   ```env
   BREW_CMS_URL=http://localhost:3000
   BREW_CMS_API_KEY=brew_live_portfolio_token
   ```

---

## 3. Case Studies & Blog Posts Client Adapter

Create `src/lib/cms.ts` in `portfolio`:

```typescript
import { createBrewClient, type Document } from '@brew-cms/client';

export const brew = createBrewClient({
  baseUrl: process.env.BREW_CMS_URL || 'http://localhost:3000',
  apiKey: process.env.BREW_CMS_API_KEY,
  defaultRevalidate: 300, // 5 minutes cache
});

export interface CaseStudy {
  id: string;
  slug: string;
  title: string;
  description: string;
  contentHtml: string;
  technologies: string[];
  updatedAt: string;
}

/**
 * List all published case studies (documents with type 'page' or tag 'case-study')
 */
export async function getCaseStudies(): Promise<CaseStudy[]> {
  const res = await brew.documents.list({
    type: 'page',
    status: 'PUBLISHED',
    limit: 20,
  });

  return Promise.all(
    res.items.map(async (doc) => {
      const { revisions } = await brew.documents.getRevisions(doc.id);
      const rev = doc.publishedRevisionId
        ? revisions.find((r) => r.id === doc.publishedRevisionId)
        : revisions[0];

      const contentHtml = rev?.contentIr
        ? brew.renderHtml(rev.contentIr)
        : `<p>${rev?.sourceMarkdown || ''}</p>`;

      const frontmatter = (rev?.frontmatter as any) || {};

      return {
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        description: doc.excerpt || frontmatter.description || '',
        contentHtml,
        technologies: Array.isArray(frontmatter.tech) ? frontmatter.tech : [],
        updatedAt: new Date(doc.updatedAt).toISOString(),
      };
    })
  );
}

/**
 * Fetch a specific project case study by slug
 */
export async function getCaseStudyBySlug(slug: string): Promise<CaseStudy | null> {
  const doc = await brew.documents.getBySlug(slug);
  if (!doc) return null;

  const { revisions } = await brew.documents.getRevisions(doc.id);
  const rev = doc.publishedRevisionId
    ? revisions.find((r) => r.id === doc.publishedRevisionId)
    : revisions[0];

  const contentHtml = rev?.contentIr
    ? brew.renderHtml(rev.contentIr)
    : `<p>${rev?.sourceMarkdown || ''}</p>`;

  const frontmatter = (rev?.frontmatter as any) || {};

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    description: doc.excerpt || frontmatter.description || '',
    contentHtml,
    technologies: Array.isArray(frontmatter.tech) ? frontmatter.tech : [],
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}
```

---

## 4. Next.js Case Studies Route

In `src/app/projects/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCaseStudyBySlug, getCaseStudies } from '@/lib/cms';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const studies = await getCaseStudies();
  return studies.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const study = await getCaseStudyBySlug(slug);
  if (!study) return { title: 'Project Not Found' };

  return {
    title: `${study.title} — Case Study`,
    description: study.description,
  };
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const study = await getCaseStudyBySlug(slug);
  if (!study) notFound();

  return (
    <main className="max-w-4xl mx-auto py-16 px-6">
      <header className="mb-10">
        <h1 className="text-4xl font-black text-neutral-900 mb-4">{study.title}</h1>
        {study.description && (
          <p className="text-lg text-neutral-600 leading-relaxed mb-6">
            {study.description}
          </p>
        )}
        {study.technologies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {study.technologies.map((tech) => (
              <span
                key={tech}
                className="px-2.5 py-1 text-xs font-mono rounded bg-neutral-100 text-neutral-700"
              >
                {tech}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Rendered content */}
      <section
        className="prose prose-neutral max-w-none leading-relaxed"
        dangerouslySetInnerHTML={{ __html: study.contentHtml }}
      />
    </main>
  );
}
```

---

## 5. Summary of Benefits
- **Zero Build Friction**: Edit content in BrewCMS Studio and view updates without redeploying Vercel/Next.js.
- **Strict Content IR**: Security guarantees with sanitization and zero unsanitized HTML injection.
- **Multi-Device Authoring**: Publish case studies and project documentation on desktop or mobile via the BrewCMS Studio.
