// Sensitivity diagnostic: is the per-thread RNS kernel reduction-bound or matvec-bound?
// Builds ONE kernel (rns_field_diag.wgsl) at several (RED_EXTRA, MV_TERMS) settings via
// pipeline-override constants and times them BACK-TO-BACK in one run, so slow thermal drift
// cannot bias the relative comparison. RED_EXTRA adds idempotent reduction passes (more
// reduction ALU); MV_TERMS cuts matvec inner terms (less matvec; wrong result, timing only).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { chromium } from 'playwright-core';
import { computeParams, rnsModmul, toMont } from './rns_params.mjs';

const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
const HERE = dirname(fileURLToPath(import.meta.url));
const wgslDir = join(HERE, '..', '..', 'src', 'msm_webgpu', 'wgsl');
const K = Number(process.argv[2] ?? 131072), CHAIN = Number(process.argv[3] ?? 64), reps = Number(process.argv[4] ?? 40);
const rnd = () => { let r = 0n; for (let i = 0; i < 8; i++) r = (r << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return r % P; };
const p = computeParams();
const pairs = []; for (let i = 0; i < 4096; i++) pairs.push([rnd(), rnd()]);
const inp = []; const exp = [];
for (const [a, b] of pairs) {
  const aM = toMont(a, p.mM), aN = toMont(a, p.mN), bM = toMont(b, p.mM), bN = toMont(b, p.mN);
  inp.push(...aM, ...aN, ...bM, ...bN);
  const { rM, rN } = rnsModmul(aM, aN, bM, bN, p); exp.push(...rM, ...rN);
}
const wgsl = [readFileSync(join(wgslDir, 'rns', 'rns_constants.wgsl'), 'utf8'), readFileSync(join(wgslDir, 'rns', 'rns_field_diag.wgsl'), 'utf8'), `
@group(0) @binding(0) var<storage,read> ins: array<u32>;
@group(0) @binding(1) var<storage,read_write> outs: array<u32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let n=arrayLength(&outs)/40u; if(g.x>=n){return;} let b=min(g.x,n-1u)*80u; var a:Rns2; var bb:Rns2;
  for(var i=0u;i<RNS_T;i++){a.m[i]=ins[b+i];a.n[i]=ins[b+20u+i];bb.m[i]=ins[b+40u+i];bb.n[i]=ins[b+60u+i];}
  var cm=a; for(var k=0u;k<CHAINK;k++){cm=rns_modmul(cm,bb);}
  let o=g.x*40u; for(var i=0u;i<RNS_T;i++){outs[o+i]=cm.m[i];outs[o+20u+i]=cm.n[i];} }`].join('\n')
  .replace('CHAINK', `${CHAIN}u`);

const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><html><body></body></html>'); }).listen(0);
const port = srv.address().port;
const ctx = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'] });
const page = ctx.pages()[0] ?? await ctx.newPage(); await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async ({ wgsl, inp, exp, K, CHAIN, reps }) => {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const device = await adapter.requestDevice();
  const module = device.createShaderModule({ code: wgsl });
  const ci = await module.getCompilationInfo(); const errs = ci.messages.filter((m) => m.type === 'error').map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
  if (errs.length) return { err: errs };
  const inArr = new Uint32Array(K * 80); const small = new Uint32Array(inp); for (let i = 0; i < inArr.length; i++) inArr[i] = small[i % small.length];
  const inBuf = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(inBuf, 0, inArr);
  const outBuf = device.createBuffer({ size: K * 40 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const time = async (RED_EXTRA, MV_TERMS) => {
    const pipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main', constants: { RED_EXTRA, MV_TERMS } } });
    const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    const enc = () => { const e = device.createCommandEncoder(); const pp = e.beginComputePass(); pp.setPipeline(pipe); pp.setBindGroup(0, bg); pp.dispatchWorkgroups(Math.ceil(K / 64)); pp.end(); return e.finish(); };
    for (let w = 0; w < 4; w++) device.queue.submit([enc()]); await device.queue.onSubmittedWorkDone();
    const ts = []; for (let r = 0; r < reps; r++) { const t0 = performance.now(); device.queue.submit([enc()]); await device.queue.onSubmittedWorkDone(); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b); return ts[0]; // min
  };
  // interleave settings to average out drift
  const settings = [['base RED=0 MV=20', 0, 20], ['RED=8 MV=20', 8, 20], ['RED=16 MV=20', 16, 20], ['MV=10', 0, 10], ['MV=4', 0, 4], ['MV=0 (no matvec)', 0, 0]];
  const acc = settings.map(() => Infinity);
  for (let pass = 0; pass < 3; pass++) for (let s = 0; s < settings.length; s++) { const t = await time(settings[s][1], settings[s][2]); acc[s] = Math.min(acc[s], t); }
  return { labels: settings.map((s) => s[0]), mins: acc, K, CHAIN };
}, { wgsl, inp, exp, K, CHAIN, reps });

await ctx.close(); srv.close();
if (result.err) { console.error('compile error:', result.err); process.exit(1); }
console.log(`\nper-thread RNS sensitivity  (K=${result.K} chain=${result.CHAIN}, min ms, back-to-back x3):\n`);
const muls = result.K * result.CHAIN;
for (let i = 0; i < result.labels.length; i++) console.log(`  ${result.labels[i].padEnd(18)} ${result.mins[i].toFixed(2)} ms  -> ${(result.mins[i] * 1e6 / muls).toFixed(3)} ns/mul`);
const base = result.mins[0];
console.log(`\n  reduction sensitivity: RED=8 is ${((result.mins[1] / base - 1) * 100).toFixed(0)}% , RED=16 is ${((result.mins[2] / base - 1) * 100).toFixed(0)}% over base`);
console.log(`  matvec sensitivity:    MV=10 is ${((result.mins[3] / base - 1) * 100).toFixed(0)}%, MV=0 is ${((result.mins[5] / base - 1) * 100).toFixed(0)}% over base`);
