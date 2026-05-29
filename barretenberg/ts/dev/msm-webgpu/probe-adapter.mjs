import { chromium } from 'playwright-core';

const EXE = process.env.CHROMIUM_PATH || '/opt/ms-playwright/chromium-1148/chrome-linux/chrome';
const flagSet = (process.env.FLAGS || '').split(' ').filter(Boolean);

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: flagSet,
});
const page = await browser.newPage();
page.on('console', m => console.log(`  · ${m.text()}`));
await page.goto('http://127.0.0.1:5173/dev/msm-webgpu/index.html?coi=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
const info = await page.evaluate(async () => {
  if (!('gpu' in navigator)) return { gpu: false };
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { gpu: true, adapter: null };
    const i = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {});
    return { gpu: true, adapter: { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description } };
  } catch (e) {
    return { gpu: true, error: String(e) };
  }
});
console.log('RESULT', JSON.stringify(info));
await browser.close();
