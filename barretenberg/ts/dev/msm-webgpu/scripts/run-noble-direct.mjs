#!/usr/bin/env node
// Drive the dev page's autorun=msm-noble-direct via local SwiftShader.

import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://127.0.0.1:5198/dev/msm-webgpu/index.html?autorun=msm-noble-direct&logn=16&scalar_seed=42';
const timeoutMs = parseInt(process.argv[3] ?? '900000', 10);

const CHROMIUM_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,WebGPU',
  '--use-vulkan=swiftshader',
  '--use-webgpu-adapter=swiftshader',
  '--ignore-gpu-blocklist',
  '--no-sandbox',
  '--ignore-certificate-errors',
];

const browser = await chromium.launch({
  headless: true,
  args: CHROMIUM_ARGS,
  executablePath:
    '/home/aztec-dev/.cache/playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',
});

try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('console', m => {
    const t = m.text();
    if (!t.startsWith('[vite]')) process.stderr.write(`[c:${m.type()}] ${t}\n`);
  });
  page.on('pageerror', e => process.stderr.write(`[pageerror] ${e.message}\n`));

  process.stderr.write(`navigating to ${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await page.waitForFunction(
    () => {
      const ds = document.querySelectorAll('[id^="log"]');
      // ready when results posted (via window.__noble_result if set) or when the autorun signals completion
      return window.__noble_result !== undefined;
    },
    undefined,
    { timeout: timeoutMs, polling: 500 },
  );
  const r = await page.evaluate(() => window.__noble_result);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  process.exit(r.match ? 0 : 1);
} finally {
  try { await browser.close(); } catch {}
}
