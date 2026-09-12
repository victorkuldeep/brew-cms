import type { MediaProvider, StoredAsset, UploadInput } from '@brew-cms/core';

export type { MediaProvider, StoredAsset, UploadInput };

export interface MediaValidationConfig {
  maxSizeBytes?: number; // default 10MB
  allowedMimeTypes?: string[];
}

export const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/webm',
];

export const FORBIDDEN_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'js', 'mjs', 'cjs', 'ts', 'html', 'htm', 'jar', 'vbs', 'ps1'
]);
