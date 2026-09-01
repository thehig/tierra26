/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import path from 'node:path';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { tierraContent } from './build/tierraContent.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgs = ['engine', 'genescript', 'content', 'ui', 'versus'];

// packages/app -> packages -> repo root -> docs. Passed to the plugin explicitly
// rather than derived inside it, so the plugin has no opinion about where it sits.
const docsDir = resolve(here, '../../docs');

// Vitest projects do NOT inherit the root `plugins` array from `extends: true`,
// so the content plugin has to be listed on each project as well as at the root.
// Without it a test importing `virtual:tierra-content` fails to resolve.
const content = () => tierraContent({ docsDir });

// Resolve `@tierra26/<pkg>` → that package's src (bare → src/index.ts, subpath → src/<path>).
// The pure packages import each other via relative .ts paths, which resolve on disk; this alias
// just gives the app clean `@tierra26/ui/worker-core`-style imports. Shared by Vite + Vitest.
const alias = pkgs.flatMap(p => [{
  find: new RegExp(`^@tierra26/${p}$`),
  replacement: resolve(here, `../${p}/src/index.ts`)
}, {
  find: new RegExp(`^@tierra26/${p}/(.*)$`),
  replacement: resolve(here, `../${p}/src`) + '/$1'
}]);
export default defineConfig({
  plugins: [content(), react()],
  resolve: {
    alias
  },
  worker: {
    format: 'es'
  },
  build: {
    rollupOptions: {
      output: {
        // React in its own cached chunk; CodeMirror is code-split via the editor's dynamic import.
        manualChunks: {
          react: ['react', 'react-dom']
        }
      }
    }
  },
  test: {
    projects: [{
      extends: true,
      test: {
        environment: 'node',
        include: ['test/**/*.test.ts']
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(here, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: 'playwright',
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});