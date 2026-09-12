# BrewCMS Next.js Consumer Example

This example demonstrates how an external Next.js App Router application (such as `coffeediscussions` or `portfolio`) consumes published content, taxonomies, and media from BrewCMS via `@brew-cms/client`.

## Features Demonstrated

1. **Type-safe Client SDK (`@brew-cms/client`)**:
   - Clean, fluent API for documents, revisions, taxonomies, and media.
   - Built-in ISR caching support (`next: { revalidate: 60 }`).

2. **Server Components & ISR**:
   - `src/app/page.tsx`: Listing articles with fast edge revalidation.
   - `src/app/posts/[slug]/page.tsx`: Dynamic route resolving article content by slug.

3. **Content IR Rendering**:
   - Parses and safely renders verified, sanitized Content Intermediate Representation (IR) to HTML without raw markdown injection risks.

4. **SEO & Static Params**:
   - Dynamic `generateMetadata` generating canonical tags, titles, and descriptions.
   - `generateStaticParams` pre-rendering top published slugs at build time.

## Running the Example

```bash
# 1. Start the BrewCMS Studio / API Control Plane
pnpm --filter @brew-cms/studio run dev

# 2. In another terminal, run this consumer
pnpm --filter example-nextjs-consumer run dev
```
