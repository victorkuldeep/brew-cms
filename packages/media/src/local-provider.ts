import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { MediaProvider, StoredAsset, UploadInput } from '@brew-cms/core';
import { validateUpload, sanitizeFilename } from './validator.js';
import type { MediaValidationConfig } from './types.js';

export interface LocalMediaConfig {
  uploadDir: string;
  baseUrl: string;
  validation?: MediaValidationConfig;
}

export class LocalMediaProvider implements MediaProvider {
  constructor(private readonly config: LocalMediaConfig) {}

  async put(input: UploadInput): Promise<StoredAsset> {
    const rawBuffer = Buffer.isBuffer(input.content)
      ? input.content
      : Buffer.from(input.content);

    // Validate
    validateUpload(input.filename, input.mimeType, rawBuffer, this.config.validation);

    // Compute checksum
    const checksum = createHash('sha256').update(rawBuffer).digest('hex');

    // Safe sanitized path
    const safeName = sanitizeFilename(input.filename);
    const prefix = input.prefix ? input.prefix.replace(/[^\w-]/g, '') : '';
    const key = prefix ? `${prefix}/${Date.now()}-${safeName}` : `${Date.now()}-${safeName}`;

    const targetPath = path.resolve(this.config.uploadDir, key);

    // Ensure directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rawBuffer);

    const normalizedKey = key.replace(/\\/g, '/');
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/${normalizedKey}`;

    return {
      provider: 'local',
      providerKey: normalizedKey,
      url,
      sizeBytes: rawBuffer.length,
      mimeType: input.mimeType,
      checksum,
    };
  }

  async get(key: string): Promise<{ url: string; stream?: unknown }> {
    const safeKey = key.replace(/\.\./g, '');
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/${safeKey}`;
    return { url };
  }

  async delete(key: string): Promise<void> {
    const safeKey = key.replace(/\.\./g, '');
    const targetPath = path.resolve(this.config.uploadDir, safeKey);
    try {
      await fs.unlink(targetPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}
