#!/usr/bin/env node
// Per-rep phase dump: like local-bench-driver but prints EVERY rep's wall + top phase times.
// Usage: node /tmp/per-rep-driver.mjs <port> <logn> <reps> [extra]
import { chromium } from 'playwright-core';

const [port, logn, reps, extra = ''] = process.argv.slice(2);
const url =
  `http://127.0.0.1:${port}/dev/msm-webgpu/index.html` +
  `?autorun=msm-bench&no_wasm=1&logn=${logn}&reps=${reps}&trace=1` +
  (extra.includes('scalar_dist=') ? '' : '&scalar_dist=uniform') +
  extra;

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
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => Array.isArray(window.__benchSamples) && window.__benchSamples.length > 0,
    undefined,
    { timeout: 300000 },
  );
  const samples = await page.evaluate(() => window.__benchSamples);
  for (let r = 0; r < samples.length; r++) {
    const s = samples[r];
    const per = new Map();
    for (const [ph, b, e] of s.passTimes ?? []) {
      per.set(ph, (per.get(ph) ?? 0) + (Number(e) - Number(b)) / 1e6);
    }
    const rows = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    const tot = [...per.values()].reduce((a, b) => a + b, 0);
    console.log(
      `rep${r + 1}: wall=${s.wallMs.toFixed(1)}ms gpuTot=${tot.toFixed(1)} | ` +
        rows.map(([p, m]) => `${p}=${m.toFixed(2)}`).join(' '),
    );
  }
} catch (e) {
  console.log(`driver error: ${e.message}`);
}
await browser.close();
