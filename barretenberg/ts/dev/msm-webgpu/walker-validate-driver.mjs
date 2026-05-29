#!/usr/bin/env node
// Drive walker-validate.html via headless Chrome (real WebGPU on host GPU).
// Usage:
//   node dev/msm-webgpu/walker-validate-driver.mjs [--port 5198] [--headed]

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const { values: argv } = parseArgs({
  options: {
    port: { type: 'string', default: '5198' },
    headed: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '60000' },
  },
});

const url = `http://127.0.0.1:${argv.port}/dev/msm-webgpu/walker-validate.html`;
const timeoutMs = parseInt(argv.timeout, 10);

console.log(`[validate] launching chrome (headed=${argv.headed})...`);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !argv.headed,
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  · ${m.text()}`));
page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));

console.log(`[validate] navigating to ${url}`);
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

console.log(`\n[validate] status: ${status}`);
console.log(`[validate] page log:\n${logText}\n`);
if (topErr) console.log(`[validate] driver error: ${topErr}`);

await browser.close();
process.exit(status === 'OK' ? 0 : 1);
