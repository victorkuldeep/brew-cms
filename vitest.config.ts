import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@brew-cms/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@brew-cms/content': path.resolve(__dirname, 'packages/content/src/index.ts'),
      '@brew-cms/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
      '@brew-cms/auth': path.resolve(__dirname, 'packages/auth/src/index.ts'),
      '@brew-cms/policy': path.resolve(__dirname, 'packages/policy/src/index.ts'),
      '@brew-cms/events': path.resolve(__dirname, 'packages/events/src/index.ts'),
      '@brew-cms/media': path.resolve(__dirname, 'packages/media/src/index.ts'),
      '@brew-cms/search': path.resolve(__dirname, 'packages/search/src/index.ts'),
      '@brew-cms/intelligence': path.resolve(__dirname, 'packages/intelligence/src/index.ts'),
      '@brew-cms/client': path.resolve(__dirname, 'packages/client/src/index.ts'),
      '@brew-cms/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
      '@brew-cms/api': path.resolve(__dirname, 'packages/api/src/index.ts'),
      '@brew-cms/cli': path.resolve(__dirname, 'packages/cli/src/index.ts'),
      '@brew-cms/mcp': path.resolve(__dirname, 'packages/mcp/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    },
  },
});
