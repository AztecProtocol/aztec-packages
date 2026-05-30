#!/usr/bin/env node
// Headless WebGPU-vs-Noble correctness gate under SwiftShader (no GPU, no
// WASM oracle required). Drives index.html?autorun=msm-noble-check, which
// runs the WebGPU MSM and compares its result to noble's CPU pippenger at
// the requested (small) sizes. Used for GPU-less correctness validation of
// the stream-walker / hybrid accumulator at logn=8,10.
//
// Usage:
//   node dev/msm-webgpu/noble-check-swiftshader.mjs [logns] [extraQuery]
//   node dev/msm-webgpu/noble-check-swiftshader.mjs 8,10
//   node dev/msm-webgpu/noble-check-swiftshader.mjs 8,10 '&s=4&wgi=128&prefmem=private'
//
// Env: CHROMIUM_PATH (defaults to the playwright chromium with SwiftShader),
//      PORT (vite dev server port, default 5173).
import { chromium } from 'playwright-core';

const logns = process.argv[2] || '8,10';
const extra = process.argv[3] || '';
const port = process.env.PORT || '5173';
const exe = process.env.CHROMIUM_PATH || '/opt/ms-playwright/chromium-1148/chrome-linux/chrome';
const url = `http://127.0.0.1:${port}/dev/msm-webgpu/index.html?coi=1&autorun=msm-noble-check&logns=${logns}${extra}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: exe,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=swiftshader',
    '--use-vulkan=swiftshader',
    '--disable-gpu-sandbox',
    '--disable-http2',
    '--ignore-certificate-errors',
  ],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  . ${m.text()}`));
page.on('pageerror', e => console.log(`  ! ${e.message}`));

console.log(`URL: ${url}`);
let err = null;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(
    () => /\[autorun\] state=/.test(document.getElementById('log')?.textContent ?? ''),
    undefined,
    { timeout: 600000 },
  );
} catch (e) {
  err = e.message;
}
const logText = await page.evaluate(() => {
  const el = document.getElementById('log');
  return el ? Array.from(el.children).map(c => c.textContent ?? '').join('\n') : '';
});
console.log('─'.repeat(64));
if (err) console.log(`driver err: ${err}`);
for (const l of logText.split('\n').filter(l => /noble-check|state=|\[err\]|PASS|FAIL/.test(l))) console.log(l);
const done = /\[autorun\] state=done/.test(logText);
console.log(`RESULT: ${done ? 'PASS' : 'FAIL'}`);
await browser.close();
process.exit(done ? 0 : 1);
