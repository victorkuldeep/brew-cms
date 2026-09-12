'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewDocumentPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState<'post' | 'page' | 'guide'>('post');
  const [markdown, setMarkdown] = useState('# New Document\n\nWrite your content here...');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slug || slug === title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .slice(0, 60)
      );
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !slug.trim()) {
      setError('Title and slug are required.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/v1/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim(),
            type,
            sourceMarkdown: markdown,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Failed to create document');
        }

        const newId = data.document.id;
        router.push(`/documents/${newId}`);
      } catch (err: any) {
        setError(err.message);
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-canvas p-8 max-w-4xl mx-auto w-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/documents"
            className="text-xs text-muted hover:text-ink transition-colors mb-2 inline-block"
          >
            &larr; Back to Documents
          </Link>
          <h1 className="text-2xl font-bold text-ink">Create New Document</h1>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded bg-red-50 border border-red-200 text-xs text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-6">
        <div className="bg-surface p-6 rounded-lg border border-line shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1 uppercase tracking-wider">
                Document Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Architecture of Modern Operating Systems"
                className="w-full px-3 py-2 text-sm rounded border border-line bg-canvas text-ink outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1 uppercase tracking-wider">
                URL Slug
              </label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="architecture-of-modern-operating-systems"
                className="w-full px-3 py-2 text-sm font-mono rounded border border-line bg-canvas text-ink outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1 uppercase tracking-wider">
                Document Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2 text-sm rounded border border-line bg-canvas text-ink outline-none focus:border-accent"
              >
                <option value="post">Post (Article / Narrative)</option>
                <option value="page">Page (Static Standalone)</option>
                <option value="guide">Guide (Documentation / Tutorial)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-line shadow-sm space-y-2">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider">
            Initial Markdown Source
          </label>
          <textarea
            rows={12}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="w-full p-4 font-mono text-xs rounded border border-line bg-canvas text-ink outline-none focus:border-accent resize-y"
          />
        </div>

        <div className="flex justify-end space-x-3">
          <Link
            href="/documents"
            className="px-4 py-2 text-xs font-medium rounded border border-line bg-surface hover:bg-surface-strong text-ink transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-xs font-semibold rounded bg-ink text-surface hover:bg-neutral-800 transition-colors shadow-sm disabled:opacity-50"
          >
            {isPending ? 'Creating Draft...' : 'Create Draft & Open Editor'}
          </button>
        </div>
      </form>
    </div>
  );
}
