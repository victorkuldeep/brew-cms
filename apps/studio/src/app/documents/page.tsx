import Link from 'next/link';
import { cms } from '@/lib/cms';
import { STATUS_CONFIG } from '@brew-cms/ui';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ status?: string; q?: string }>;
}

export default async function DocumentsPage({ searchParams }: Props) {
  const resolvedParams = await searchParams;
  const statusFilter = resolvedParams.status as any;
  const query = resolvedParams.q;

  const { items: documents, total } = await cms.documentService.listDocuments({
    status: statusFilter,
    query,
    limit: 50,
  });

  const statuses = [
    { key: '', label: 'All' },
    { key: 'DRAFT', label: 'Drafts' },
    { key: 'IN_REVIEW', label: 'In Review' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'PUBLISHED', label: 'Published' },
    { key: 'ARCHIVED', label: 'Archived' },
  ];

  return (
    <div className="p-8 max-w-7xl w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-line">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Documents</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            Manage long-form articles, structured pages, and editorial workflows.
          </p>
        </div>
        <Link
          href="/documents/new"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md bg-ink text-surface hover:bg-neutral-800 transition-colors shadow-sm"
        >
          Create Document
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1 border-b border-line pb-2 overflow-x-auto text-sm">
        {statuses.map((s) => {
          const active = (statusFilter || '') === s.key;
          return (
            <Link
              key={s.key}
              href={s.key ? `/documents?status=${s.key}` : '/documents'}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                active
                  ? 'bg-surface-strong text-ink font-semibold'
                  : 'text-muted hover:text-ink hover:bg-surface-strong/50'
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* Document List Table */}
      <div className="rounded-lg bg-surface border border-line overflow-hidden">
        {documents.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">
            No documents matching the selected criteria.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-strong/50 text-xs font-semibold text-muted uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Document</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Updated</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {documents.map((doc) => {
                const statusStyle = STATUS_CONFIG[doc.status] || STATUS_CONFIG.DRAFT;
                return (
                  <tr key={doc.id} className="hover:bg-surface-strong/30 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {doc.title}
                      </Link>
                      <div className="text-xs text-muted mt-0.5">{doc.slug}</div>
                    </td>
                    <td className="px-6 py-4 uppercase text-xs font-semibold text-ink-soft">
                      {doc.type}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Open Editor &rarr;
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
