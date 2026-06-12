#!/usr/bin/env node
// Isolation probe: render the schedule kernels (integer-only templates)
// and compile each in a bare WebGPU context with a hard per-kernel
// timeout — separates "Metal compiler hang" from "runtime hang" and
// surfaces compilation messages the full page swallows.
// Usage: node dev/msm-webgpu/sched-compile-probe.mjs <port> [names...]
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import mustache from 'mustache';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wgslDir = join(__dirname, '..', '..', 'src', 'msm_webgpu', 'wgsl', 'cuzk');
const port = process.argv[2] ?? '5224';
const only = process.argv.slice(3);

const geom = {
  coop_thresh: 12288,
  emit_tpb: 64,
  aff_tpb: 64,
  aff_s: 8,
  coop_tpb: 256,
  norm_tpb: 64,
  norm_c: 8,
  recompile: '',
};
const kernels = [];
for (const name of ['wi_sched_plan', 'wi_sched_emit']) {
  if (only.length && !only.includes(name)) continue;
  const src = await readFile(join(wgslDir, `${name}.template.wgsl`), 'utf8');
  kernels.push({ name, code: mustache.render(src, geom) });
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  · ${m.text()}`));
await page.goto(`http://127.0.0.1:${port}/dev/msm-webgpu/index.html`, { waitUntil: 'domcontentloaded' });

for (const k of kernels) {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      page.evaluate(async code => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        const mod = device.createShaderModule({ code });
        const info = await mod.getCompilationInfo();
        const msgs = info.messages.map(m => `${m.type} L${m.lineNum}: ${m.message}`);
        if (msgs.some(m => m.startsWith('error'))) return { ok: false, msgs };
        await device.createComputePipelineAsync({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
        return { ok: true, msgs };
      }, k.code),
      new Promise((_, rej) => setTimeout(() => rej(new Error('COMPILE TIMEOUT (20s)')), 20000)),
    ]);
    console.log(`${k.name}: ${r.ok ? 'OK' : 'FAIL'} in ${Date.now() - t0}ms`);
    for (const m of r.msgs) console.log(`    ${m}`);
  } catch (e) {
    console.log(`${k.name}: ${e.message} after ${Date.now() - t0}ms`);
  }
}
await browser.close();
