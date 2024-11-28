import { defaultReporter } from '@web/test-runner';
import { summaryReporter } from '@web/test-runner';
import { fileURLToPath } from 'url';
import { esbuildPlugin } from '@web/dev-server-esbuild';
import { playwrightLauncher } from '@web/test-runner-playwright';
import { fromRollup } from '@web/dev-server-rollup';
import { importMapsPlugin } from '@web/dev-server-import-maps';

import _commonjs from '@rollup/plugin-commonjs';

const commonjs = fromRollup(_commonjs);

const reporter = process.env.CI ? summaryReporter() : defaultReporter();

export default {
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    // playwrightLauncher({ product: "webkit" }),
    // playwrightLauncher({ product: "firefox" }),
  ],
  plugins: [
    importMapsPlugin(),
    esbuildPlugin({
      ts: true,
      target: 'esnext',
    }),
    commonjs(),
  ],
  files: ['./src/**/indexeddb/*.test.ts'],
  rootDir: fileURLToPath(new URL('../', import.meta.url)),
  nodeResolve: true,
  debug: true,
  reporters: [reporter],
};
