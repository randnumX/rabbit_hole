import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');
const distDir = path.resolve(root, 'dist');
const watchEnabled = process.argv.includes('--watch');

const sharedConfig = {
  configFile: false,
  root,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@rabbithole/shared-types': path.resolve(root, '../../packages/shared-types/src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(watchEnabled ? 'development' : 'production'),
  },
};

function buildConfig({
  input,
  entryFileName,
  format,
  emptyOutDir,
  inlineDynamicImports = false,
  name,
  publicDir,
}) {
  return {
    ...sharedConfig,
    publicDir,
    build: {
      emptyOutDir,
      outDir: distDir,
      target: 'es2022',
      minify: watchEnabled ? false : 'esbuild',
      watch: watchEnabled ? {} : null,
      rollupOptions: {
        input,
        output: {
          format,
          name,
          inlineDynamicImports,
          entryFileNames: entryFileName,
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  };
}

await build(
  buildConfig({
    input: path.resolve(root, 'src/background/index.ts'),
    entryFileName: 'assets/background.js',
    format: 'es',
    emptyOutDir: true,
    publicDir: path.resolve(root, 'public'),
  }),
);

await build(
  buildConfig({
    input: path.resolve(root, 'src/content/index.ts'),
    entryFileName: 'assets/content.js',
    format: 'iife',
    name: 'RabbitHoleContent',
    inlineDynamicImports: true,
    emptyOutDir: false,
    publicDir: false,
  }),
);
