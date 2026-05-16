#!/usr/bin/env node
// Headless WebGPU benchmark driver for the MSM dev page.
//
//   Drives `dev/msm-webgpu/index.html` via Playwright + Chromium so the
//   dev-page Run / Run × 5 / Sweep / Sanity buttons can be iterated on
//   from the shell without manual clicks. The script:
//
//     1. Spawns Chromium with the flags Dawn needs for WebGPU on macOS
//        (`--enable-unsafe-webgpu` + Metal backend selection).
//     2. Navigates to a configurable Vite dev-server URL (default
//        `http://localhost:5173/dev/msm-webgpu/index.html?coi=1`).
//        Bails with a clear message if the dev server isn't running.
//     3. Sets the page's `#logn`, `#mt-threads`, and `#use-f32` controls
//        from CLI args. (`--f32` flips the f32-Mont WebGPU path on; the
//        URL `?f32=1` query is also honoured.)
//     4. Waits for SRS load via `window.__harness.state === 'srs-ready'`.
//     5. Clicks the appropriate Run button for the chosen mode.
//     6. Polls `window.__harness.state` until `'done'` or `'error'`.
//     7. Dumps a Markdown timing summary + a JSON section to stdout.
//        Exits non-zero if any correctness check failed.
//
// Hook contract: requires the `__harness` hook in dev/msm-webgpu/main.ts.
// Search for `HARNESS HOOK` in that file — those write points are the
// only coupling between page and script. The page itself never reads from
// `window.__harness`, so the hook is a no-op for interactive users.
//
// macOS Apple Silicon note: as of Chromium 138 the bundled Chromium that
// Playwright ships with supports WebGPU headlessly via the Metal backend;
// no Vulkan needed. If the page reports `navigator.gpu missing` the
// harness falls back to headed mode automatically with a clear log line.

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const DEFAULT_URL = 'http://localhost:5173/dev/msm-webgpu/index.html?coi=1';

