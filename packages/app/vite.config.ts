/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgs = ['engine', 'genescript', 'content', 'ui', 'versus'];

// Resolve `@tierra26/<pkg>` → that package's src (bare → src/index.ts, subpath → src/<path>).
// The pure packages import each other via relative .ts paths, which resolve on disk; this alias
// just gives the app clean `@tierra26/ui/worker-core`-style imports. Shared by Vite + Vitest.
const alias = pkgs.flatMap((p) => [
  { find: new RegExp(`^@tierra26/${p}$`), replacement: resolve(here, `../${p}/src/index.ts`) },
  { find: new RegExp(`^@tierra26/${p}/(.*)$`), replacement: resolve(here, `../${p}/src`) + '/$1' },
]);

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
