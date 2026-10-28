/**
 * Build script for the test extension.
 * Runs Vite first for main bundles, then esbuild for content-script (IIFE format).
 */
import * as esbuild from 'esbuild';
import { createRequire } from 'module';
import path from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const localRequire = createRequire(import.meta.url);

// Node.js built-ins to mark as external (will be polyfilled at runtime)
const nodeBuiltins = new Set([
  'assert', 'buffer', 'crypto', 'events', 'fs', 'http', 'https', 'net',
  'os', 'path', 'process', 'querystring', 'stream', 'string_decoder',
  'tls', 'url', 'util', 'zlib', 'worker_threads', 'perf_hooks',
  'node:assert', 'node:buffer', 'node:crypto', 'node:events', 'node:fs',
  'node:http', 'node:https', 'node:net', 'node:os', 'node:path',
  'node:process', 'node:querystring', 'node:stream', 'node:string_decoder',
  'node:tls', 'node:url', 'node:util', 'node:zlib', 'node:worker_threads',
  'node:perf_hooks',
]);

const nodeModulesPlugin = {
  name: 'node-modules-resolver',
  setup(build) {
    // Handle Node.js built-ins
    build.onResolve({ filter: /.*/ }, (args) => {
      if (nodeBuiltins.has(args.path)) {
        // Return empty module for browser
        return { path: args.path, namespace: 'node-builtin' };
      }
      if (args.path.startsWith('.') || args.path.startsWith('/')) {
        return undefined;
      }
      try {
        const resolved = localRequire.resolve(args.path, {
          paths: [path.resolve('node_modules')],
        });
        return { path: resolved };
      } catch {
        return undefined;
      }
    });

    // Return empty modules for Node built-ins
    build.onLoad({ filter: /.*/, namespace: 'node-builtin' }, () => {
      return { contents: 'export default {}; export const inspect = (x) => String(x);', loader: 'js' };
    });
  },
};

// Step 1: Run Vite build
console.log('Step 1: Running Vite build...');
execSync('npx vite build --config vite.extension.config.ts', { stdio: 'inherit' });

// Step 2: Build content-script as IIFE (Chrome content scripts don't support ES modules)
console.log('');
console.log('Step 2: Building content-script (IIFE format)...');
await esbuild.build({
  entryPoints: ['test-extension/src/content-script.ts'],
  bundle: true,
  outfile: 'test-extension/dist/content-script.js',
  format: 'iife',
  platform: 'browser',
  plugins: [nodeModulesPlugin],
  logLevel: 'info',
});

// Step 3: Copy static files
console.log('');
console.log('Step 3: Copying static files...');
copyFileSync(
  'test-extension/src/offscreen/offscreen-dist.html',
  'test-extension/dist/offscreen.html'
);
console.log('Copied offscreen.html to dist/');

// Step 4: Copy WASM files to extension root so /wasm/ paths resolve correctly.
// The built JS references WASM via `new URL("/wasm/...", import.meta.url)` which resolves
// to the extension root, not the dist/ subdirectory.
const wasmSrcDir = 'test-extension/dist/wasm';
const wasmDestDir = 'test-extension/wasm';
if (existsSync(wasmSrcDir)) {
  mkdirSync(wasmDestDir, { recursive: true });
  const wasmFiles = ['noirc_abi_wasm_bg.wasm', 'acvm_js_bg.wasm'];
  for (const file of wasmFiles) {
    const src = path.join(wasmSrcDir, file);
    const dest = path.join(wasmDestDir, file);
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`Copied ${file} to ${wasmDestDir}/`);
    }
  }
}

console.log('');
console.log('Extension build complete!');
console.log('Load the extension from: test-extension/');
