#!/usr/bin/env node
// Drive the MSM dev page's Quick Sanity Check button via Playwright,
// scrape window.__sanity.capture for per-stage GPU times, and print a
// compact roll-up. Used to bench WPB / BPR-multi-window variants
// without rebuilding the full bench/sweep UI flow.
//
// Outputs JSON like:
//   {
//     "reps": 5,
//     "ms_total":   { "samples": [...], "median": ... },
//     "per_stage":  { "bpr_1": { "samples": [...], "median": ... }, ... }
//   }

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const DEFAULT_URL = 'http://localhost:5195/dev/msm-webgpu/index.html';

const { values: argv } = parseArgs({
  options: {
    url: { type: 'string', default: DEFAULT_URL },
    reps: { type: 'string', default: '5' },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '120' },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (argv.help) {
  process.stdout.write(
    `Profile-sanity WebGPU MSM driver
Usage:
  node dev/msm-webgpu/scripts/profile-sanity.mjs [options]
Options:
  --url URL          (default ${DEFAULT_URL})
  --reps R           (default 5)
  --headed           Show browser window
  --timeout SECS     Per-sanity-click timeout (default 120)
  --help             Show this help
`,
  );
  process.exit(0);
}

const reps = parseInt(String(argv.reps), 10);
if (!Number.isFinite(reps) || reps <= 0 || reps > 20) {
  process.stderr.write(`error: --reps must be in (0,20], got ${argv.reps}\n`);
  process.exit(2);
}
const headed = Boolean(argv.headed);
const timeoutMs = parseFloat(String(argv.timeout)) * 1000;
const baseUrl = String(argv.url);

function err(msg) {
  process.stderr.write(`[profile-sanity] ${msg}\n`);
}

const CHROMIUM_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,WebGPU',
  '--use-angle=metal',
  '--disable-features=ServiceWorker',
  '--ignore-gpu-blocklist',
];

function rollupLabel(label) {
  const idx = label.indexOf('[');
  return idx >= 0 ? label.substring(0, idx) : label;
}

function aggregateCapture(capture) {
  // Per-rep stage sums: roll up `[r=...]` / `[subtask=...]` suffixes.
  // Skip region entries (they overlap and would double-count).
  const totals = new Map();
  if (!capture?.profile) return { stages: {}, gpuWall: null, profiledSum: null, untimestamped: null };
  for (const e of capture.profile) {
    if (e.kind === 'region') continue;
    const k = rollupLabel(e.label);
    totals.set(k, (totals.get(k) ?? 0) + e.ms);
  }
  return {
    stages: Object.fromEntries(totals),
    gpuWall: capture.gpu_readback?.gpu_compute_wall ?? null,
    profiledSum: capture.gpu_readback?.profiled_passes_sum ?? null,
    untimestamped: capture.gpu_readback?.untimestamped ?? null,
  };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

async function run() {
  const browser = await chromium.launch({ headless: !headed, args: CHROMIUM_ARGS });
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, bypassCSP: false });
    const page = await context.newPage();
    page.on('console', msg => {
      const t = msg.text();
      if (!t.startsWith('[vite]')) err(`[page:${msg.type()}] ${t}`);
    });
    page.on('pageerror', e => err(`[page:pageerror] ${e.message}`));

    err(`navigating to ${baseUrl} (headless=${!headed})`);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Probe adapter info so the operator can verify Metal/Apple.
    const adapter = await page.evaluate(async () => {
      if (!('gpu' in navigator)) return null;
      const a = await navigator.gpu.requestAdapter();
      if (!a) return null;
      // adapter.info is the modern API; fallback to requestAdapterInfo() for older.
      // eslint-disable-next-line no-undef
      const info = a.info ?? (await a.requestAdapterInfo?.());
      return info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null;
    });
    err(`adapter: ${JSON.stringify(adapter)}`);

    // Wait for sanity button to be enabled (SRS loaded).
    await page.waitForFunction(
      () => {
        const b = document.getElementById('run-sanity');
        return b && !b.disabled;
      },
      { timeout: 60_000, polling: 200 },
    );
    err('sanity button enabled (SRS loaded)');

    const samples = []; // per-rep aggregates
    for (let r = 0; r < reps; r++) {
      err(`rep ${r + 1}/${reps}: clicking Quick sanity check`);
      // Reset state and click.
      await page.evaluate(() => {
        window.__sanity = { state: 'running' };
      });
      await page.click('#run-sanity');
      await page.waitForFunction(
        () => window.__sanity?.state === 'done' || window.__sanity?.state === 'error',
        { timeout: timeoutMs, polling: 250 },
      );
      const out = await page.evaluate(() => JSON.parse(JSON.stringify(window.__sanity)));
      if (out.state === 'error') {
        err(`rep ${r + 1} ERROR: ${out.error}`);
        process.exit(5);
      }
      const agg = aggregateCapture(out.capture);
      agg.ms = out.ms;
      samples.push(agg);
      const bpr1 = agg.stages?.bpr_1;
      err(`rep ${r + 1} ok: ms=${out.ms?.toFixed(1)} bpr_1=${bpr1?.toFixed?.(2) ?? '?'} gpuWall=${agg.gpuWall?.toFixed?.(2) ?? '?'}`);
    }

    // Aggregate per-stage medians + ms_total median.
    const stageNames = new Set();
    for (const s of samples) for (const k of Object.keys(s.stages)) stageNames.add(k);
    const per_stage = {};
    for (const k of stageNames) {
      const xs = samples.map(s => s.stages[k]).filter(v => Number.isFinite(v));
      per_stage[k] = { samples: xs, median: median(xs) };
    }
    const ms_total = samples.map(s => s.ms);
    const gpu_wall = samples.map(s => s.gpuWall).filter(v => Number.isFinite(v));
    const profiled_sum = samples.map(s => s.profiledSum).filter(v => Number.isFinite(v));
    const result = {
      reps,
      adapter,
      ms_total: { samples: ms_total, median: median(ms_total) },
      gpu_wall: { samples: gpu_wall, median: median(gpu_wall) },
      profiled_sum: { samples: profiled_sum, median: median(profiled_sum) },
      per_stage,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally {
    try {
      await browser.close();
    } catch (e) {
      err(`browser.close failed: ${e.message}`);
    }
  }
}

run().catch(e => {
  err(`fatal: ${e.stack ?? e.message ?? String(e)}`);
  process.exit(99);
});
