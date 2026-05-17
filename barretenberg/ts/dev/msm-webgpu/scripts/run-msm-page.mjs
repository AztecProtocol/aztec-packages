#!/usr/bin/env node
// Drive the MSM dev page locally: set logN, optionally toggle
// use_tree_reduce, click Run, scrape the log for the cross-check line.
//
// Used to validate that the production integration produces the right
// answer with the tree-reduce path, since the unit-bench
// (bench-smvp-tree) only exercises the orchestrator on synthetic data.

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const DEFAULT_URL_BASE = 'http://127.0.0.1:5198/dev/msm-webgpu/index.html';

const { values: argv } = parseArgs({
  options: {
    logn: { type: 'string', default: '14' },
    tree: { type: 'boolean', default: false },
    url: { type: 'string', default: DEFAULT_URL_BASE },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '300' },
    help: { type: 'boolean', default: false },
  },
});

if (argv.help) {
  process.stdout.write('msm dev page driver\n');
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
  '--ignore-gpu-blocklist',
  '--no-sandbox',
  '--ignore-certificate-errors',
];

function buildUrl() {
  const u = new URL(baseUrl);
  if (argv.tree) u.searchParams.set('use_tree_reduce', '1');
  return u.toString();
}

(async () => {
  const browser = await chromium.launch({
    headless: !headed,
    args: CHROMIUM_ARGS,
    executablePath:
      '/home/aztec-dev/.cache/playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 900, height: 700 },
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    page.on('console', m => {
      const t = m.text();
      if (!t.startsWith('[vite]')) process.stderr.write(`[c:${m.type()}] ${t}\n`);
    });
    page.on('pageerror', e => process.stderr.write(`[pageerror] ${e.message}\n`));

    const url = buildUrl();
    process.stderr.write(`navigating to ${url} (tree=${argv.tree}, logN=${argv.logn})\n`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Wait for the page to enable the Run button (SRS warm + WebGPU ready)
    await page.waitForFunction(
      () => {
        const btn = document.getElementById('run');
        const logn = document.getElementById('logn');
        return btn && logn && !btn.disabled;
      },
      undefined,
      { timeout: 600_000, polling: 500 },
    );

    // Set logN
    await page.evaluate(n => {
      const el = document.getElementById('logn');
      el.value = String(n);
      el.dispatchEvent(new Event('input'));
    }, parseInt(String(argv.logn), 10));

    // Click Run
    await page.click('#run');

    // Wait for completion — re-enable of run button
    await page.waitForFunction(
      () => {
        const btn = document.getElementById('run');
        return btn && !btn.disabled;
      },
      undefined,
      { timeout: timeoutMs, polling: 500 },
    );

    // Scrape log entries for results
    const logText = await page.evaluate(() => {
      const log = document.getElementById('log');
      if (!log) return '';
      return log.innerText || log.textContent || '';
    });

    process.stdout.write(logText + '\n');

    const ok = /cross-check.*all agree/i.test(logText);
    const fail = /\[err\]/i.test(logText);
    process.stderr.write(`\nresult: ok=${ok} fail=${fail}\n`);
    process.exit(ok && !fail ? 0 : 1);
  } finally {
    try { await browser.close(); } catch {}
  }
})();
