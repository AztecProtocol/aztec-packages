import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { build } from 'esbuild';

import { defaultDistDir, packageRoot, repoRoot } from './lib.mjs';

const distDir = resolve(process.env.WASM_BENCH_DIST_DIR || defaultDistDir);
const allowMissing = process.env.WASM_BENCH_ALLOW_MISSING_WASM === '1';
const wasmOutputs = [
  {
    source: resolve(repoRoot, 'barretenberg/cpp/build-wasm/bin/barretenberg.wasm.gz'),
    dest: 'barretenberg.wasm.gz',
    label: 'single-thread wasm',
    optional: true,
    command: 'cd barretenberg/cpp && cmake --preset wasm -DENABLE_WASM_BENCH=ON && cmake --build --preset wasm --target barretenberg.wasm.gz',
  },
  {
    source: resolve(repoRoot, 'barretenberg/cpp/build-wasm-threads/bin/barretenberg.wasm.gz'),
    dest: 'barretenberg-threads.wasm.gz',
    label: 'threaded wasm',
    optional: false,
    command: 'cd barretenberg/cpp && cmake --preset wasm-threads && cmake --build --preset wasm-threads --target barretenberg.wasm.gz',
  },
];

async function assertReadable(path, label, command, { optional = false } = {}) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) {
      throw new Error(`${label} is empty`);
    }
    return true;
  } catch (error) {
    if (optional || allowMissing) {
      console.warn(`warning: ${label} not found at ${path} — skipping`);
      return false;
    }
    throw new Error(`${label} not found at ${path}.\nBuild it first:\n  ${command}`, { cause: error });
  }
}

await rm(distDir, { recursive: true, force: true });
await mkdir(resolve(distDir, 'wasm'), { recursive: true });

await build({
  entryPoints: [
    resolve(packageRoot, 'src/main.js'),
    resolve(packageRoot, 'src/bench-worker.js'),
    resolve(packageRoot, 'src/thread-worker.js'),
  ],
  outdir: distDir,
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'info',
});

await copyFile(resolve(packageRoot, 'src/index.html'), resolve(distDir, 'index.html'));

for (const output of wasmOutputs) {
  const present = await assertReadable(output.source, output.label, output.command, { optional: output.optional });
  if (present) {
    await copyFile(output.source, resolve(distDir, 'wasm', output.dest));
  }
}

console.log(`Built wasm bench into ${distDir}`);
