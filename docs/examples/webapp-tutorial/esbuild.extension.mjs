import * as esbuild from 'esbuild';
import { createRequire } from 'module';
import path from 'path';

// Resolve modules from local node_modules, bypassing any parent PnP manifest.
const localRequire = createRequire(import.meta.url);

const nodeModulesPlugin = {
  name: 'node-modules-resolver',
  setup(build) {
    build.onResolve({ filter: /^[^.]/ }, (args) => {
      try {
        const resolved = localRequire.resolve(args.path, {
          paths: [path.resolve('node_modules')],
        });
        return { path: resolved };
      } catch {
        return undefined; // fall through to default resolution
      }
    });
  },
};

await esbuild.build({
  entryPoints: [
    'test-extension/src/background.ts',
    'test-extension/src/content-script.ts',
  ],
  bundle: true,
  outdir: 'test-extension/dist',
  format: 'esm',
  platform: 'browser',
  plugins: [nodeModulesPlugin],
});
