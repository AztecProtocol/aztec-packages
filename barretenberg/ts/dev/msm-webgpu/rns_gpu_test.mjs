// On-device test of the hand-written rns_field.wgsl on this machine's GPU (Chrome/Tint).
// Self-contained: blank page + raw WebGPU, WGSL read from disk, oracle in Node.
//   node dev/msm-webgpu/rns_gpu_test.mjs [Kperf=262144] [reps=30]
// Reports: byte-identical correctness vs the BigInt oracle, and isolated per-thread
// RNS modmul throughput (ns/mul). NOTE: isolated modmul is the WORST case for RNS
// (2t^2+13t); the deploy metric is the EC-add (plan §5), measured later.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { chromium } from 'playwright-core';
import { computeParams, rnsModmul, T } from './rns_params.mjs';

const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
const HERE = dirname(fileURLToPath(import.meta.url));
const wgslDir = join(HERE, '..', '..', 'src', 'msm_webgpu', 'wgsl', 'rns');
const Kperf = Number(process.argv[2] ?? 262144);
const reps = Number(process.argv[3] ?? 30);

const p = computeParams();
const toM = (x) => p.mM.map((m) => Number(((x % m) + m) % m));
const toN = (x) => p.mN.map((n) => Number(((x % n) + n) % n));

