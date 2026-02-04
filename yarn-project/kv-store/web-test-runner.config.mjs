import { esbuildPlugin } from '@web/dev-server-esbuild';
import { importMapsPlugin } from '@web/dev-server-import-maps';
import { defaultReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Stub plugin for Node.js modules that aren't browser-compatible
function browserStubsPlugin() {
  const stubs = {
    'foundation/dest/log': 'foundation-log.js',
    'foundation/dest/eth-address': 'eth-address.js',
  };

  return {
    name: 'browser-stubs',
    transform(context) {
      for (const [pathFragment, stubFile] of Object.entries(stubs)) {
        if (context.path.includes(pathFragment)) {
          const stubPath = path.resolve(__dirname, 'browser-stubs', stubFile);
          return { body: readFileSync(stubPath, 'utf-8'), transformCache: false };
        }
      }
    },
    resolveMimeType(context) {
      if (context.path.includes('browser-stubs')) {
        return 'js';
      }
    },
  };
}

/** @type {import('@web/test-runner').TestRunnerConfig} */
export default {
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    playwrightLauncher({ product: 'webkit' }),
    playwrightLauncher({ product: 'firefox' }),
  ],
  plugins: [
    browserStubsPlugin(),
    importMapsPlugin({
      inject: {
        importMap: {
          imports: {
            buffer: '/kv-store/browser-stubs/buffer.js',
            util: '/node_modules/util/util.js',
          },
        },
      },
    }),
    esbuildPlugin({
      ts: true,
      target: 'auto',
    }),
  ],
  files: ['./src/**/indexeddb/*.test.ts'],
  testRunnerHtml: testFramework => `
    <!DOCTYPE html>
    <html>
    <head>
      <script type="module">
        // Load buffer polyfill as global before any tests run
        import('buffer').then(mod => {
          window.Buffer = mod.Buffer;
          globalThis.Buffer = mod.Buffer;
        });
      </script>
    </head>
    <body>
      <script type="module" src="${testFramework}"></script>
    </body>
    </html>
  `,
  rootDir: fileURLToPath(new URL('../', import.meta.url)),
  nodeResolve: true,
  reporters: [defaultReporter()],
  concurrency: 1,
  concurrentBrowsers: 1,
};
