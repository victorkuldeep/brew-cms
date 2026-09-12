import Link from 'next/link';
import { brew } from '@/lib/cms-client';

export const revalidate = 60; // Revalidate every 60 seconds

export default async function HomePage() {
  let documents: any[] = [];
  try {
    const res = await brew.documents.list({ status: 'PUBLISHED', limit: 20 });
    documents = res.items;
  } catch {
    // Graceful fallback if CMS server is unreachable during build
    documents = [];
  }

  return (
    <section>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, margin: '0 0 8px 0' }}>Published Articles</h1>
        <p style={{ color: '#666', fontSize: 16 }}>
          Content delivered dynamically from the BrewCMS content control plane.
        </p>
      </div>

      {documents.length === 0 ? (
        <div style={{ padding: 32, background: '#fff', border: '1px solid #eaeaea', borderRadius: 8, textAlign: 'center' }}>
          <p style={{ color: '#888' }}>No published articles found. Publish a document in BrewCMS Studio to display here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {documents.map((doc) => (
            <article
              key={doc.id}
              style={{
                padding: 24,
                background: '#fff',
                border: '1px solid #eaeaea',
                borderRadius: 8,
                transition: 'box-shadow 0.2s',
              }}
            >
              <h2 style={{ margin: '0 0 8px 0', fontSize: 20 }}>
                <Link href={`/posts/${doc.slug}`} style={{ textDecoration: 'none', color: '#111' }}>
                  {doc.title}
                </Link>
              </h2>
              {doc.excerpt && (
                <p style={{ color: '#555', fontSize: 14, margin: '0 0 12px 0', lineHeight: 1.5 }}>
                  {doc.excerpt}
                </p>
              )}
              <div style={{ fontSize: 12, color: '#999', display: 'flex', gap: 16 }}>
                <span>Updated: {new Date(doc.updatedAt).toLocaleDateString()}</span>
                <span>Type: {doc.type}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
