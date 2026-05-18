#!/usr/bin/env node
// Local simulated-GPU runner: launches the pre-installed Playwright
// Chromium with software WebGPU (SwiftShader) and opens a dev page on
// the local vite server, then waits for it to POST /results (the vite
// middleware appends to MSM_WEBGPU_RESULTS_FILE). Used for FAST
// correctness iteration without BrowserStack.
//
// Usage: node run-local-webgpu.mjs --page bench-msm-e2e --q "logn=16&reps=1" --timeout 600

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const { values: a } = parseArgs({
  options: {
    page: { type: 'string', default: 'bench-msm-e2e' },
    q: { type: 'string', default: 'logn=16&reps=1' },
    port: { type: 'string', default: '5198' },
    timeout: { type: 'string', default: '600' },
    results: { type: 'string', default: '/tmp/msm-webgpu-results.jsonl' },
  },
});

const url = `http://127.0.0.1:${a.port}/dev/msm-webgpu/${a.page}.html?${a.q}`;
const deadline = Date.now() + parseFloat(a.timeout) * 1000;

import { readdirSync } from 'node:fs';
function findHeadlessShell() {
  const root = '/home/aztec-dev/.cache/playwright';
  const dirs = readdirSync(root)
    .filter(d => d.startsWith('chromium_headless_shell-'))
    .sort((x, y) => parseInt(y.split('-')[1]) - parseInt(x.split('-')[1]));
  for (const d of dirs) {
    const p1 = `${root}/${d}/chrome-headless-shell-linux64/chrome-headless-shell`;
    const p2 = `${root}/${d}/chrome-linux/headless_shell`;
    if (existsSync(p1)) return p1;
    if (existsSync(p2)) return p2;
  }
  throw new Error('no chrome-headless-shell found under ~/.cache/playwright');
}
const execPath = findHeadlessShell();
console.error(`[run] chrome: ${execPath}`);
const browser = await chromium.launch({
  executablePath: execPath,
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--use-vulkan=swiftshader',
    '--use-webgpu-adapter=swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--ignore-certificate-errors',
  ],
});
const pg = await browser.newPage();
pg.on('console', m => console.error(`[page:${m.type()}] ${m.text()}`.slice(0, 400)));
pg.on('pageerror', e => console.error(`[pageerror] ${e.message}`));

// navigator.gpu is only exposed on a secure context (served localhost),
// never on about:blank — so probe WebGPU on the served page itself.
console.error(`[run] opening ${url}`);
await pg.goto(url, { waitUntil: 'domcontentloaded' });

const gpu = await pg.evaluate(async () => {
  if (!('gpu' in navigator)) return 'no navigator.gpu';
  try {
    const ad = await navigator.gpu.requestAdapter();
    if (!ad) return 'no adapter';
    const info = ad.info || (await ad.requestAdapterInfo?.());
    return 'adapter: ' + JSON.stringify(info ?? {});
  } catch (e) {
    return 'adapter err: ' + e.message;
  }
});
console.error(`[webgpu] ${gpu}`);
if (gpu.startsWith('no ') || gpu.startsWith('adapter err')) {
  console.error('WEBGPU_UNAVAILABLE');
  await browser.close();
  process.exit(3);
}

let last = '';
while (Date.now() < deadline) {
  if (existsSync(a.results)) {
    const txt = readFileSync(a.results, 'utf8').trim();
    if (txt && txt !== last) {
      last = txt;
      const lines = txt.split('\n').filter(Boolean);
      const row = JSON.parse(lines[lines.length - 1]);
      if (row.state === 'done' || row.state === 'error') {
        console.log(JSON.stringify(row));
        await browser.close();
        process.exit(row.state === 'done' ? 0 : 4);
      }
    }
  }
  await sleep(2000);
}
console.error('TIMEOUT waiting for /results');
await browser.close();
process.exit(5);
