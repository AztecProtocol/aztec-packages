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

const dir = await mkdtemp(resolve(tmpdir(), 'wasm-bench-jsonl-'));
try {
  const inFile = resolve(dir, 'results.jsonl');
  const outFile = resolve(dir, 'bench.json');
  await writeFile(
    inFile,
    `${JSON.stringify({
      payload: {
        ok: true,
        data: {
          smoke: true,
          runs: [
            {
              proveMs: 20,
              setupMs: 10,
              wallMs: 45,
              phases: {
                chonk_setup: 11,
                chonk_prove: 21,
              },
            },
          ],
        },
      },
    })}\n`,
  );

  const child = spawnSync(process.execPath, [resolve(__dirname, 'jsonl-to-bench.mjs'), '--in', inFile, '--out', outFile, '--label', 'test/target'], {
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);

  const rows = JSON.parse(await readFile(outFile, 'utf8'));
  assert.deepEqual(
    rows.map((r) => [r.name, r.value, r.unit]),
    [
      ['test/target/proveTotalMs', 32, 'ms'],
      ['test/target/proveMs', 20, 'ms'],
      ['test/target/setupMs', 10, 'ms'],
      ['test/target/wallMs', 45, 'ms'],
    ],
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
