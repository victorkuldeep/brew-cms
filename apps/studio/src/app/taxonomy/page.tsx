import React from 'react';
import { cms } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export default async function TaxonomyPage() {
  const topics = await cms.taxonomyService.listTopics();
  const tags = await cms.taxonomyService.listTags();
  const series = await cms.taxonomyService.listSeries();

  return (
    <div className="flex-1 p-8 bg-canvas overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Taxonomy & Organization</h1>
          <p className="text-xs text-muted mt-1">
            Governed classification models: hierarchical topics, freeform tags, and ordered narrative series.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Topics Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
                Topics ({topics.length})
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-line text-muted">
                Hierarchical
              </span>
            </div>

            <div className="bg-surface rounded-lg border border-line divide-y divide-line">
              {topics.length === 0 ? (
                <div className="p-4 text-xs text-muted text-center">No topics created.</div>
              ) : (
                topics.map((t) => (
                  <div key={t.id} className="p-4 hover:bg-surface-strong/30 transition-colors">
                    <div className="font-semibold text-xs text-ink">{t.name}</div>
                    <div className="text-[11px] font-mono text-muted mt-0.5">/{t.slug}</div>
                    {t.description && (
                      <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tags Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
                Tags ({tags.length})
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-line text-muted">
                Freeform
              </span>
            </div>

            <div className="bg-surface rounded-lg border border-line p-4">
              {tags.length === 0 ? (
                <div className="text-xs text-muted text-center">No tags created.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-canvas border border-line text-ink hover:border-accent transition-colors"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Series Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
                Series ({series.length})
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-line text-muted">
                Ordered
              </span>
            </div>

            <div className="bg-surface rounded-lg border border-line divide-y divide-line">
              {series.length === 0 ? (
                <div className="p-4 text-xs text-muted text-center">No series created.</div>
              ) : (
                series.map((s) => (
                  <div key={s.id} className="p-4 hover:bg-surface-strong/30 transition-colors">
                    <div className="font-semibold text-xs text-ink">{s.name}</div>
                    <div className="text-[11px] font-mono text-muted mt-0.5">/{s.slug}</div>
                    {s.description && (
                      <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
                        {s.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
