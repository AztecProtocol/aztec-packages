import { esbuildPlugin } from '@web/dev-server-esbuild';
import { defaultReporter } from '@web/test-runner';
import { summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';
import { fileURLToPath } from 'url';
import { importMapsPlugin } from '@web/dev-server-import-maps';

const reporter = process.env.CI ? summaryReporter() : defaultReporter();

export default {
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    // playwrightLauncher({ product: "webkit" }),
    // playwrightLauncher({ product: "firefox" }),
  ],
  plugins: [
    importMapsPlugin({
      inject: {
        importMap: {
          imports: { '@aztec/bb.js': '../../barretenberg/ts/dest/browser/index.js' },
        },
      },
    }),
    esbuildPlugin({
      ts: true,
    }),
  ],
  files: ['./src/browser*.test.ts'],
  rootDir: fileURLToPath(new URL('../../', import.meta.url)),
  nodeResolve: true,
  testsFinishTimeout: 120_000_000,
  reporters: [reporter],
};
