#!/usr/bin/env node
// Open an arbitrary dev-page URL in headless Chrome, dump ALL console
// output + page errors for --secs seconds, then exit. Pure triage tool.
// Usage: node dev/msm-webgpu/local-debug-driver.mjs --url "http://..." [--secs 60]

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const { values: argv } = parseArgs({
  options: {
    url: { type: 'string' },
    secs: { type: 'string', default: '60' },
    headed: { type: 'boolean', default: false },
  },
});

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !argv.headed,
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  [${m.type()}] ${m.text()}`));
page.on('pageerror', e => console.log(`  !! pageerror: ${e.message}`));
page.on('framenavigated', f => console.log(`  -> navigated: ${f.url()}`));
console.log(`[debug] goto ${argv.url}`);
try {
  await page.goto(argv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch (e) {
  console.log(`[debug] goto error: ${e.message}`);
}
await new Promise(r => setTimeout(r, parseInt(argv.secs, 10) * 1000));
const logText = await page.evaluate(() => document.getElementById('log')?.textContent ?? '<no #log>').catch(e => `<eval err: ${e.message}>`);
console.log(`[debug] #log tail:\n${logText.slice(-3000)}`);
await browser.close();
