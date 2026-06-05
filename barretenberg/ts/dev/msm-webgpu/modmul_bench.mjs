// Same-machine A/B: hand-written RNS modmul vs the production f8_native CIOS montmul,
// on this GPU, dependent-chain methodology (matches the existing montmul microbench).
//   node dev/msm-webgpu/modmul_bench.mjs [Kperf=262144] [chain=64] [reps=30]
// Validates BOTH at chain=1 (byte-identical to their respective oracles), then times a
// dependent chain at chain=N. Reports ns/mul for each + the ratio.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { chromium } from 'playwright-core';
import { computeParams, rnsModmul, toMont, T } from './rns_params.mjs';

const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
const HERE = dirname(fileURLToPath(import.meta.url));
const wgslDir = join(HERE, '..', '..', 'src', 'msm_webgpu', 'wgsl');
const Kperf = Number(process.argv[2] ?? 262144);
const CHAIN = Number(process.argv[3] ?? 64);
const reps = Number(process.argv[4] ?? 30);

// ---- shared number theory ----
function modinv(a, m) { let [g, x, g2, x2] = [((a % m) + m) % m, 1n, m, 0n]; while (g2) { const q = g / g2;[g, g2] = [g2, g - q * g2];[x, x2] = [x2, x - q * x2]; } return ((x % m) + m) % m; }
const rnd = () => { let r = 0n; for (let i = 0; i < 8; i++) r = (r << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return r % P; };
const KVAL = 4096;
const pairs = []; for (let i = 0; i < KVAL; i++) pairs.push([rnd(), rnd()]);

// ============================ RNS kernel spec ============================
const p = computeParams();
const toM = (x) => toMont(x, p.mM); // per-residue [R] Montgomery form
const toN = (x) => toMont(x, p.mN);
const rnsIn = []; const rnsExp = [];
for (const [a, b] of pairs) {
  const aM = toM(a), aN = toN(a), bM = toM(b), bN = toN(b);
  rnsIn.push(...aM, ...aN, ...bM, ...bN);
  const { rM, rN } = rnsModmul(aM, aN, bM, bN, p);
  rnsExp.push(...rM, ...rN);
}
const rnsEntry = (chain) => `
@group(0) @binding(0) var<storage, read> ins: array<u32>;
@group(0) @binding(1) var<storage, read_write> outs: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = arrayLength(&outs) / 40u; if (gid.x >= n) { return; }
  let base = gid.x * 80u;
  var a: Rns2; var b: Rns2;
  for (var i = 0u; i < RNS_T; i++) { a.m[i] = ins[base+i]; a.n[i] = ins[base+20u+i]; b.m[i] = ins[base+40u+i]; b.n[i] = ins[base+60u+i]; }
  var r = a;
  for (var k = 0u; k < ${chain}u; k++) { r = rns_modmul(r, b); }
  let o = gid.x * 40u;
  for (var i = 0u; i < RNS_T; i++) { outs[o+i] = r.m[i]; outs[o+20u+i] = r.n[i]; }
}`;
const rnsWgsl = (chain) => [
  readFileSync(join(wgslDir, 'rns', 'rns_constants.wgsl'), 'utf8'),
  readFileSync(join(wgslDir, 'rns', 'rns_field.wgsl'), 'utf8'),
  rnsEntry(chain),
].join('\n');

// ============================ f8 kernel spec ============================
const W = 13n, MASKb = (1n << W) - 1n;
const N0 = ((1n << W) - modinv(P & MASKb, 1n << W)) % (1n << W);
const P8 = [...Array(8)].map((_, i) => Number((P >> BigInt(32 * i)) & 0xffffffffn));
const Rinv = modinv((1n << 260n) % P, P);
const pack8 = (x) => [...Array(8)].map((_, i) => Number((x >> BigInt(32 * i)) & 0xffffffffn));
const f8In = []; const f8Exp = [];
for (const [a, b] of pairs) { f8In.push(...pack8(a), ...pack8(b)); f8Exp.push(...pack8((a * b * Rinv) % P)); }
const f8Prelude = `
const WORD_SIZE: u32 = 13u;
const MASK: u32 = 8191u;
const N0: u32 = ${N0}u;
${P8.map((v, i) => `const P8_${i}: u32 = ${v >>> 0}u;`).join('\n')}
struct BigInt { limbs: array<u32, 20> }
fn unpack256_to_limbs(x: array<u32, 8>) -> BigInt {
  var r: BigInt;
  for (var i = 0u; i < 20u; i++) {
    let bit = i * 13u; let w = bit >> 5u; let off = bit & 31u;
    var v = x[w] >> off;
    if (off > 19u && w < 7u) { v = v | (x[w + 1u] << (32u - off)); }
    r.limbs[i] = v & 0x1fffu;
  }
  return r;
}`;
const f8Entry = (chain) => `
@group(0) @binding(0) var<storage, read> ins: array<u32>;
@group(0) @binding(1) var<storage, read_write> outs: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = arrayLength(&outs) / 8u; if (gid.x >= n) { return; }
  let base = gid.x * 16u;
  var a: array<u32, 8>; var b: array<u32, 8>;
  for (var i = 0u; i < 8u; i++) { a[i] = ins[base+i]; b[i] = ins[base+8u+i]; }
  var r = a;
  for (var k = 0u; k < ${chain}u; k++) { r = montgomery_product_f8(r, b); }
  let o = gid.x * 8u;
  for (var i = 0u; i < 8u; i++) { outs[o+i] = r[i]; }
}`;
const f8Wgsl = (chain) => [
  f8Prelude,
  readFileSync(join(wgslDir, 'montgomery', 'mont_pro_product_f8_native.template.wgsl'), 'utf8'),
  f8Entry(chain),
].join('\n');

// ============================ GPU driver ============================
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><html><body></body></html>'); }).listen(0);
const port = srv.address().port;
const ctx = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'] });
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/`);

const bench = async (name, wgslVal, wgslPerf, inU32, outU32, inputs, expected) =>
  page.evaluate(async ({ name, wgslVal, wgslPerf, inU32, outU32, inputs, expected, KVAL, Kperf, reps }) => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    const info = adapter.info ?? {};
    const device = await adapter.requestDevice();
    const build = async (code) => {
      const m = device.createShaderModule({ code });
      const ci = await m.getCompilationInfo();
      const errs = ci.messages.filter((x) => x.type === 'error').map((x) => `${x.lineNum}:${x.linePos} ${x.message}`);
      if (errs.length) throw new Error(`${name} compile: ${errs.join(' | ')}`);
      return device.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main' } });
    };
    const io = (pipe, K, inArr) => {
      const inBuf = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(inBuf, 0, inArr);
      const outBytes = K * outU32 * 4;
      const outBuf = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
      return { outBuf, bg, outBytes };
    };
    const disp = (pipe, x, K) => { const e = device.createCommandEncoder(); const pp = e.beginComputePass(); pp.setPipeline(pipe); pp.setBindGroup(0, x.bg); pp.dispatchWorkgroups(Math.ceil(K / 64)); pp.end(); return e; };

    // validate at chain=1
    const pv = await build(wgslVal);
    const xv = io(pv, KVAL, new Uint32Array(inputs));
    const stage = device.createBuffer({ size: xv.outBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    { const e = disp(pv, xv, KVAL); e.copyBufferToBuffer(xv.outBuf, 0, stage, 0, xv.outBytes); device.queue.submit([e.finish()]); }
    await stage.mapAsync(GPUMapMode.READ);
    const got = new Uint32Array(stage.getMappedRange().slice(0)); stage.unmap();
    let mism = 0; const firsts = [];
    for (let i = 0; i < KVAL * outU32; i++) if (got[i] !== expected[i]) { mism++; if (firsts.length < 4) firsts.push({ i, got: got[i], exp: expected[i] }); }

    // perf at chain=N
    const pp = await build(wgslPerf);
    const cin = new Uint32Array(inputs); const pin = new Uint32Array(Kperf * inU32);
    for (let i = 0; i < pin.length; i++) pin[i] = cin[i % cin.length];
    const xp = io(pp, Kperf, pin);
    for (let w = 0; w < 5; w++) device.queue.submit([disp(pp, xp, Kperf).finish()]);
    await device.queue.onSubmittedWorkDone();
    const ts = [];
    for (let r = 0; r < reps; r++) { const t0 = performance.now(); device.queue.submit([disp(pp, xp, Kperf).finish()]); await device.queue.onSubmittedWorkDone(); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    return { name, info: { vendor: info.vendor, architecture: info.architecture }, mism, firsts, median_ms: ts[ts.length >> 1], min_ms: ts[0] };
  }, { name, wgslVal, wgslPerf, inU32, outU32, inputs, expected, KVAL, Kperf, reps });

const rns = await bench('rns', rnsWgsl(1), rnsWgsl(CHAIN), 80, 40, rnsIn, rnsExp);
const f8 = await bench('f8', f8Wgsl(1), f8Wgsl(CHAIN), 16, 8, f8In, f8Exp);
await ctx.close(); srv.close();

const muls = Kperf * CHAIN;
const ns = (r) => (r.median_ms * 1e6) / muls;
const nsmin = (r) => (r.min_ms * 1e6) / muls;
console.log(`\nadapter: ${rns.info.vendor}/${rns.info.architecture}   K=${Kperf} chain=${CHAIN} reps=${reps}\n`);
for (const r of [f8, rns]) {
  console.log(`${r.name.padEnd(4)}  correctness mism=${r.mism}${r.mism ? '  ' + JSON.stringify(r.firsts) : ''}`);
  console.log(`      median ${r.median_ms.toFixed(3)} ms -> ${ns(r).toFixed(3)} ns/mul   (min ${nsmin(r).toFixed(3)})`);
}
console.log(`\nRNS / f8  = ${(ns(rns) / ns(f8)).toFixed(2)}x  (median ns/mul; <1 means RNS faster)`);
process.exit(rns.mism === 0 && f8.mism === 0 ? 0 : 1);
