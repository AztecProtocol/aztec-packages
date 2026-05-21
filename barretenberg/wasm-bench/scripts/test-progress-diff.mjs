#!/usr/bin/env node
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dir = await mkdtemp(resolve(tmpdir(), 'wasm-bench-progress-diff-'));
try {
  const base = resolve(dir, 'base-progress.jsonl');
  const head = resolve(dir, 'head-progress.jsonl');
  await writeFile(
    base,
    [
      { phase: 'fetch_wasm', elapsedMs: 1000, source: 'worker' },
      { phase: 'chonk_setup', elapsedMs: 5000, source: 'worker' },
      { phase: 'done', elapsedMs: 9000, source: 'worker', final: true },
    ].map((row) => JSON.stringify(row)).join('\n') + '\n',
  );
  await writeFile(
    head,
    [
      { phase: 'fetch_wasm', elapsedMs: 1200, source: 'worker' },
      { phase: 'chonk_setup', elapsedMs: 4700, source: 'worker' },
      { phase: 'done', elapsedMs: 8800, source: 'worker', final: true },
    ].map((row) => JSON.stringify(row)).join('\n') + '\n',
  );

  const child = spawnSync(process.execPath, [resolve(__dirname, 'progress-diff.mjs'), '--base', base, '--head', head], {
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.match(child.stdout, /\[head=1\.2s base=1\.0s delta=\+0\.2s\] worker phase=fetch_wasm/);
  assert.match(child.stdout, /\[head=4\.7s base=5\.0s delta=-0\.3s\] worker phase=chonk_setup/);
  assert.match(child.stdout, /\[head=8\.8s base=9\.0s delta=-0\.2s\] worker phase=done/);
} finally {
  await rm(dir, { recursive: true, force: true });
}
