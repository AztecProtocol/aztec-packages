#!/usr/bin/env node
// Per-PASS dump: every dispatch in encode order with its GPU span and the
// gap since the previous pass ended. One steady-state rep (last of N).
// Usage: node pass-dump-driver.mjs <port> <logn> <reps> [extra] [minUs]
import { chromium } from 'playwright-core';

const [port, logn, reps, extra = '', minUsArg] = process.argv.slice(2);
const minUs = parseInt(minUsArg ?? '0', 10) || 0;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=WebGPU',
    '--enable-webgpu-developer-features',
    '--disable-dawn-features=timestamp_quantization',
    '--disable-http2',
  ],
});
const page = await browser.newPage();
try {
  await page.goto(
    `http://127.0.0.1:${port}/dev/msm-webgpu/index.html?autorun=msm-bench&no_wasm=1&logn=${logn}&reps=${reps}&trace=1` +
      (extra.includes('scalar_dist=') ? '' : '&scalar_dist=uniform') +
      extra,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  );
  await page.waitForFunction(
    () => Array.isArray(window.__benchSamples) && window.__benchSamples.length > 0,
    undefined,
    { timeout: 300000 },
  );
  const samples = await page.evaluate(() => window.__benchSamples);
  const s = samples[samples.length - 1];
  let prevEnd = null;
  let phase = '';
  let pi = 0;
  console.log(`passes=${s.passTimes.length} wall=${s.wallMs.toFixed(1)}ms`);
  for (const [ph, b, e] of s.passTimes) {
    const us = (Number(e) - Number(b)) / 1e3;
    const gap = prevEnd === null ? 0 : (Number(b) - prevEnd) / 1e3;
    prevEnd = Number(e);
    pi = ph === phase ? pi + 1 : 0;
    phase = ph;
    if (us >= minUs || gap >= minUs) {
      console.log(`${ph}[${pi}]	${us.toFixed(1)}us	gap=${gap.toFixed(1)}us`);
    }
  }
} catch (e) {
  console.log(`driver error: ${e.message}`);
}
await browser.close();