// Correctness inputs: edges x edges, then random. 80 u32/pair in, 40 u32/pair expected.
const edges = [0n, 1n, 2n, P - 1n, P - 2n, (P - 1n) / 2n, p.M % P, p.N % P, 0x123456789abcdefn];
const rnd = () => { let r = 0n; for (let i = 0; i < 8; i++) r = (r << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return r % P; };
const pairs = [];
for (const a of edges) for (const b of edges) pairs.push([a, b]);
while (pairs.length < 4096) pairs.push([rnd(), rnd()]);
const Kc = pairs.length;

const inputs = new Array(Kc * 80);
const expected = new Array(Kc * 40);
for (let k = 0; k < Kc; k++) {
  const [a, b] = pairs[k];
  const aM = toM(a), aN = toN(a), bM = toM(b), bN = toN(b);
  const o = k * 80;
  for (let i = 0; i < T; i++) { inputs[o + i] = aM[i]; inputs[o + 20 + i] = aN[i]; inputs[o + 40 + i] = bM[i]; inputs[o + 60 + i] = bN[i]; }
  const { rM, rN } = rnsModmul(aM, aN, bM, bN, p);
  const e = k * 40;
  for (let i = 0; i < T; i++) { expected[e + i] = rM[i]; expected[e + 20 + i] = rN[i]; }
}

const wgsl = [
  readFileSync(join(wgslDir, 'rns_constants.wgsl'), 'utf8'),
  readFileSync(join(wgslDir, 'rns_field.wgsl'), 'utf8'),
  `
@group(0) @binding(0) var<storage, read> ins: array<u32>;
@group(0) @binding(1) var<storage, read_write> outs: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = arrayLength(&outs) / 40u;
  if (gid.x >= n) { return; }
  let base = gid.x * 80u;
  var a: Rns2; var b: Rns2;
  for (var i = 0u; i < RNS_T; i++) {
    a.m[i] = ins[base + i]; a.n[i] = ins[base + 20u + i];
    b.m[i] = ins[base + 40u + i]; b.n[i] = ins[base + 60u + i];
  }
  let r = rns_modmul(a, b);
  let o = gid.x * 40u;
  for (var i = 0u; i < RNS_T; i++) { outs[o + i] = r.m[i]; outs[o + 20u + i] = r.n[i]; }
}`,
].join('\n');

// WebGPU is only exposed on a real (http) origin, not about:blank — serve a blank page.
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><html><body></body></html>'); }).listen(0);
const port = srv.address().port;
const ctx = await chromium.launchPersistentContext('', {
  channel: 'chrome', headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
page.on('console', (m) => console.log('  ·', m.text()));
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async ({ wgsl, inputs, expected, Kc, Kperf, reps }) => {
  if (!navigator.gpu) return { err: 'no navigator.gpu' };
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return { err: 'no adapter' };
  const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
  const device = await adapter.requestDevice();
  let deviceErr = null; device.addEventListener('uncapturederror', (e) => { deviceErr = String(e.error?.message ?? e.error); });
  const module = device.createShaderModule({ code: wgsl });
  const ci = await module.getCompilationInfo();
  const errs = ci.messages.filter((m) => m.type === 'error').map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
  if (errs.length) return { compileError: errs };
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });

  const mkIO = (K, inArr) => {
    const inBuf = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inBuf, 0, inArr);
    const outBytes = K * 40 * 4;
    const outBuf = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    return { inBuf, outBuf, bg, outBytes };
  };
  const dispatch = (io, K) => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, io.bg);
    pass.dispatchWorkgroups(Math.ceil(K / 64)); pass.end();
    return enc;
  };

  // --- correctness ---
  const c = mkIO(Kc, new Uint32Array(inputs));
  const stage = device.createBuffer({ size: c.outBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  { const enc = dispatch(c, Kc); enc.copyBufferToBuffer(c.outBuf, 0, stage, 0, c.outBytes); device.queue.submit([enc.finish()]); }
  await stage.mapAsync(GPUMapMode.READ);
  const got = new Uint32Array(stage.getMappedRange().slice(0)); stage.unmap();
  let mism = 0; const firsts = [];
  for (let i = 0; i < Kc * 40; i++) if (got[i] !== expected[i]) { mism++; if (firsts.length < 6) firsts.push({ i, got: got[i], exp: expected[i] }); }

  // --- throughput: tile the correctness input to Kperf pairs, time fenced dispatches ---
  const cin = new Uint32Array(inputs);
  const pin = new Uint32Array(Kperf * 80);
  for (let i = 0; i < pin.length; i++) pin[i] = cin[i % cin.length];
  const pf = mkIO(Kperf, pin);
  for (let w = 0; w < 5; w++) device.queue.submit([dispatch(pf, Kperf).finish()]);
  await device.queue.onSubmittedWorkDone();
  const times = [];
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    device.queue.submit([dispatch(pf, Kperf).finish()]);
    await device.queue.onSubmittedWorkDone();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[times.length >> 1], min = times[0];
  return {
    info: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description },
    mism, firsts, Kc, Kperf, reps, deviceErr,
    median_ms: median, min_ms: min,
    ns_per_mul_median: (median * 1e6) / Kperf, ns_per_mul_min: (min * 1e6) / Kperf,
  };
}, { wgsl, inputs, expected, Kc, Kperf, reps });

await ctx.close();
srv.close();

if (result.err || result.compileError) { console.error('GPU SETUP FAILED:', result.err ?? result.compileError); process.exit(1); }
console.log(`\nadapter: ${result.info.vendor ?? '?'} / ${result.info.architecture ?? '?'} ${result.info.description ?? ''}`);
console.log(`correctness: ${result.Kc} modmuls (edges+random), mismatches=${result.mism}` + (result.deviceErr ? `  deviceErr=${result.deviceErr}` : ''));
if (result.mism) console.log('  first mismatches:', result.firsts);
console.log(`throughput: K=${result.Kperf}, reps=${result.reps}`);
console.log(`  median ${result.median_ms.toFixed(3)} ms  ->  ${result.ns_per_mul_median.toFixed(3)} ns/mul`);
console.log(`  min    ${result.min_ms.toFixed(3)} ms  ->  ${result.ns_per_mul_min.toFixed(3)} ns/mul`);
console.log(result.mism === 0 ? '\nGPU BYTE-IDENTICAL TO ORACLE ✓' : `\nMISMATCH (${result.mism}) ✗`);
process.exit(result.mism === 0 ? 0 : 1);
