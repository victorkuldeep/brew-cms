import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { brew } from '@/lib/cms-client';

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await brew.documents.getBySlug(slug).catch(() => null);
  if (!doc) return { title: 'Document Not Found' };

  return {
    title: `${doc.title} — BrewCMS Consumer`,
    description: doc.excerpt || undefined,
    alternates: {
      canonical: doc.canonicalUrl || undefined,
    },
  };
}

export async function generateStaticParams() {
  try {
    const res = await brew.documents.list({ status: 'PUBLISHED', limit: 50 });
    return res.items.map((d) => ({ slug: d.slug }));
  } catch {
    return [];
  }
}

export default async function PostDetailPage({ params }: Props) {
  const { slug } = await params;
  const doc = await brew.documents.getBySlug(slug).catch(() => null);
  if (!doc) notFound();

  let revisions: any[] = [];
  try {
    const revRes = await brew.documents.getRevisions(doc.id);
    revisions = revRes.revisions;
  } catch {
    // Ignored
  }

  const publishedRev = doc.publishedRevisionId
    ? revisions.find((r) => r.id === doc.publishedRevisionId)
    : revisions[0];

  const htmlContent = publishedRev?.contentIr
    ? brew.renderHtml(publishedRev.contentIr)
    : `<p>${publishedRev?.sourceMarkdown || ''}</p>`;

  return (
    <article style={{ background: '#fff', padding: 40, borderRadius: 8, border: '1px solid #eaeaea' }}>
      <Link href="/" style={{ fontSize: 13, color: '#888', textDecoration: 'none', display: 'inline-block', marginBottom: 24 }}>
        &larr; Back to all articles
      </Link>

      <header style={{ marginBottom: 32, borderBottom: '1px solid #eee', paddingBottom: 24 }}>
        <h1 style={{ fontSize: 36, margin: '0 0 12px 0', lineHeight: 1.2 }}>{doc.title}</h1>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#777' }}>
          <span>Published: {new Date(doc.updatedAt).toLocaleDateString()}</span>
          {publishedRev && <span>&bull; {publishedRev.wordCount} words</span>}
          {publishedRev && <span>&bull; {Math.ceil(publishedRev.readingTimeSeconds / 60)} min read</span>}
        </div>
      </header>

      <div
        className="content-body"
        style={{ fontSize: 16, lineHeight: 1.75, color: '#222' }}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </article>
  );
}
