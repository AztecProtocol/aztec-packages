#!/usr/bin/env node
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function row({ setup, prove, wall }) {
  return {
    payload: {
      ok: true,
      data: {
        preamble: { fetchWasmMs: 100 },
        runs: [
          {
            run: 1,
            flow: 'flow',
            configuredThreads: 8,
            phases: { chonk_setup: setup, chonk_prove: prove, destroy: 10 },
            setupMs: setup,
            proveMs: prove,
            wallMs: wall,
          },
        ],
      },
    },
  };
}

const dir = await mkdtemp(resolve(tmpdir(), 'wasm-bench-jsonl-diff-'));
try {
  const base = resolve(dir, 'base.jsonl');
  const head = resolve(dir, 'head.jsonl');
  await writeFile(base, `${JSON.stringify(row({ setup: 1000, prove: 2000, wall: 4000 }))}\n`);
  await writeFile(head, `${JSON.stringify(row({ setup: 900, prove: 2100, wall: 3900 }))}\n`);

  const child = spawnSync(process.execPath, [resolve(__dirname, 'jsonl-diff.mjs'), '--base', base, '--head', head], {
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);

  const out = child.stdout;
  assert.match(out, /\| proveTotalMs \| 3000 ms \| 3000 ms \| 0 ms \| 0\.0% \|/);
  assert.match(out, /\| chonk_setup \| 1000 ms \| 900 ms \| -100 ms \| -10\.0% \|/);
  assert.match(out, /\| chonk_prove \| 2000 ms \| 2100 ms \| \+100 ms \| \+5\.0% \|/);
} finally {
  await rm(dir, { recursive: true, force: true });
}
