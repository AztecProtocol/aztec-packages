#!/usr/bin/env node
// Headless driver for xcheck.html. Runs WebGPU MSM correctness cross-checks
// under SwiftShader on a GPU-less host. Requires a real Google Chrome (the
// Playwright-bundled chromium has WebGPU compiled out) and the SwiftShader
// Vulkan ICD that ships inside the Chrome install.
//
// Usage:
//   CHROME=/path/to/chrome VK_ICD=/path/to/vk_swiftshader_icd.json \
//     node dev/msm-webgpu/xcheck-driver.mjs [--port 5173] [--logns 8,10]

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const { values: argv } = parseArgs({
  options: {
    port: { type: 'string', default: '5173' },
    logns: { type: 'string', default: '8,10' },
    glv: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '300000' },
  },
});

const exe = process.env.CHROME;
const vkIcd = process.env.VK_ICD;
if (!exe) {
  console.error('set CHROME=/path/to/google-chrome');
  process.exit(2);
}

const url =
  `http://localhost:${argv.port}/dev/msm-webgpu/xcheck.html?logns=${argv.logns}` + (argv.glv ? '&glv=1' : '');
const timeoutMs = parseInt(argv.timeout, 10);

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-unsafe-swiftshader',
    '--enable-features=Vulkan',
    '--use-vulkan=swiftshader',
    '--use-angle=vulkan',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-http2',
  ],
  env: vkIcd ? { ...process.env, VK_ICD_FILENAMES: vkIcd } : process.env,
});
const page = await browser.newPage();
page.on('console', m => {
  const t = m.text();
  if (!/dbus|Failed to connect to the bus/i.test(t)) console.log(`  · ${t}`);
});
page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));

console.log(`[xcheck] navigating ${url}`);
let topErr = null;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => {
      const s = document.getElementById('status')?.textContent ?? '';
      return s === 'OK' || s.startsWith('FAIL') || s.startsWith('THROW');
    },
    undefined,
    { timeout: timeoutMs },
  );
} catch (e) {
  topErr = e.message;
}

const status = await page.evaluate(() => document.getElementById('status')?.textContent ?? '<unknown>');
const logText = await page.evaluate(() => document.getElementById('log')?.textContent ?? '');
console.log(`\n[xcheck] status: ${status}`);
console.log(`[xcheck] log:\n${logText}\n`);
if (topErr) console.log(`[xcheck] driver error: ${topErr}`);

await browser.close();
process.exit(status === 'OK' ? 0 : 1);
