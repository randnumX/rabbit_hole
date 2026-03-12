/// <reference types="vitest/config" />

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      '@rabbithole/shared-types': path.resolve(dirname, '../../packages/shared-types/src'),
    },
  },
  publicDir: path.resolve(dirname, 'public'),
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
