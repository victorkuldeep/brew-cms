import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Persistent storage locations for a BrewCMS host.
 *
 * Resolution order for the storage root:
 *   1. Explicit `options.root`
 *   2. `BREW_STORAGE_ROOT` (or legacy `STORAGE_ROOT`) env var
 *   3. `<os.homedir()>/storage` when it exists — the persistent disk on
 *      shared Node.js hosts (e.g. Hostinger), where `process.cwd()` points
 *      at a versioned deploy directory that is wiped on every deploy
 *   4. `<cwd>/storage` (created on demand) — local development fallback
 *
 * All returned directories are created on demand (`recursive: true`), so
 * calling this at startup self-heals missing persistent directories.
 */
export interface StoragePaths {
  /** Persistent storage root. */
  root: string;
  /** Writable data dir (SQLite lives here by default). */
  dataDir: string;
  /** Default SQLite database file. */
  dbPath: string;
  /** Writable media upload dir. */
  mediaDir: string;
  /** Persistent ONNX/transformers model cache dir. */
  modelsDir: string;
}

export interface StoragePathOptions {
  root?: string;
  dbPath?: string;
  mediaDir?: string;
  modelsDir?: string;
}

/**
 * Returns the sqlite file path from the environment, or `undefined` when
 * the env points at a remote DSN (e.g. `mysql://...`) instead of a file.
 */
function dbPathFromEnv(): string | undefined {
  const explicit = process.env.BREW_DB_PATH ?? process.env.CMS_DB_PATH;
  if (explicit) return explicit;

  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (url.startsWith('file:')) return url.replace(/^file:/, '');
  if (!url.includes('://')) return url; // bare filesystem path
  return undefined; // remote DSN — not a sqlite file
}

export function resolveStoragePaths(options: StoragePathOptions = {}): StoragePaths {
  let root = options.root ?? process.env.BREW_STORAGE_ROOT ?? process.env.STORAGE_ROOT;

  if (!root) {
    // `os.homedir()` is stable across deploys; `process.cwd()` is not.
    const hostingerRoot = path.join(os.homedir(), 'storage');
    if (fs.existsSync(hostingerRoot)) {
      root = hostingerRoot;
    } else {
      const candidates = [
        path.resolve(process.cwd(), 'storage'),
        path.resolve(process.cwd(), '../storage'),
      ];
      root = candidates.find((c) => fs.existsSync(c)) ?? path.resolve(process.cwd(), 'storage');
    }
  }

  const dataDir = path.join(root, 'data');
  const mediaDir =
    options.mediaDir ??
    process.env.BREW_MEDIA_DIR ??
    process.env.MEDIA_UPLOAD_DIR ??
    path.join(root, 'media');
  const dbPath = options.dbPath ?? dbPathFromEnv() ?? path.join(dataDir, 'brew.db');
  const modelsDir =
    options.modelsDir ??
    process.env.BREW_MODEL_CACHE_DIR ??
    process.env.MODEL_CACHE_DIR ??
    path.join(root, 'models', 'transformers');

  for (const dir of [dataDir, mediaDir, modelsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return { root, dataDir, dbPath, mediaDir, modelsDir };
}
