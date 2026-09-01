import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createLinkPlan,
  decodeBenchParam,
  encodeBenchParam,
  formatHeadline,
  htmlPreviewUrlForRawUrl,
  getTarget,
  loadConfig,
  renderPreviewHtml,
  resolveTargetNames,
  safeResolve,
} from './lib.mjs';
import { createBenchServer } from './serve-bench.mjs';
import { analyzeAB, bootstrapMedianCI, wilcoxonSignedRank } from './analyze-ab.mjs';

test('base64url bench parameters round-trip JSON', () => {
  const value = {
    flow: 'ecdsar1+transfer_1_recursions+sponsored_fpc',
    runs: 1,
    threads: 'auto',
    smoke: true,
  };
  assert.deepEqual(decodeBenchParam(encodeBenchParam(value)), value);
});

test('config exposes target presets and matrices', () => {
  const config = loadConfig();
  assert.equal(getTarget(config, 'iphone-15-pro').benchOverrides.memMaxPages, 16384);
  assert.deepEqual(resolveTargetNames(config, { matrix: 'customer-balanced' }), [
    'macos',
    'iphone-15-pro',
    'galaxy-s25-ultra',
    'pixel-9-pro-xl',
  ]);
});

test('safeResolve rejects path traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wasm-bench-root-'));
  assert.equal(safeResolve(root, '/index.html'), join(root, 'index.html'));
  assert.throws(() => safeResolve(root, '/../secret'), /escapes root/);
});

test('headline uses proveTotalMs as primary metric', () => {
  assert.match(
    formatHeadline('macos', {
      runs: [{ run: 1, setupMs: 10.4, proveMs: 20.4 }],
    }),
    /proveTotalMs=31/,
  );
});

test('link plan creates one-off bench URLs and worker JSON', () => {
  const config = loadConfig();
  const plan = createLinkPlan(config, {
    url: 'https://example.com',
    target: 'iphone-15-pro',
    runs: 2,
    threads: 4,
    smoke: true,
    generatedAt: '2026-05-20T00:00:00.000Z',
    gistRawUrl: 'https://gist.githubusercontent.com/example/raw/bench-links.html',
  });
  const [target] = plan.targets;
  const url = new URL(target.benchUrl);
  assert.equal(url.pathname, '/index.html');
  assert.equal(target.browserstackWorker.url, target.benchUrl);
  assert.equal(target.browserstackWorker.device, 'iPhone 15 Pro');
  assert.equal(plan.html.previewUrl, 'https://htmlpreview.github.io/?https://gist.githubusercontent.com/example/raw/bench-links.html');
  assert.deepEqual(decodeBenchParam(url.searchParams.get('bench')), {
    benchmark: 'chonk-prove',
    flow: config.defaultFlow,
    runs: 2,
    threads: 4,
    smoke: true,
    memMaxPages: 16384,
  });
});

test('preview HTML embeds links and bot-readable JSON safely', () => {
  const config = loadConfig();
  const plan = createLinkPlan(config, {
    url: 'https://bench.invalid',
    target: 'macos',
    flow: '<script>alert(1)</script>',
    generatedAt: '2026-05-20T00:00:00.000Z',
  });
  const html = renderPreviewHtml(plan);
  assert.match(html, /Open bench link/);
  assert.match(html, /wasm-bench-link-plan/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('html preview URL supports query-style services', () => {
  assert.equal(
    htmlPreviewUrlForRawUrl('https://gist.githubusercontent.com/example/raw/bench-links.html', 'https://html-preview.github.io/?url='),
    'https://html-preview.github.io/?url=https%3A%2F%2Fgist.githubusercontent.com%2Fexample%2Fraw%2Fbench-links.html',
  );
});

test('bootstrap median CI on constant data is degenerate at the constant', () => {
  const ci = bootstrapMedianCI([5, 5, 5, 5, 5, 5, 5, 5], { iters: 500, seed: 1 });
  assert.equal(ci.point, 5);
  assert.equal(ci.lo, 5);
  assert.equal(ci.hi, 5);
});

test('bootstrap median CI brackets the true median for symmetric noise', () => {
  // Symmetric around 0 → median CI should bracket 0 at 95%.
  const samples = [-3, -2, -1, 0, 0, 1, 2, 3];
  const ci = bootstrapMedianCI(samples, { iters: 2000, seed: 42 });
  assert.ok(ci.lo <= 0 && ci.hi >= 0, `CI [${ci.lo}, ${ci.hi}] should bracket 0`);
});

test('wilcoxon signed-rank returns NaN p-value when all deltas are zero', () => {
  const { p } = wilcoxonSignedRank([0, 0, 0, 0, 0]);
  assert.ok(Number.isNaN(p));
});

test('wilcoxon signed-rank gives small p for clearly nonzero deltas', () => {
  const { p } = wilcoxonSignedRank([10, 11, 9, 12, 13, 14, 15, 16, 17, 18]);
  assert.ok(p < 0.01, `expected p<0.01, got ${p}`);
});

test('analyzeAB on identical A and B reports zero deltas and contains-zero CI', () => {
  const fakeRun = ms => ({ run: { proveTotalMs: ms, setupMs: ms * 0.6, proveMs: ms * 0.4, verified: true, proofFieldCount: 2630, verificationKeyBytes: 4576 } });
  const pairs = [];
  for (let p = 0; p < 11; p++) {
    const ms = 10000 + Math.sin(p) * 100;
    pairs.push({ pair: p, variant: 'a', position: p % 2 === 0 ? 0 : 1, warmup: p === 0, ...fakeRun(ms) });
    pairs.push({ pair: p, variant: 'b', position: p % 2 === 0 ? 1 : 0, warmup: p === 0, ...fakeRun(ms) });
  }
  const result = { benchmark: 'chonk-ab', flow: 'x', variants: ['a', 'b'], pairs, warmupPairs: 1 };
  const analysis = analyzeAB(result, { bootstrapIters: 1000 });
  assert.equal(analysis.analyzedPairs, 10);
  const m = analysis.perMetric.proveTotalMs;
  assert.equal(m.deltaMs.median, 0);
  assert.ok(m.deltaPct.ci95.lo <= 0 && m.deltaPct.ci95.hi >= 0, `Δ% CI [${m.deltaPct.ci95.lo}, ${m.deltaPct.ci95.hi}] should contain 0`);
  assert.equal(m.significant, false);
});

test('analyzeAB rejects results without exactly two variants', () => {
  assert.throws(() => analyzeAB({ variants: ['a'], pairs: [] }), /2-element array/);
});

test('server exposes health and pinned input index', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wasm-bench-static-'));
  const inputs = await mkdtemp(join(tmpdir(), 'wasm-bench-inputs-'));
  await writeFile(join(root, 'index.html'), '<!doctype html>');
  await mkdir(join(inputs, 'flow-a'));
  await writeFile(join(inputs, 'flow-a', 'ivc-inputs.msgpack'), Buffer.from([1, 2, 3]));

  const server = createBenchServer({ root, inputsDir: inputs, progressJsonl: '', resultJsonl: '' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`).then(response => response.json());
    assert.equal(health.ok, true);
    const index = await fetch(`http://127.0.0.1:${port}/inputs/index.json`).then(response => response.json());
    assert.deepEqual(index.flows, ['flow-a']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
