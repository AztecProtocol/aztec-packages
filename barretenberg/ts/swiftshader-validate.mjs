import { chromium } from 'playwright-core';
const CHROME = '/opt/ms-playwright/chromium-1148/chrome-linux/chrome';
const ICD = '/opt/ms-playwright/chromium-1148/chrome-linux/vk_swiftshader_icd.json';
const browser = await chromium.launch({ executablePath: CHROME, headless: true,
  args: ['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--disable-http2','--ignore-certificate-errors'],
  env: { ...process.env, VK_ICD_FILENAMES: ICD, VK_ICD_FILENAME: ICD } });
const page = await browser.newPage();
page.on('console', m => console.log(`  . ${m.text()}`));
page.on('pageerror', e => console.log(`  ! ${e.message}`));
await page.goto('http://localhost:5173/dev/msm-webgpu/walker-validate.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const s=document.getElementById('status')?.textContent??''; return s==='OK'||s.startsWith('FAIL')||s.startsWith('THROW')||s==='no adapter'; }, null, { timeout: 300000 });
const status = await page.evaluate(() => document.getElementById('status')?.textContent ?? '?');
console.log(`\n>>> VALIDATE: ${status}`);
await browser.close();
process.exit(status === 'OK' ? 0 : 1);
