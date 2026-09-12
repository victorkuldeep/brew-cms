import { describe, it, expect, afterAll } from 'vitest';
import { LocalMediaProvider } from '../local-provider.js';
import { ValidationError } from '@brew-cms/core';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

describe('Media Provider & Upload Security', () => {
  const testUploadDir = path.resolve(process.cwd(), '.tmp_test_uploads');
  const provider = new LocalMediaProvider({
    uploadDir: testUploadDir,
    baseUrl: 'http://localhost:3000/uploads',
  });

  afterAll(async () => {
    await fs.rm(testUploadDir, { recursive: true, force: true });
  });

  it('successfully stores valid PNG media with correct magic bytes and checksum', async () => {
    // Valid PNG header: 89 50 4E 47 0D 0A 1A 0A
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const asset = await provider.put({
      filename: 'test-diagram.png',
      mimeType: 'image/png',
      content: pngHeader,
    });

    expect(asset.provider).toBe('local');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.url).toContain('/uploads/');
    expect(asset.checksum).toHaveLength(64);
  });

  it('rejects forbidden file extensions like .exe or .sh', async () => {
    const buffer = Buffer.from('malicious script');
    await expect(
      provider.put({
        filename: 'malware.sh',
        mimeType: 'image/png',
        content: buffer,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects files where content magic bytes do not match MIME type', async () => {
    // Declared image/jpeg but content is plain text
    const textBuffer = Buffer.from('This is definitely not a JPEG image.');
    await expect(
      provider.put({
        filename: 'fake-photo.jpg',
        mimeType: 'image/jpeg',
        content: textBuffer,
      })
    ).rejects.toThrow(ValidationError);
  });
});
