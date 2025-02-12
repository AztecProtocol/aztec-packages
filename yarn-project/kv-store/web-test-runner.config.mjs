import { esbuildPlugin } from '@web/dev-server-esbuild';
import { dotReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';
import { fileURLToPath } from 'url';

export default {
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    // playwrightLauncher({ product: "webkit" }),
    // playwrightLauncher({ product: "firefox" }),
  ],
  plugins: [
    esbuildPlugin({
      ts: true,
    }),
  ],
  files: ['./src/**/indexeddb/*.test.ts'],
  rootDir: fileURLToPath(new URL('../', import.meta.url)),
  nodeResolve: true,
  reporters: [dotReporter()],
};
