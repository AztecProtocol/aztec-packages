// Headless SwiftShader driver for the MSM comparison page, for containers
// with no GPU. Launches Playwright's bundled full Chromium (not the headless
// shell, which lacks WebGPU) with Vulkan+SwiftShader so `navigator.gpu`
// resolves to a software adapter, and routes external CRS fetches through the
// egress proxy named by $HTTPS_PROXY (localhost is bypassed).
//
//   node dev/msm-webgpu/drive-swiftshader.mjs \
//     'http://127.0.0.1:5173/dev/msm-webgpu/index.html?autorun=msm-gpu-noble&logn=8&srs_logn=10&logn_min=8'
//
// Pair the page with the small-vector knobs (?srs_logn/?logn_min/?noble_logn)
// so the SRS preload and the noble oracle stay within the software renderer's
// memory and time budget.
import { chromium } from 'playwright-core';

const EXE =
  process.env.SWIFTSHADER_CHROME ??
  '/opt/ms-playwright/chromium-1148/chrome-linux/chrome';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
let target =
  argv.find(a => !a.startsWith('--')) ??
  'http://127.0.0.1:5173/dev/msm-webgpu/index.html?autorun=msm-gpu-noble&logn=8&srs_logn=10&logn_min=8';
if (!/^https?:/.test(target)) target = `http://127.0.0.1:5173/dev/msm-webgpu/${target}`;

const proxyServer = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? null;

const browser = await chromium.launch({
  executablePath: EXE,
  headless: !headed,
  ...(proxyServer
    ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost,host.docker.internal' } }
    : {}),
  args: [
    '--no-sandbox',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--use-vulkan=swiftshader',
    '--use-angle=swiftshader',
    // The egress proxy is a MITM with a private CA chromium doesn't trust;
    // ignore-certificate-errors (plus ignoreHTTPSErrors below) lets the CRS
    // range-fetch succeed. Safe here: traffic only reaches the configured proxy.
    '--ignore-certificate-errors',
    // headless Chrome intermittently fails the CRS CDN range fetch with
    // ERR_HTTP2_PROTOCOL_ERROR; HTTP/1.1 is reliable.
    '--disable-http2',
  ],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
// SwiftShader compiles ~40 WGSL shaders in software at warmup; that alone
// can exceed Playwright's 30 s default, so raise every wait ceiling.
page.setDefaultTimeout(600000);
page.setDefaultNavigationTimeout(600000);
page.on('console', m => console.log(`  · ${m.text()}`));
page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));

console.log(`navigating: ${target}`);
let runnerErr = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 600000 });
  // NB: waitForFunction is (fn, arg, options) — options MUST be the third
  // positional arg, else it's read as `arg` and the 30 s default applies.
  await page.waitForFunction(
    () => {
      const t = document.getElementById('log')?.textContent ?? '';
      return /\[autorun\] state=/.test(t);
    },
    undefined,
    { timeout: 600000 },
  );
} catch (e) {
  runnerErr = e.message;
}

const logText = await page.evaluate(() => {
  const el = document.getElementById('log');
  if (!el) return '';
  return Array.from(el.children).map(c => c.textContent ?? '').join('\n');
});
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of logText.split('\n').slice(-80)) console.log(l);
await browser.close();
const passed = /\bagree\b/.test(logText) && !/disagreement|FATAL|state=error/.test(logText);
process.exit(runnerErr || !passed ? 1 : 0);
