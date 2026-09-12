import { ValidationError } from '@brew-cms/core';
import { DEFAULT_ALLOWED_MIME_TYPES, FORBIDDEN_EXTENSIONS, type MediaValidationConfig } from './types.js';

const MAGIC_BYTES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // starts with RIFF
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

export function validateUpload(
  filename: string,
  mimeType: string,
  buffer: Uint8Array | Buffer,
  config: MediaValidationConfig = {}
): void {
  const maxBytes = config.maxSizeBytes ?? 10 * 1024 * 1024; // 10MB
  const allowedMimes = config.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;

  // 1. File size check
  if (buffer.length > maxBytes) {
    throw new ValidationError(`File size (${buffer.length} bytes) exceeds limit of ${maxBytes} bytes.`);
  }

  // 2. MIME allowlist check
  if (!allowedMimes.includes(mimeType)) {
    throw new ValidationError(`MIME type '${mimeType}' is not permitted.`);
  }

  // 3. Filename check
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    throw new ValidationError(`File extension '.${ext}' is forbidden for security.`);
  }

  // 4. Magic bytes verification (for binary formats)
  const magic = MAGIC_BYTES.find((m) => m.mime === mimeType);
  if (magic && buffer.length >= magic.bytes.length) {
    const matches = magic.bytes.every((expectedByte, idx) => buffer[idx] === expectedByte);
    if (!matches) {
      throw new ValidationError(`File content magic bytes do not match declared MIME type '${mimeType}'.`);
    }
  }
}

export function sanitizeFilename(filename: string): string {
  // Prevent path traversal and special characters
  const basename = filename.replace(/^.*[\\/]/, '');
  return basename
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_');
}
