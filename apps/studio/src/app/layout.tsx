import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'BrewCMS Studio — Content Control Plane',
  description: 'An open-source, agent-ready content operating system for Next.js applications.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink flex flex-col md:flex-row antialiased">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-surface border-b md:border-b-0 md:border-r border-line flex flex-col justify-between p-6 shrink-0">
          <div>
            <div className="flex items-center space-x-2.5 mb-8">
              <div className="w-6 h-6 rounded bg-ink text-surface flex items-center justify-center font-bold text-xs tracking-wider">
                B
              </div>
              <span className="font-semibold tracking-tight text-lg text-ink">
                Brew<span className="text-accent">CMS</span>
              </span>
            </div>

            <nav className="space-y-1 text-sm font-medium">
              <Link
                href="/"
                className="flex items-center px-3 py-2 rounded-md hover:bg-surface-strong text-ink-soft hover:text-ink transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/documents"
                className="flex items-center px-3 py-2 rounded-md hover:bg-surface-strong text-ink-soft hover:text-ink transition-colors"
              >
                Documents
              </Link>
              <Link
                href="/media"
                className="flex items-center px-3 py-2 rounded-md hover:bg-surface-strong text-ink-soft hover:text-ink transition-colors"
              >
                Media Library
              </Link>
              <Link
                href="/taxonomy"
                className="flex items-center px-3 py-2 rounded-md hover:bg-surface-strong text-ink-soft hover:text-ink transition-colors"
              >
                Taxonomy
              </Link>
              <Link
                href="/agents"
                className="flex items-center px-3 py-2 rounded-md hover:bg-surface-strong text-ink-soft hover:text-ink transition-colors"
              >
                Agents &amp; Approvals
              </Link>
              <Link
                href="/audit"
                className="flex items-center px-3 py-2 rounded-md hover:bg-surface-strong text-ink-soft hover:text-ink transition-colors"
              >
                Audit Trail
              </Link>
            </nav>
          </div>

          <div className="mt-8 pt-4 border-t border-line text-xs text-muted">
            <div className="flex items-center space-x-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              <span className="font-medium text-ink">System Online</span>
            </div>
            <p>SQLite Local-First &bull; v0.1.0</p>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 flex flex-col overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
