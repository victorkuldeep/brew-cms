import type { Actor, MediaAsset } from '../domain/types.js';
import type { MediaAssetRepository, AuditEventRepository } from '../ports/repositories.js';
import type { MediaProvider, IdGenerator, PolicyEnginePort } from '../ports/services.js';
import { PolicyDeniedError, ValidationError, NotFoundError } from '../domain/errors.js';

export interface MediaUploadInput {
  id?: string;
  filename?: string;
  mimeType?: string;
  contentBase64?: string;
  prefix?: string;
  providerKey?: string;
  sizeBytes?: number;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Media application service (Charter: single service layer for REST/MCP/CLI).
 * Owns the provider→repository orchestration that previously lived inline in
 * the REST router. Uploads are policy-gated (`media:create`); listing stays
 * an open read like taxonomy. NOTE: authors previously could upload without
 * a policy check — they now require an explicit `media:create` grant.
 */
export class MediaService {
  constructor(
    private readonly mediaProvider: MediaProvider | undefined,
    private readonly mediaRepo: MediaAssetRepository,
    private readonly policyEngine: PolicyEnginePort,
    private readonly auditRepo: AuditEventRepository,
    private readonly idGen: IdGenerator
  ) {}

  async listAssets(
    filter?: { mimeType?: string; limit?: number; offset?: number }
  ): Promise<MediaAsset[]> {
    return this.mediaRepo.list(filter);
  }

  async getAsset(id: string): Promise<MediaAsset & { url?: string | null }> {
    const asset = await this.mediaRepo.findById(id);
    if (!asset) {
      throw new NotFoundError('MediaAsset', id);
    }
    let url: string | null = null;
    if (this.mediaProvider) {
      try {
        url = (await this.mediaProvider.get(asset.providerKey)).url ?? null;
      } catch {
        url = null;
      }
    }
    return { ...asset, url };
  }

  async uploadAsset(actor: Actor, input: MediaUploadInput): Promise<MediaAsset & { url?: string | null }> {
    const policyResult = await this.policyEngine.evaluate({
      actor,
      action: 'media:create',
      resourceType: 'media_asset',
      payload: { filename: input.filename, mimeType: input.mimeType },
    });
    if (policyResult.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policyResult.decision, policyResult.reason);
    }

    let stored: { provider: 'local' | 's3' | 'r2'; providerKey: string; sizeBytes: number; url: string } | null = null;
    if (this.mediaProvider && input.contentBase64) {
      if (!input.filename || !input.mimeType) {
        throw new ValidationError('filename and mimeType are required for binary upload.');
      }
      stored = await this.mediaProvider.put({
        filename: input.filename,
        mimeType: input.mimeType,
        content: Buffer.from(input.contentBase64, 'base64'),
        prefix: input.prefix,
      });
    }

    const saved = await this.mediaRepo.create({
      id: input.id || `med_${Date.now()}`,
      provider: stored?.provider || 'local',
      providerKey: stored?.providerKey || input.providerKey || input.filename || 'unknown',
      mimeType: input.mimeType || 'application/octet-stream',
      sizeBytes: stored?.sizeBytes ?? input.sizeBytes ?? 0,
      width: input.width ?? null,
      height: input.height ?? null,
      altText: input.altText ?? null,
      caption: input.caption ?? null,
      metadata: input.metadata ?? null,
      createdBy: actor.id,
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'media.uploaded',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'media_asset',
      resourceId: saved.id,
      after: { id: saved.id, providerKey: saved.providerKey, mimeType: saved.mimeType },
    });

    return { ...saved, url: stored?.url ?? null };
  }

  async deleteAsset(actor: Actor, id: string): Promise<{ id: string }> {
    const policyResult = await this.policyEngine.evaluate({
      actor,
      action: 'media:delete',
      resourceType: 'media_asset',
      resourceId: id,
    });
    if (policyResult.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policyResult.decision, policyResult.reason);
    }

    const asset = await this.mediaRepo.findById(id);
    if (!asset) {
      throw new NotFoundError('MediaAsset', id);
    }

    // Best-effort bytes removal; the record delete below is authoritative.
    if (this.mediaProvider) {
      try {
        await this.mediaProvider.delete(asset.providerKey);
      } catch {}
    }
    await this.mediaRepo.delete(id);

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'media.deleted',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'media_asset',
      resourceId: id,
      before: { id: asset.id, providerKey: asset.providerKey },
    });

    return { id };
  }
}
