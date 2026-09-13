import Link from 'next/link';
import { cms } from '@/lib/cms';
import { STATUS_CONFIG } from '@brew-cms/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { items: documents, total: totalDocs } = await cms.documentService.listDocuments({ limit: 10 });
  const pendingPage = await cms.agentService.listActionRuns({ status: 'pending' });
  const pendingApprovals = pendingPage.items;

  const draftCount = documents.filter((d) => d.status === 'DRAFT').length;
  const reviewCount = documents.filter((d) => d.status === 'IN_REVIEW').length;
  const publishedCount = documents.filter((d) => d.status === 'PUBLISHED').length;

  return (
    <div className="p-8 max-w-7xl w-full mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-line">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            Control Plane
          </h1>
          <p className="text-sm text-ink-soft mt-1">
            Governed content operations, immutable revisions, and agent policies.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/documents/new"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md bg-ink text-surface hover:bg-neutral-800 transition-colors shadow-sm"
          >
            Create Document
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-lg bg-surface border border-line">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted">Total Documents</div>
          <div className="text-2xl font-bold text-ink mt-2">{totalDocs}</div>
        </div>
        <div className="p-5 rounded-lg bg-surface border border-line">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted">Published</div>
          <div className="text-2xl font-bold text-emerald-800 mt-2">{publishedCount}</div>
        </div>
        <div className="p-5 rounded-lg bg-surface border border-line">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted">In Review</div>
          <div className="text-2xl font-bold text-amber-800 mt-2">{reviewCount}</div>
        </div>
        <div className="p-5 rounded-lg bg-surface border border-line">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted">Pending Approvals</div>
          <div className="text-2xl font-bold text-accent mt-2">{pendingApprovals.length}</div>
        </div>
      </div>

      {/* Pending Agent Approvals Alert if any */}
      {pendingApprovals.length > 0 && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-sm text-amber-900 font-medium">
              There are {pendingApprovals.length} agent action(s) waiting for human approval.
            </span>
          </div>
          <Link
            href="/agents"
            className="text-xs font-semibold text-amber-900 underline hover:no-underline"
          >
            Review Queue &rarr;
          </Link>
        </div>
      )}

      {/* Recent Documents Section */}
      <div className="rounded-lg bg-surface border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Recent Documents</h2>
          <Link href="/documents" className="text-xs font-medium text-accent hover:underline">
            View All ({totalDocs}) &rarr;
          </Link>
        </div>

        {documents.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">
            No documents in the system yet. Click "Create Document" to write your first post.
          </div>
        ) : (
          <div className="divide-y divide-line overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-strong/50 text-xs font-semibold text-muted uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Title</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Last Updated</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {documents.map((doc) => {
                  const statusStyle = STATUS_CONFIG[doc.status] || STATUS_CONFIG.DRAFT;
                  return (
                    <tr key={doc.id} className="hover:bg-surface-strong/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-ink">
                        <Link href={`/documents/${doc.id}`} className="hover:underline">
                          {doc.title}
                        </Link>
                        <div className="text-xs text-muted font-normal mt-0.5">{doc.slug}</div>
                      </td>
                      <td className="px-6 py-4 text-ink-soft uppercase text-xs font-semibold">
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
                          Edit &rarr;
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
