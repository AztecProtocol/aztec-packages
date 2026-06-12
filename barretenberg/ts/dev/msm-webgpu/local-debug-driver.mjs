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
// Event-driven exit: poll the page log for a terminal marker and leave
// immediately; --secs is only the safety cap (the old flat sleep burned
// ~80 s of dead time per invocation).
{
  const capMs = parseInt(argv.secs, 10) * 1000;
  const t0 = Date.now();
  // NOT 'jac and legacy agree': with ?jacruns=N that line is per-run, and
  // exiting on run 1 hides every later run. state=done covers completion.
  const TERMINAL = /state=done|state=error|MISMATCH|FATAL|\[shader-test\] state=done|DONE —/;
  for (;;) {
    if (Date.now() - t0 > capMs) break;
    const txt = await page
      .evaluate(() => document.getElementById('log')?.textContent ?? '')
      .catch(() => '');
    if (TERMINAL.test(txt)) break;
    await new Promise(r => setTimeout(r, 500));
  }
}
const logText = await page.evaluate(() => document.getElementById('log')?.textContent ?? '<no #log>').catch(e => `<eval err: ${e.message}>`);
console.log(`[debug] #log tail:\n${logText.slice(-3000)}`);
await browser.close();