const { values: argv } = parseArgs({
  options: {
    mode: { type: 'string', default: 'bench' },
    logn: { type: 'string', default: '16' },
    'mt-threads': { type: 'string' },
    f32: { type: 'string', default: '0' },
    url: { type: 'string', default: DEFAULT_URL },
    headed: { type: 'boolean', default: false },
    'srs-timeout': { type: 'string', default: '600' },
    'run-timeout': { type: 'string', default: '1800' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (argv.help) {
  process.stdout.write(
    `Headless MSM WebGPU benchmark harness\n` +
      `\n` +
      `Usage:\n` +
      `  node dev/msm-webgpu/scripts/bench-headless.mjs [options]\n` +
      `\n` +
      `Options:\n` +
      `  --mode sanity|run|bench|sweep   What to run on the page (default: bench).\n` +
      `                                  sanity: 1 WebGPU MSM, no WASM (smallest config).\n` +
      `                                  run:    1 rep × {gpu, wasm-st, wasm-mt} at --logn.\n` +
      `                                  bench:  5 reps × {gpu, wasm-st, wasm-mt} at --logn.\n` +
      `                                  sweep:  5 reps at logN ∈ {16,17,18,19,20}.\n` +
      `  --logn N                        Single-size logN for sanity/run/bench (default 16).\n` +
      `  --mt-threads N                  WASM MT thread count (default: page default).\n` +
      `  --f32 0|1                       Use the f32-Mont WebGPU path (default 0).\n` +
      `  --url URL                       Page URL (default ${DEFAULT_URL}).\n` +
      `  --headed                        Run with a visible browser window. Auto-fallback\n` +
      `                                  also triggers if headless WebGPU init fails.\n` +
      `  --srs-timeout SECS              Max wait for SRS load (default 600).\n` +
      `  --run-timeout SECS              Max wait for benchmark completion (default 1800).\n` +
      `  --json                          Emit only the JSON results blob (no Markdown).\n` +
      `  --help                          Show this help and exit.\n`,
  );
  process.exit(0);
}

const MODE_TO_BUTTON = {
  sanity: '#run-sanity',
  run: '#run',
  bench: '#run-bench',
  sweep: '#run-sweep',
  unit: '#run-unit-tests',
};

const mode = String(argv.mode);
if (!(mode in MODE_TO_BUTTON)) {
  process.stderr.write(`error: --mode must be one of ${Object.keys(MODE_TO_BUTTON).join(', ')}; got "${mode}"\n`);
  process.exit(2);
}

const logn = parseInt(String(argv.logn), 10);
if (!Number.isFinite(logn) || logn < 16 || logn > 20) {
  process.stderr.write(`error: --logn must be in [16, 20]; got ${argv.logn}\n`);
  process.exit(2);
}
const mtThreads = argv['mt-threads'] !== undefined ? parseInt(String(argv['mt-threads']), 10) : null;
if (mtThreads !== null && (!Number.isFinite(mtThreads) || mtThreads < 1 || mtThreads > 32)) {
  process.stderr.write(`error: --mt-threads must be in [1, 32]; got ${argv['mt-threads']}\n`);
  process.exit(2);
}
const f32 = String(argv.f32) === '1' || String(argv.f32).toLowerCase() === 'true';
if (f32) {
  process.stderr.write(
    `error: f32 MSM path is BLOCKED in this harness. The full f32 MSM pipeline is\n` +
    `not yet proven correct on real hardware — running it has caused GPU lockups.\n` +
    `Validate the f32 field-mul micro-benchmark first (see dev/msm-webgpu/scripts/\n` +
    `bench-field-mul.mjs and the field_mul_bench tests).\n`,
  );
  process.exit(3);
}
const url = String(argv.url);
const headedRequested = Boolean(argv.headed);
const srsTimeoutMs = parseFloat(String(argv['srs-timeout'])) * 1000;
const runTimeoutMs = parseFloat(String(argv['run-timeout'])) * 1000;
const jsonOnly = Boolean(argv.json);

function err(msg) {
  process.stderr.write(`[bench-headless] ${msg}\n`);
}
function out(msg) {
  if (!jsonOnly) process.stdout.write(`${msg}\n`);
}

async function reachable(targetUrl) {
  try {
    const res = await fetch(targetUrl, { method: 'HEAD' });
    return res.ok || res.status === 405; // 405 = HEAD not allowed but server is up
  } catch {
    return false;
  }
}

// Chromium flags. `--enable-unsafe-webgpu` plus the feature flag are
// belt-and-braces — the former is the documented opt-in on macOS, the
// latter unconditionally turns the feature on regardless of finch state.
// `--use-angle=metal` keeps Dawn on the Metal backend (default on Apple
// Silicon but pinned here for repeatability). `--no-sandbox` is required
// for Chromium-for-Testing on macOS when launched outside an app bundle
// — Playwright sets this for us when `chromium.launch` is used, but
// noting it here in case someone copies the args into a manual run.
const CHROMIUM_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,WebGPU',
  '--use-angle=metal',
  '--disable-features=ServiceWorker',
  '--ignore-gpu-blocklist',
];

async function tryLaunch(headless) {
  return chromium.launch({
    headless,
    args: CHROMIUM_ARGS,
  });
}

async function runOnce(headless) {
  const browser = await tryLaunch(headless);
  const context = await browser.newContext({
    // The dev page calls `crossOriginIsolated`-gated APIs (the threaded
    // bb.js WASM). The COI headers come from the Vite middleware when
    // `?coi=1` is in the URL — Playwright honours them by default.
    viewport: { width: 1280, height: 800 },
    permissions: [],
    bypassCSP: false,
  });
  const page = await context.newPage();

  // Forward page console + page errors to stderr so a hang is debuggable.
  page.on('console', msg => {
    const txt = msg.text();
    // Pass through everything but the verbose Vite HMR lines.
    if (!txt.startsWith('[vite]')) {
      err(`[page:${msg.type()}] ${txt}`);
    }
  });
  page.on('pageerror', e => err(`[page:pageerror] ${e.message}`));

  const navUrl = (() => {
    const u = new URL(url);
    if (f32) u.searchParams.set('f32', '1');
    return u.toString();
  })();
  err(`navigating to ${navUrl} (headless=${headless})`);
  await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Sanity: WebGPU available?
  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
  if (!hasWebGpu) {
    await browser.close();
    throw new Error('navigator.gpu missing in this Chromium instance');
  }
  err('navigator.gpu present');

  // Bail early if the harness hook isn't wired (build-of-page mismatch).
  const hookOk = await page.evaluate(() => typeof window.__harness === 'object' && window.__harness !== null);
  if (!hookOk) {
    await browser.close();
    throw new Error(
      'window.__harness hook missing — is the dev page running the version of main.ts with the HARNESS HOOK block?',
    );
  }

  // Configure the inputs BEFORE waiting for SRS so the page-default
  // mt-threads is overridden in time for the first WASM boot. The dev
  // page reads `#logn` / `#mt-threads` only at click time, so these
  // values are picked up by the Run handler regardless of when they're
  // set, but the f32 checkbox is read by the page at module load too —
  // we set the URL query above for that path.
  await page.fill('#logn', String(logn));
  if (mtThreads !== null) {
    await page.fill('#mt-threads', String(mtThreads));
  }
  if (f32) {
    await page.evaluate(() => {
      const el = document.getElementById('use-f32');
      if (el instanceof HTMLInputElement) el.checked = true;
    });
  }

  err(`waiting for SRS load (up to ${(srsTimeoutMs / 1000).toFixed(0)}s)`);
  const t0Srs = Date.now();
  await page.waitForFunction(() => window.__harness?.state === 'srs-ready' || window.__harness?.state === 'error', {
    timeout: srsTimeoutMs,
    polling: 250,
  });
  const stateAfterSrs = await page.evaluate(() => ({
    state: window.__harness.state,
    error: window.__harness.error,
  }));
  if (stateAfterSrs.state === 'error') {
    await browser.close();
    throw new Error(`SRS load failed: ${stateAfterSrs.error}`);
  }
  err(`SRS ready in ${((Date.now() - t0Srs) / 1000).toFixed(1)}s`);

  // Click the Run button for the requested mode.
  const buttonSel = MODE_TO_BUTTON[mode];
  err(`clicking ${buttonSel}`);
  await page.waitForSelector(`${buttonSel}:not([disabled])`, { timeout: 30_000 });
  await page.click(buttonSel);

  err(`waiting for ${mode} to complete (up to ${(runTimeoutMs / 1000).toFixed(0)}s)`);
  const t0Run = Date.now();
  await page.waitForFunction(() => window.__harness?.state === 'done' || window.__harness?.state === 'error', {
    timeout: runTimeoutMs,
    polling: 500,
  });
  const elapsedRunSec = (Date.now() - t0Run) / 1000;
  err(`run state reached in ${elapsedRunSec.toFixed(1)}s`);

  const result = await page.evaluate(() => {
    const h = window.__harness;
    return {
      state: h.state,
      mode: h.mode,
      f32: h.f32,
      logN: h.logN,
      mtThreads: h.mtThreads,
      error: h.error,
      rows: JSON.parse(JSON.stringify(h.rows)),
      errors: h.errors.slice(),
      userAgent: navigator.userAgent,
    };
  });
  await browser.close();
  result.elapsedRunSec = elapsedRunSec;
  return result;
}

(async () => {
  if (!(await reachable(url))) {
    err(`dev server not reachable at ${url}`);
    err(`start it with: yarn dev:msm-webgpu  (from barretenberg/ts/)`);
    process.exit(3);
  }

  let result;
  let usedHeaded = headedRequested;
  try {
    result = await runOnce(!headedRequested);
  } catch (e) {
    err(`run failed: ${e.message}`);
    if (!headedRequested) {
      err('retrying in headed mode (window will appear)');
      try {
        result = await runOnce(false);
        usedHeaded = true;
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
    process.exit(5);
  }

  // ---- Markdown summary ----
  const median = xs => {
    if (xs.length === 0) return NaN;
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const fmt = v => (Number.isFinite(v) ? v.toFixed(1) : '—');
  const samples = xs => (xs.length ? '[' + xs.map(s => s.ms.toFixed(0)).join(', ') + ']' : '—');

  if (!jsonOnly) {
    out(`## MSM WebGPU benchmark — mode=${result.mode}, f32=${result.f32 ? 'on' : 'off'}`);
    out('');
    out(`- url:               ${url}`);
    out(`- headed:            ${usedHeaded}`);
    out(`- mt-threads:        ${result.mtThreads ?? '—'}`);
    out(`- single logN:       ${result.logN ?? '—'}`);
    out(`- run wall-time (s): ${result.elapsedRunSec.toFixed(1)}`);
    out(`- user-agent:        ${result.userAgent}`);
    out('');

    if (result.rows.length === 0) {
      out('_no rows in __harness.rows — sanity mode collects only one GPU sample (see below)._');
    }
    if (result.rows.length > 0) {
      out('| logN | n        | WebGPU median ms | WASM ST median ms | WASM MT median ms | x-check |');
      out('|-----:|---------:|-----------------:|------------------:|------------------:|:-------:|');
      for (const r of result.rows.slice().sort((a, b) => a.logN - b.logN)) {
        const gpuMed = median(r.webgpu.map(s => s.ms));
        const stMed = median(r.wasmSt.map(s => s.ms));
        const mtMed = median(r.wasmMt.map(s => s.ms));
        const xc = r.crossOk === null ? '—' : r.crossOk ? 'pass' : 'FAIL';
        out(
          `| ${r.logN}   | ${(1 << r.logN).toLocaleString().padStart(8)} | ` +
            `${fmt(gpuMed).padStart(16)} | ${fmt(stMed).padStart(17)} | ${fmt(mtMed).padStart(17)} | ${xc.padStart(7)} |`,
        );
      }
      out('');
      out('### Per-rep samples (ms)');
      for (const r of result.rows.slice().sort((a, b) => a.logN - b.logN)) {
        out(`- logN=${r.logN}: gpu=${samples(r.webgpu)} st=${samples(r.wasmSt)} mt=${samples(r.wasmMt)}`);
      }
      out('');
    }
    if (result.errors.length > 0) {
      out('### Errors observed');
      for (const e of result.errors) out(`- ${e}`);
      out('');
    }
    out('### Raw JSON');
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  const anyFailure = result.errors.length > 0 || result.rows.some(r => r.crossOk === false);
  process.exit(anyFailure ? 1 : 0);
})().catch(e => {
  err(`unexpected: ${e.stack ?? e.message ?? String(e)}`);
  process.exit(99);
});
