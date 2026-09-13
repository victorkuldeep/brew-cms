import React from 'react';
import { cms } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const assets = await cms.mediaService.listAssets({ limit: 50 });

  return (
    <div className="flex-1 p-8 bg-canvas overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink tracking-tight">Media Library</h1>
            <p className="text-xs text-muted mt-1">
              Deterministic, checksummed digital assets with safe MIME validation and local or object storage.
            </p>
          </div>
          <div className="text-xs font-semibold px-3 py-1.5 rounded bg-surface border border-line text-ink">
            {assets.length} Assets
          </div>
        </div>

        {/* Media Grid */}
        {assets.length === 0 ? (
          <div className="bg-surface rounded-lg border border-line p-12 text-center">
            <div className="text-sm font-semibold text-ink">No media assets found</div>
            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
              Assets uploaded via Studio or the REST API are cataloged with SHA-256 checksums and verified magic bytes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="bg-surface rounded-lg border border-line overflow-hidden shadow-sm flex flex-col hover:border-accent transition-colors"
              >
                <div className="h-36 bg-surface-strong flex items-center justify-center border-b border-line text-xs font-mono text-muted p-4 text-center break-all">
                  {asset.mimeType.startsWith('image/') ? (
                    <span className="text-ink font-semibold">{asset.providerKey}</span>
                  ) : (
                    <span className="text-muted">{asset.mimeType}</span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-3 text-xs">
                  <div>
                    <div className="font-semibold text-ink truncate" title={asset.providerKey}>
                      {asset.altText || asset.providerKey}
                    </div>
                    <div className="text-muted text-[11px] mt-0.5">
                      {asset.mimeType} &bull; {(asset.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line text-[10px] text-muted space-y-1 font-mono">
                    <div className="truncate" title={asset.id}>
                      ID: {asset.id}
                    </div>
                    <div>Provider: {asset.provider}</div>
                    <div>{new Date(asset.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
