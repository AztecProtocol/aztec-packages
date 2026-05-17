#!/usr/bin/env node
// Batch-affine EC add amortisation bench driver.
// Mirrors bench-fr-inv.mjs structure: Playwright Chromium with WebGPU
// enabled, navigates to the standalone bench-batch-affine.html page,
// waits for `window.__bench.state === 'done' | 'error'`, dumps results
// as a table.

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const DEFAULT_URL_BASE = 'http://localhost:5197/dev/msm-webgpu/bench-batch-affine.html';

const { values: argv } = parseArgs({
  options: {
    reps: { type: 'string', default: '5' },
    total: { type: 'string' },
    sizes: { type: 'string' },
    url: { type: 'string', default: DEFAULT_URL_BASE },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '180' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (argv.help) {
  process.stdout.write(
    `batch-affine WebGPU amortisation bench driver

Usage:
  node dev/msm-webgpu/scripts/bench-batch-affine.mjs [options]

Options:
  --reps R                  (default 5)
  --url URL                 (default ${DEFAULT_URL_BASE})
  --headed                  Run with visible browser window
  --timeout SECS            Bench page completion timeout (default 180)
  --json                    Machine-readable JSON only output
  --help                    Show this help
`,
  );
  process.exit(0);
}

const reps = parseInt(String(argv.reps), 10);
if (!Number.isFinite(reps) || reps <= 0 || reps > 50) {
  process.stderr.write(`error: --reps must be in (0, 50], got ${argv.reps}\n`);
  process.exit(2);
}
const headed = Boolean(argv.headed);
const timeoutMs = parseFloat(String(argv.timeout)) * 1000;
const jsonOnly = Boolean(argv.json);
const baseUrl = String(argv.url);

function err(msg) {
  process.stderr.write(`[bench-batch-affine] ${msg}\n`);
}
function out(msg) {
  if (!jsonOnly) process.stdout.write(`${msg}\n`);
}

async function reachable(targetUrl) {
  try {
    const res = await fetch(targetUrl, { method: 'GET' });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

const CHROMIUM_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,WebGPU',
  '--use-angle=metal',
  '--disable-features=ServiceWorker',
  '--ignore-gpu-blocklist',
];

async function tryLaunch(headless) {
  return chromium.launch({ headless, args: CHROMIUM_ARGS });
}

function buildUrl() {
  const u = new URL(baseUrl);
  u.searchParams.set('reps', String(reps));
  if (argv.total !== undefined) u.searchParams.set('total', String(argv.total));
  if (argv.sizes !== undefined) u.searchParams.set('sizes', String(argv.sizes));
  return u.toString();
}

async function runOnce(headless) {
  let browser;
  try {
    browser = await tryLaunch(headless);
    const context = await browser.newContext({
      viewport: { width: 900, height: 600 },
      permissions: [],
      bypassCSP: false,
    });
    const page = await context.newPage();
    page.on('console', msg => {
      const txt = msg.text();
      if (!txt.startsWith('[vite]')) {
        err(`[page:${msg.type()}] ${txt}`);
      }
    });
    page.on('pageerror', e => err(`[page:pageerror] ${e.message}`));

    const navUrl = buildUrl();
    err(`navigating to ${navUrl} (headless=${headless})`);
    await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
    if (!hasWebGpu) {
      throw new Error('navigator.gpu missing in this Chromium instance');
    }

    err(`waiting for bench to complete (up to ${(timeoutMs / 1000).toFixed(0)}s)`);
    const t0 = Date.now();
    await page.waitForFunction(
      () => window.__bench?.state === 'done' || window.__bench?.state === 'error',
      { timeout: timeoutMs, polling: 250 },
    );
    const elapsed = (Date.now() - t0) / 1000;
    err(`bench reached terminal state in ${elapsed.toFixed(1)}s`);

    const result = await page.evaluate(() => {
      const b = window.__bench;
      return {
        state: b.state,
        params: b.params,
        results: JSON.parse(JSON.stringify(b.results)),
        error: b.error,
        log: b.log.slice(),
      };
    });
    result.elapsedSec = elapsed;
    return result;
  } finally {
    try {
      if (browser) await browser.close();
    } catch (e) {
      err(`browser.close failed: ${e.message}`);
    }
  }
}

(async () => {
  if (!(await reachable(baseUrl))) {
    err(`dev server not reachable at ${new URL(baseUrl).origin}`);
    err(
      `start it with: cd barretenberg/ts && ./node_modules/.bin/vite --config dev/msm-webgpu/vite.config.ts --port 5197 --strictPort --no-open`,
    );
    process.exit(3);
  }

  let result;
  try {
    result = await runOnce(!headed);
  } catch (e) {
    err(`run failed: ${e.message}`);
    if (!headed) {
      err('retrying in headed mode');
      try {
        result = await runOnce(false);
      } catch (e2) {
        err(`headed retry also failed: ${e2.message}`);
        process.exit(4);
      }
    } else {
      process.exit(4);
    }
  }

  if (result.state === 'error') {
    err(`page reported error: ${result.error}`);
    if (jsonOnly) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    // Don't exit non-zero — partial results may still be useful (e.g.
    // first batch_size failed). Print what we have.
  }

  if (!jsonOnly) {
    out(`## Batch-affine WebGPU amortisation bench (reps=${reps})`);
    out('');
    out(`- elapsed wall (s): ${result.elapsedSec.toFixed(2)}`);
    out(`- state: ${result.state}`);
    if (result.error) out(`- error: ${result.error}`);
    out('');
    if (result.results && result.results.length > 0) {
      const base = result.results[result.results.length - 1].ns_per_pair;
      out('batch_size | num_WGs | TPB | total_threads | median_ms | ns/pair | inv_amort_ratio');
      out('---------- | ------- | --- | ------------- | --------- | ------- | --------------');
      for (const r of result.results) {
        const ratio = (r.ns_per_pair / base).toFixed(3);
        out(
          `${String(r.batch_size).padEnd(10)} | ${String(r.num_wgs).padEnd(7)} | ${String(r.tpb).padEnd(3)} | ${String(r.total_threads).padEnd(13)} | ${r.median_ms.toFixed(3).padStart(9)} | ${r.ns_per_pair.toFixed(1).padStart(7)} | ${String(ratio).padStart(14)}`,
        );
      }
    } else {
      out('(no results)');
    }
    out('');
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  const failed = result.state === 'error';
  process.exit(failed ? 1 : 0);
})().catch(e => {
  err(`unexpected: ${e.stack ?? e.message ?? String(e)}`);
  process.exit(99);
});
