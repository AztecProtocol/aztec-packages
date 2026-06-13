#!/usr/bin/env node
// Boot-stage probe: load the page, wait for a console marker, report
// reached/stalled plus the LAST console lines either way. Never idles
// past the cap. Usage: node boot-probe.mjs <port> <query> <marker-regex> <capSeconds>
import { chromium } from 'playwright-core';

const [port, query, markerRe, capS] = process.argv.slice(2);
const marker = new RegExp(markerRe);
const cap = (parseInt(capS, 10) || 45) * 1000;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
const page = await browser.newPage();
const lines = [];
let hit = null;
const hitP = new Promise(res => {
  page.on('console', m => {
    const t = m.text();
    lines.push(t);
    if (marker.test(t)) {
      hit = t;
      res(true);
    }
  });
});
page.on('response', r => {
  if (r.status() === 404) lines.push(`404: ${r.url()}`);
});
page.on('pageerror', e => lines.push(`PAGEERROR: ${e.message}`));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/dev/msm-webgpu/index.html${query}`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
const ok = await Promise.race([hitP, new Promise(res => setTimeout(() => res(false), cap))]);
console.log(ok ? `REACHED "${hit}" in ${Date.now() - t0}ms` : `STALLED after ${cap}ms`);
console.log(`last lines:`);
for (const l of lines.slice(-8)) console.log(`  · ${l}`);
await browser.close();
process.exit(ok ? 0 : 1);
