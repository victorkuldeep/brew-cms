import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'BrewCMS Consumer Publication',
  description: 'Reference application consuming structured content from BrewCMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0, background: '#fafafa', color: '#111' }}>
        <header style={{ borderBottom: '1px solid #eaeaea', background: '#fff', padding: '16px 32px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/" style={{ textDecoration: 'none', color: '#111', fontWeight: 'bold', fontSize: 18 }}>
              Brew<span style={{ color: '#9A7653' }}>Consumer</span>
            </Link>
            <nav style={{ display: 'flex', gap: 16, fontSize: 14 }}>
              <Link href="/" style={{ textDecoration: 'none', color: '#555' }}>Articles</Link>
            </nav>
          </div>
        </header>
        <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 32px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
