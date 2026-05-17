#!/usr/bin/env node
// Drive bench-smvp-tree.html locally via Playwright (SwiftShader-backed
// WebGPU). Useful for fast iteration without spinning up BrowserStack.
//
// Usage: node dev/msm-webgpu/scripts/run-bench-smvp-tree.mjs \
//        --entries 65536 --buckets 512 --skew heavy

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const DEFAULT_URL_BASE = 'http://127.0.0.1:5198/dev/msm-webgpu/bench-smvp-tree.html';

const { values: argv } = parseArgs({
  options: {
    entries: { type: 'string', default: '60' },
    buckets: { type: 'string', default: '6' },
    seed: { type: 'string', default: '12345' },
    skew: { type: 'string', default: 'uniform' },
    url: { type: 'string', default: DEFAULT_URL_BASE },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '120' },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (argv.help) {
  process.stdout.write(`bench-smvp-tree driver\n`);
  process.exit(0);
}

const timeoutMs = parseFloat(String(argv.timeout)) * 1000;
const baseUrl = String(argv.url);
const headed = Boolean(argv.headed);

const CHROMIUM_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,WebGPU',
  '--use-vulkan=swiftshader',
  '--use-webgpu-adapter=swiftshader',
  '--enable-features=WebGPU',
  '--ignore-gpu-blocklist',
  '--no-sandbox',
];

function buildUrl() {
  const u = new URL(baseUrl);
  u.searchParams.set('entries', String(argv.entries));
  u.searchParams.set('buckets', String(argv.buckets));
  u.searchParams.set('seed', String(argv.seed));
  u.searchParams.set('skew', String(argv.skew));
  return u.toString();
}

(async () => {
  const browser = await chromium.launch({
    headless: !headed,
    args: CHROMIUM_ARGS,
    executablePath: '/home/aztec-dev/.cache/playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const page = await ctx.newPage();
    page.on('console', m => {
      const t = m.text();
      if (!t.startsWith('[vite]')) process.stderr.write(`[console:${m.type()}] ${t}\n`);
    });
    page.on('pageerror', e => process.stderr.write(`[pageerror] ${e.message}\n`));

    const url = buildUrl();
    process.stderr.write(`navigating to ${url}\n`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.waitForFunction(
      () => window.__bench?.state === 'done' || window.__bench?.state === 'error',
      { timeout: timeoutMs, polling: 250 },
    );

    const result = await page.evaluate(() => {
      const b = window.__bench;
      return { state: b.state, params: b.params, results: b.results, error: b.error, log: b.log };
    });

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.state === 'done' ? 0 : 1);
  } finally {
    try { await browser.close(); } catch {}
  }
})();
