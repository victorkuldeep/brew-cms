import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { resolveStoragePaths } from '../storage-paths.js';

const TEST_ROOT = path.join(os.tmpdir(), `brew-cms-storage-test-${process.pid}`);

describe('resolveStoragePaths', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.BREW_STORAGE_ROOT;
    delete process.env.STORAGE_ROOT;
    delete process.env.BREW_DB_PATH;
    delete process.env.CMS_DB_PATH;
    delete process.env.DATABASE_URL;
    delete process.env.BREW_MEDIA_DIR;
    delete process.env.MEDIA_UPLOAD_DIR;
    delete process.env.BREW_MODEL_CACHE_DIR;
    delete process.env.MODEL_CACHE_DIR;
  });

  afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('honors BREW_STORAGE_ROOT and auto-creates data/media/models dirs', () => {
    const paths = resolveStoragePaths({ root: TEST_ROOT });

    expect(paths.root).toBe(TEST_ROOT);
    expect(paths.dbPath).toBe(path.join(TEST_ROOT, 'data', 'brew.db'));
    expect(paths.mediaDir).toBe(path.join(TEST_ROOT, 'media'));
    expect(paths.modelsDir).toBe(path.join(TEST_ROOT, 'models', 'transformers'));
    for (const dir of [paths.dataDir, paths.mediaDir, paths.modelsDir]) {
      expect(fs.existsSync(dir)).toBe(true);
    }
  });

  it('honors explicit env overrides for db, media and model cache', () => {
    process.env.BREW_STORAGE_ROOT = TEST_ROOT;
    process.env.BREW_DB_PATH = path.join(TEST_ROOT, 'custom.db');
    process.env.BREW_MEDIA_DIR = path.join(TEST_ROOT, 'assets');
    process.env.MODEL_CACHE_DIR = path.join(TEST_ROOT, 'weights');

    const paths = resolveStoragePaths();

    expect(paths.dbPath).toBe(path.join(TEST_ROOT, 'custom.db'));
    expect(paths.mediaDir).toBe(path.join(TEST_ROOT, 'assets'));
    expect(paths.modelsDir).toBe(path.join(TEST_ROOT, 'weights'));
  });

  it('resolves file: DATABASE_URL but ignores remote DSNs', () => {
    process.env.BREW_STORAGE_ROOT = TEST_ROOT;
    process.env.DATABASE_URL = 'file:./data/custom.db';
    expect(resolveStoragePaths().dbPath).toBe('./data/custom.db');

    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/brew';
    expect(resolveStoragePaths().dbPath).toBe(path.join(TEST_ROOT, 'data', 'brew.db'));
  });
});
