#!/usr/bin/env node
// Drive msm-correctness.html under a headless SwiftShader (software) WebGPU
// browser — for GPU-less hosts. Starts the Vite dev server, launches the
// Playwright-managed Chromium with SwiftShader Vulkan forced on, runs the
// MsmV2-vs-noble cross-check at small logn, prints the result.
//
// Usage:
//   node dev/msm-webgpu/msm-correctness-driver.mjs [--port 5191] [--logns 8,10]

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(__dirname, '../../..');

const { values: argv } = parseArgs({
  options: {
    port: { type: 'string', default: '5191' },
    logns: { type: 'string', default: '8,10' },
    timeout: { type: 'string', default: '300000' },
    headed: { type: 'boolean', default: false },
  },
});

const port = parseInt(argv.port, 10);
const timeoutMs = parseInt(argv.timeout, 10);
const url = `http://127.0.0.1:${port}/dev/msm-webgpu/msm-correctness.html?logns=${encodeURIComponent(argv.logns)}`;

function startVite() {
  const viteBin = path.join(TS_ROOT, 'node_modules/.bin/vite');
  if (!existsSync(viteBin)) throw new Error(`vite not found at ${viteBin}`);
  const args = ['--config', 'dev/msm-webgpu/vite.config.ts', '--port', String(port),
    '--strictPort', '--no-open', '--host', '127.0.0.1'];
  const proc = spawn(viteBin, args, { cwd: TS_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => process.stderr.write(`[vite] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[vite!] ${d}`));
  return proc;
}

async function waitForVite() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/dev/msm-webgpu/msm-correctness.html`);
      if (r.status === 200) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('vite did not become reachable within 60s');
}

let viteProc = null;
async function teardown() {
  if (viteProc) { try { viteProc.kill('SIGTERM'); } catch {} viteProc = null; }
}

const SWIFTSHADER_ARGS = [
  '--headless=new',
  '--no-sandbox',
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swift-shader',
  '--disable-vulkan-surface',
  '--disable-http2',
];

(async () => {
  viteProc = startVite();
  await waitForVite();
  console.log(`[corr] vite up; launching chromium (swiftshader)…`);

  const browser = await chromium.launch({ headless: !argv.headed, args: SWIFTSHADER_ARGS });
  const page = await browser.newPage();
  page.on('console', m => console.log(`  · ${m.text()}`));
  page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));

  console.log(`[corr] navigating to ${url}`);
  let topErr = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(() => {
      const s = document.getElementById('status')?.textContent ?? '';
      return s === 'OK' || s.startsWith('FAIL') || s.startsWith('THROW') || s === 'no adapter';
    }, undefined, { timeout: timeoutMs });
  } catch (e) {
    topErr = e.message;
  }

  const status = await page.evaluate(() => document.getElementById('status')?.textContent ?? '<unknown>');
  const logText = await page.evaluate(() => document.getElementById('log')?.textContent ?? '');
  const result = await page.evaluate(() => window.__result ?? null);

  console.log(`\n[corr] status: ${status}`);
  console.log(`[corr] page log:\n${logText}\n`);
  console.log(`[corr] result: ${JSON.stringify(result)}`);
  if (topErr) console.log(`[corr] driver error: ${topErr}`);

  await browser.close();
  await teardown();
  process.exit(status === 'OK' ? 0 : 1);
})().catch(async e => {
  console.error(`[corr] fatal: ${e.stack ?? e.message}`);
  await teardown();
  process.exit(99);
});
