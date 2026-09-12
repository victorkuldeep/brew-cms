'use client';

import React, { useState, useTransition } from 'react';
import type { Document, Revision } from '@brew-cms/core';
import { STATUS_CONFIG } from '@brew-cms/ui';

interface EditorProps {
  initialDocument: Document;
  initialRevision: Revision | null;
  revisions: Revision[];
}

export function StudioEditor({ initialDocument, initialRevision, revisions: initialRevisions }: EditorProps) {
  const [doc, setDoc] = useState<Document>(initialDocument);
  const [title, setTitle] = useState(initialDocument.title);
  const [slug, setSlug] = useState(initialDocument.slug);
  const [markdown, setMarkdown] = useState(initialRevision?.sourceMarkdown || '# ' + initialDocument.title);
  const [revisions, setRevisions] = useState<Revision[]>(initialRevisions);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'revisions'>('editor');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const statusStyle = STATUS_CONFIG[doc.status] || STATUS_CONFIG.DRAFT;

  const handleSaveDraft = async () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/documents/${doc.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            slug,
            sourceMarkdown: markdown,
            changeSummary: 'Saved from Studio editor',
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Failed to save draft');

        setDoc(data.document);
        if (data.revision) {
          setRevisions((prev) => [data.revision, ...prev]);
        }
        setMessage({ text: 'Draft saved successfully.' });
      } catch (err: any) {
        setMessage({ text: err.message, error: true });
      }
    });
  };

  const handleWorkflowAction = async (action: 'submit' | 'approve' | 'publish' | 'unpublish') => {
    setMessage(null);
    startTransition(async () => {
      try {
        let endpoint = '';
        let method = 'POST';

        if (action === 'publish') {
          endpoint = `/api/v1/documents/${doc.id}/publish`;
        } else {
          // General workflow triggers
          endpoint = `/api/v1/documents/${doc.id}/${action}`;
        }

        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `Failed to ${action} document`);

        setDoc(data.document || data);
        setMessage({ text: `Document transitioned via '${action}'.` });
      } catch (err: any) {
        setMessage({ text: err.message, error: true });
      }
    });
  };

  const handleRestoreRevision = async (revisionId: string) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/documents/${doc.id}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Failed to restore revision');

        const targetRev = revisions.find((r) => r.id === revisionId);
        if (targetRev) {
          setMarkdown(targetRev.sourceMarkdown);
        }
        setMessage({ text: `Revision restored successfully.` });
      } catch (err: any) {
        setMessage({ text: err.message, error: true });
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* Top Action Bar */}
      <header className="h-16 px-6 border-b border-line bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-bold bg-transparent border-b border-transparent hover:border-line focus:border-accent outline-none text-ink w-80 truncate"
            placeholder="Document Title..."
          />
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
          >
            {statusStyle.label}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {message && (
            <span
              className={`text-xs font-medium ${
                message.error ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {message.text}
            </span>
          )}

          <button
            onClick={handleSaveDraft}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium rounded border border-line bg-surface hover:bg-surface-strong text-ink transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save Draft'}
          </button>

          {doc.status === 'DRAFT' && (
            <button
              onClick={() => handleWorkflowAction('submit')}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium rounded bg-amber-700 text-surface hover:bg-amber-800 transition-colors disabled:opacity-50"
            >
              Submit for Review
            </button>
          )}

          {doc.status === 'IN_REVIEW' && (
            <button
              onClick={() => handleWorkflowAction('approve')}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-700 text-surface hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              Approve Content
            </button>
          )}

          {(doc.status === 'APPROVED' || doc.status === 'DRAFT') && (
            <button
              onClick={() => handleWorkflowAction('publish')}
              disabled={isPending}
              className="px-3.5 py-1.5 text-xs font-medium rounded bg-ink text-surface hover:bg-neutral-800 transition-colors shadow-sm disabled:opacity-50"
            >
              Publish
            </button>
          )}

          {doc.status === 'PUBLISHED' && (
            <button
              onClick={() => handleWorkflowAction('unpublish')}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium rounded border border-red-300 text-red-800 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Unpublish
            </button>
          )}
        </div>
      </header>

      {/* Editor & Viewport Split */}
      <div className="flex-1 flex min-h-0">
        {/* Main Editor Surface */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-line bg-surface">
          {/* Subheader tabs */}
          <div className="h-10 px-6 border-b border-line flex items-center justify-between text-xs text-muted">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setActiveTab('editor')}
                className={`font-semibold pb-2 border-b-2 transition-colors ${
                  activeTab === 'editor'
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                Markdown Editor
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`font-semibold pb-2 border-b-2 transition-colors ${
                  activeTab === 'preview'
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                Live Preview
              </button>
              <button
                onClick={() => setActiveTab('revisions')}
                className={`font-semibold pb-2 border-b-2 transition-colors ${
                  activeTab === 'revisions'
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                Revisions ({revisions.length})
              </button>
            </div>
            <span>Slug: /{slug}</span>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'editor' && (
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="w-full h-full min-h-[500px] font-mono text-sm bg-transparent outline-none resize-none text-ink leading-relaxed"
                placeholder="Write Markdown content here..."
              />
            )}

            {activeTab === 'preview' && (
              <div className="prose-editorial max-w-2xl mx-auto py-4">
                <h1>{title}</h1>
                <div
                  className="mt-6 space-y-4 text-ink-soft leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html:
                      markdown
                        .split('\n\n')
                        .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
                        .join('') || '<p className="text-muted">Empty preview.</p>',
                  }}
                />
              </div>
            )}

            {activeTab === 'revisions' && (
              <div className="space-y-4 max-w-2xl mx-auto py-2">
                <h3 className="text-sm font-semibold text-ink">Revision History</h3>
                <div className="divide-y divide-line border border-line rounded bg-surface">
                  {revisions.map((rev) => (
                    <div
                      key={rev.id}
                      className="p-4 flex items-center justify-between text-xs hover:bg-surface-strong/30"
                    >
                      <div>
                        <div className="font-semibold text-ink">
                          Revision #{rev.revisionNumber}{' '}
                          {rev.id === doc.publishedRevisionId && (
                            <span className="ml-2 text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                              Current Published
                            </span>
                          )}
                        </div>
                        <div className="text-muted mt-0.5">
                          {new Date(rev.createdAt).toLocaleString()} &bull; {rev.wordCount} words &bull;{' '}
                          {rev.changeSummary || 'Draft update'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestoreRevision(rev.id)}
                        className="px-2.5 py-1 rounded border border-line hover:bg-surface-strong font-medium text-accent"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Inspector */}
        <aside className="w-80 bg-canvas p-6 space-y-6 shrink-0 overflow-y-auto hidden lg:block">
          <div>
            <h4 className="text-xs uppercase tracking-wider font-semibold text-muted mb-3">
              Document Metadata
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted font-medium mb-1">Slug</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-line bg-surface text-ink outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-muted font-medium mb-1">Document ID</label>
                <div className="font-mono text-muted select-all">{doc.id}</div>
              </div>
              <div>
                <label className="block text-muted font-medium mb-1">Author</label>
                <div className="text-ink font-medium">{doc.authorId}</div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-line">
            <h4 className="text-xs uppercase tracking-wider font-semibold text-muted mb-2">
              Content Metrics
            </h4>
            <div className="space-y-1.5 text-xs text-ink-soft">
              <div>Word Count: ~{markdown.split(/\s+/).filter(Boolean).length}</div>
              <div>Reading Time: ~{Math.ceil((markdown.split(/\s+/).filter(Boolean).length / 200) * 60)}s</div>
              <div>Revisions: {revisions.length}</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
