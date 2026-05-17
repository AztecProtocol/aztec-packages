#!/usr/bin/env node
// BY apply_matrix WebGPU dispatch test driver. Launches Playwright Chromium
// with WebGPU enabled, navigates to the standalone bench-apply-matrix.html
// page, waits for `window.__bench.state === 'done' | 'error'`, prints
// results. Mirrors the bench-divsteps.mjs structure.

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const DEFAULT_URL_BASE = 'http://localhost:5173/dev/msm-webgpu/bench-apply-matrix.html';
const N_MAX = 1 << 20;

const { values: argv } = parseArgs({
  options: {
    n: { type: 'string', default: '1024' },
    'validate-n': { type: 'string' },
    reps: { type: 'string', default: '1' },
    url: { type: 'string', default: DEFAULT_URL_BASE },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '60' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (argv.help) {
  process.stdout.write(
    `BY apply_matrix WebGPU dispatch test driver

Usage:
  node dev/msm-webgpu/scripts/bench-apply-matrix.mjs [options]

Options:
  --n N                     (default 1024, max ${N_MAX})
  --validate-n N            (default min(64, n))
  --reps R                  (default 1)
  --url URL                 (default ${DEFAULT_URL_BASE})
  --headed                  Run with visible browser window
  --timeout SECS            Bench page completion timeout (default 60)
  --json                    Machine-readable JSON only output
  --help                    Show this help
`,
  );
  process.exit(0);
}

const n = parseInt(String(argv.n), 10);
if (!Number.isFinite(n) || n <= 0 || n > N_MAX) {
  process.stderr.write(`error: --n must be in (0, ${N_MAX}], got ${argv.n}\n`);
  process.exit(2);
}
const validateN =
  argv['validate-n'] !== undefined ? parseInt(String(argv['validate-n']), 10) : Math.min(64, n);
if (!Number.isFinite(validateN) || validateN < 0 || validateN > n) {
  process.stderr.write(`error: --validate-n must be in [0, n], got ${argv['validate-n']}\n`);
  process.exit(2);
}
const reps = parseInt(String(argv.reps), 10);
if (!Number.isFinite(reps) || reps <= 0 || reps > 100) {
  process.stderr.write(`error: --reps must be in (0, 100], got ${argv.reps}\n`);
  process.exit(2);
}
const headed = Boolean(argv.headed);
const timeoutMs = parseFloat(String(argv.timeout)) * 1000;
const jsonOnly = Boolean(argv.json);
const baseUrl = String(argv.url);

function err(msg) {
  process.stderr.write(`[bench-apply-matrix] ${msg}\n`);
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
  u.searchParams.set('n', String(n));
  u.searchParams.set('validate-n', String(validateN));
  u.searchParams.set('reps', String(reps));
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
        result: JSON.parse(JSON.stringify(b.result)),
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
    err(`start it with: cd barretenberg/ts && ./node_modules/.bin/vite --config dev/msm-webgpu/vite.config.ts --no-open`);
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
    process.exit(5);
  }

  if (!jsonOnly) {
    out(`## BY apply_matrix WebGPU dispatch test`);
    out('');
    out(`- params: ${JSON.stringify(result.params)}`);
    out(`- elapsed wall (s): ${result.elapsedSec.toFixed(2)}`);
    out('');
    const r = result.result;
    if (r && r.timing) {
      const t = r.timing;
      out(`- validate ok: ${r.validateOk ? 'OK' : 'FAIL'}`);
      out(`- timing reps=${t.reps} median=${t.msMedian.toFixed(3)}ms min=${t.msMin.toFixed(3)}ms max=${t.msMax.toFixed(3)}ms apply_matrix_calls/s=${t.applyMatrixPerSec.toExponential(3)}`);
    } else if (r) {
      out(`- validate ok: ${r.validateOk ? 'OK' : 'FAIL'} (no timing — validation failed)`);
      for (const m of r.mismatches) {
        out(`    ${m.replace(/\n/g, '\n    ')}`);
      }
    }
    out('');
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  const failed = !result.result || !result.result.validateOk;
  process.exit(failed ? 1 : 0);
})().catch(e => {
  err(`unexpected: ${e.stack ?? e.message ?? String(e)}`);
  process.exit(99);
});
