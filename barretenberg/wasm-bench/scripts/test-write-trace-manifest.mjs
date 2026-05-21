#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = await mkdtemp(resolve(tmpdir(), 'wasm-bench-trace-manifest-'));
const benchOut = resolve(dir, 'bench-out');
const targetDir = resolve(benchOut, 'macos');
const stalledDir = resolve(benchOut, 'pixel-9-pro-xl');
const failedDir = resolve(benchOut, 'windows-chrome');
await mkdir(resolve(targetDir, 'traces'), { recursive: true });
await mkdir(stalledDir, { recursive: true });
await mkdir(failedDir, { recursive: true });

await writeFile(
  resolve(targetDir, 'results.jsonl'),
  `${JSON.stringify({
    completedAt: '2026-05-17T00:00:00.000Z',
    payload: {
      data: {
        benchmark: 'chonk-ivc',
        flow: 'flow_a',
        runs: [
          {
            run: 1,
            configuredThreads: 8,
            setupMs: 12,
            proveMs: 34,
            wallMs: 56,
          },
        ],
      },
    },
  })}\n`,
);
await writeFile(resolve(targetDir, 'progress.jsonl'), `${JSON.stringify({ kind: 'progress', phase: 'result_posted', elapsedMs: 78 })}\n`);
await writeFile(resolve(targetDir, 'traces/trace-flow_a-1.perfetto.json'), '{"traceEvents":[]}\n');
await writeFile(resolve(targetDir, 'runner.log'), 'BrowserStack Automate session create failed: transient timeout - retrying\nteardown reason=ok exit=0\n');
await writeFile(resolve(stalledDir, 'progress.jsonl'), `${JSON.stringify({ kind: 'progress', phase: 'chonk_prove_start', elapsedMs: 1000 })}\n`);
await writeFile(resolve(failedDir, 'runner.log'), 'Error: BrowserStack Automate session response missing sessionId: "The operation was aborted due to timeout"\n');

const script = new URL('./write-trace-manifest.mjs', import.meta.url).pathname;
const result = spawnSync(
  process.execPath,
  [
    script,
    '--bench-out',
    benchOut,
    '--artifact-name',
    'wasm-bench-artifacts-test.tar.gz',
    '--run-id',
    'abc123',
    '--source-commit',
    'abc123def456',
    '--dashboard-url',
    'http://ci.aztec-labs.com/wasm-bench?run=abc123',
  ],
  { encoding: 'utf8' },
);
assert.equal(result.status, 0, result.stderr);

const manifest = JSON.parse(await readFile(resolve(benchOut, 'trace-manifest.json'), 'utf8'));
assert.equal(manifest.schema, 'aztec.wasm-bench.trace-manifest.v1');
assert.equal(manifest.artifactName, 'wasm-bench-artifacts-test.tar.gz');
assert.equal(manifest.runId, 'abc123');
assert.equal(manifest.sourceCommit, 'abc123def456');
assert.equal(manifest.dashboardUrl, 'http://ci.aztec-labs.com/wasm-bench?run=abc123');
assert.equal(manifest.traceCount, 1);
assert.equal(manifest.entryCount, 3);
assert.equal(manifest.targetCount, 3);
assert.deepEqual(manifest.traces.find((trace) => trace.target === 'macos'), {
  target: 'macos',
  benchmark: 'chonk-ivc',
  flow: 'flow_a',
  run: 1,
  configuredThreads: 8,
  setupMs: 12,
  proveMs: 34,
  proveTotalMs: 46,
  wallMs: 56,
  traceBytes: 19,
  tracePath: 'macos/traces/trace-flow_a-1.perfetto.json',
  resultsPath: 'macos/results.jsonl',
  progressPath: 'macos/progress.jsonl',
  completedAt: '2026-05-17T00:00:00.000Z',
  posted: true,
  lastProgressPhase: 'result_posted',
  lastProgressAtMs: 78,
  runnerError: null,
});
assert.deepEqual(manifest.traces.find((trace) => trace.target === 'pixel-9-pro-xl'), {
  target: 'pixel-9-pro-xl',
  benchmark: null,
  flow: null,
  run: null,
  configuredThreads: null,
  setupMs: null,
  proveMs: null,
  proveTotalMs: null,
  wallMs: null,
  traceBytes: null,
  tracePath: null,
  resultsPath: 'pixel-9-pro-xl/results.jsonl',
  progressPath: 'pixel-9-pro-xl/progress.jsonl',
  completedAt: null,
  posted: false,
  lastProgressPhase: 'chonk_prove_start',
  lastProgressAtMs: 1000,
  runnerError: null,
});
assert.deepEqual(manifest.traces.find((trace) => trace.target === 'windows-chrome'), {
  target: 'windows-chrome',
  benchmark: null,
  flow: null,
  run: null,
  configuredThreads: null,
  setupMs: null,
  proveMs: null,
  proveTotalMs: null,
  wallMs: null,
  traceBytes: null,
  tracePath: null,
  resultsPath: 'windows-chrome/results.jsonl',
  progressPath: 'windows-chrome/progress.jsonl',
  completedAt: null,
  posted: false,
  lastProgressPhase: 'session_create_failed',
  lastProgressAtMs: null,
  runnerError: 'session_create_failed',
});

const md = await readFile(resolve(benchOut, 'trace-manifest.md'), 'utf8');
assert.match(md, /wasm-bench-artifacts-test\.tar\.gz/);
assert.match(md, /http:\/\/ci\.aztec-labs\.com\/wasm-bench\?run=abc123/);
assert.match(md, /trace-flow_a-1\.perfetto\.json/);
assert.match(md, /pixel-9-pro-xl/);
assert.match(md, /no \(chonk_prove_start\)/);
assert.match(md, /windows-chrome/);
assert.match(md, /no \(session_create_failed\)/);

console.log('write-trace-manifest ok');
