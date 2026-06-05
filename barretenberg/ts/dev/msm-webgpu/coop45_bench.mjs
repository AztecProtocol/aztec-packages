// 4-threads-per-montmul cooperative RNS (rns_field_coop45.wgsl) — on-device validate + bench
// vs f8, default t=20/w=13 Montgomery basis.
//   node dev/msm-webgpu/coop45_bench.mjs [Kperf=131072] [chain=64] [reps=40]
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { chromium } from 'playwright-core';
import { computeParams, rnsModmul, toMont, T } from './rns_params.mjs';

const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
const HERE = dirname(fileURLToPath(import.meta.url));
const wgslDir = join(HERE, '..', '..', 'src', 'msm_webgpu', 'wgsl');
const Kperf = Number(process.argv[2] ?? 131072);
const CHAIN = Number(process.argv[3] ?? 64);
const reps = Number(process.argv[4] ?? 40);
const modinv = (a, m) => { let [g, x, g2, x2] = [((a % m) + m) % m, 1n, m, 0n]; while (g2) { const q = g / g2;[g, g2] = [g2, g - q * g2];[x, x2] = [x2, x - q * x2]; } return ((x % m) + m) % m; };
const rnd = () => { let r = 0n; for (let i = 0; i < 8; i++) r = (r << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return r % P; };
const KVAL = 4096;
const pairs = []; for (let i = 0; i < KVAL; i++) pairs.push([rnd(), rnd()]);

// coop45 inputs (per-residue [R] form, t=20): 80 u32 in (aM,aN,bM,bN), 40 out (rM,rN)
const p = computeParams();
const rnsIn = []; const rnsExp = [];
for (const [a, b] of pairs) {
  const aM = toMont(a, p.mM), aN = toMont(a, p.mN), bM = toMont(b, p.mM), bN = toMont(b, p.mN);
  rnsIn.push(...aM, ...aN, ...bM, ...bN);
  const { rM, rN } = rnsModmul(aM, aN, bM, bN, p);
  rnsExp.push(...rM, ...rN);
}
const coopWgsl = ['enable subgroups;', readFileSync(join(wgslDir, 'rns', 'rns_constants.wgsl'), 'utf8'), readFileSync(join(wgslDir, 'rns', 'rns_field_coop45.wgsl'), 'utf8')].join('\n');

// f8 baseline
const Wb = 13n, MASKb = (1n << Wb) - 1n;
const N0 = ((1n << Wb) - modinv(P & MASKb, 1n << Wb)) % (1n << Wb);
const P8 = [...Array(8)].map((_, i) => Number((P >> BigInt(32 * i)) & 0xffffffffn));
const Rinv = modinv((1n << 260n) % P, P);
const pack8 = (x) => [...Array(8)].map((_, i) => Number((x >> BigInt(32 * i)) & 0xffffffffn));
const f8In = []; const f8Exp = [];
for (const [a, b] of pairs) { f8In.push(...pack8(a), ...pack8(b)); f8Exp.push(...pack8((a * b * Rinv) % P)); }
const f8Wgsl = (chain) => [`
const WORD_SIZE: u32 = 13u; const MASK: u32 = 8191u; const N0: u32 = ${N0}u;
${P8.map((v, i) => `const P8_${i}: u32 = ${v >>> 0}u;`).join('\n')}
struct BigInt { limbs: array<u32, 20> }
fn unpack256_to_limbs(x: array<u32, 8>) -> BigInt { var r: BigInt; for (var i=0u;i<20u;i++){let bit=i*13u;let w=bit>>5u;let off=bit&31u;var v=x[w]>>off;if(off>19u&&w<7u){v=v|(x[w+1u]<<(32u-off));}r.limbs[i]=v&0x1fffu;} return r; }`,
  readFileSync(join(wgslDir, 'montgomery', 'mont_pro_product_f8_native.template.wgsl'), 'utf8'),
  `@group(0) @binding(0) var<storage, read> ins: array<u32>;
@group(0) @binding(1) var<storage, read_write> outs: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n=arrayLength(&outs)/8u; if(gid.x>=n){return;} let base=gid.x*16u; var a:array<u32,8>; var b:array<u32,8>;
  for(var i=0u;i<8u;i++){a[i]=ins[base+i];b[i]=ins[base+8u+i];} var r=a; for(var k=0u;k<${chain}u;k++){r=montgomery_product_f8(r,b);}
  let o=gid.x*8u; for(var i=0u;i<8u;i++){outs[o+i]=r[i];} }`].join('\n');

const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><html><body></body></html>'); }).listen(0);
const port = srv.address().port;
const ctx = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'] });
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async ({ coopWgsl, f8Wgsl1, f8WgslN, rnsIn, rnsExp, f8In, f8Exp, KVAL, Kperf, CHAIN, reps }) => {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const hasSg = adapter.features.has('subgroups');
  const info = adapter.info ?? {};
  const device = await adapter.requestDevice({ requiredFeatures: hasSg ? ['subgroups'] : [] });
  const out = { info: { vendor: info.vendor, architecture: info.architecture }, hasSg };
  const build = async (code, constants) => {
    const m = device.createShaderModule({ code });
    const ci = await m.getCompilationInfo();
    const errs = ci.messages.filter((x) => x.type === 'error').map((x) => `${x.lineNum}:${x.linePos} ${x.message}`);
    if (errs.length) return { err: errs };
    return { pipe: device.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main', constants } }) };
  };
  const run = (pipe, K, inArr, outU32, lanes) => {
    const inBuf = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inBuf, 0, inArr);
    const outBytes = K * outU32 * 4;
    const outBuf = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    const threads = K * lanes;
    const enc = () => { const e = device.createCommandEncoder(); const pp = e.beginComputePass(); pp.setPipeline(pipe); pp.setBindGroup(0, bg); pp.dispatchWorkgroups(Math.ceil(threads / 64)); pp.end(); return e; };
    return { outBuf, outBytes, enc };
  };
  const validate = async (pipe, inArr, expArr, outU32, lanes) => {
    const K = expArr.length / outU32;
    const x = run(pipe, K, new Uint32Array(inArr), outU32, lanes);
    const stage = device.createBuffer({ size: x.outBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    { const e = x.enc(); e.copyBufferToBuffer(x.outBuf, 0, stage, 0, x.outBytes); device.queue.submit([e.finish()]); }
    await stage.mapAsync(GPUMapMode.READ);
    const got = new Uint32Array(stage.getMappedRange().slice(0)); stage.unmap();
    let mism = 0; const firsts = [];
    for (let i = 0; i < expArr.length; i++) if (got[i] !== expArr[i]) { mism++; if (firsts.length < 5) firsts.push({ i, got: got[i], exp: expArr[i] }); }
    return { mism, firsts };
  };
  const perf = async (pipe, inArr, inU32, outU32, lanes, K) => {
    K = Math.min(K, Math.floor((65535 * 64) / lanes));
    const cin = new Uint32Array(inArr); const pin = new Uint32Array(K * inU32);
    for (let i = 0; i < pin.length; i++) pin[i] = cin[i % cin.length];
    const x = run(pipe, K, pin, outU32, lanes);
    for (let w = 0; w < 5; w++) device.queue.submit([x.enc().finish()]);
    await device.queue.onSubmittedWorkDone();
    const ts = [];
    for (let r = 0; r < reps; r++) { const t0 = performance.now(); device.queue.submit([x.enc().finish()]); await device.queue.onSubmittedWorkDone(); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b); return { median: ts[ts.length >> 1], min: ts[0], K };
  };
  if (!hasSg) { out.coopErr = 'no subgroups'; }
  else {
    const cv = await build(coopWgsl, { CHAIN: 1 });
    if (cv.err) out.coopErr = cv.err;
    else { out.coop = await validate(cv.pipe, rnsIn, rnsExp, 40, 4); const cp = await build(coopWgsl, { CHAIN }); out.coopPerf = cp.err ? null : await perf(cp.pipe, rnsIn, 80, 40, 4, Kperf); out.coopErr = cp.err; }
  }
  const fv = await build(f8Wgsl1, {}); if (fv.err) out.f8Err = fv.err; else { out.f8 = await validate(fv.pipe, f8In, f8Exp, 8, 1); const fp = await build(f8WgslN, {}); out.f8Perf = await perf(fp.pipe, f8In, 16, 8, 1, Kperf); }
  return out;
}, { coopWgsl, f8Wgsl1: f8Wgsl(1), f8WgslN: f8Wgsl(CHAIN), rnsIn, rnsExp, f8In, f8Exp, KVAL, Kperf, CHAIN, reps });

await ctx.close(); srv.close();
console.log(`\nadapter: ${result.info?.vendor}/${result.info?.architecture}  subgroups=${result.hasSg}  K=${Kperf} chain=${CHAIN}`);
if (result.coopErr) console.log('coop ERROR:', JSON.stringify(result.coopErr).slice(0, 400));
const nsmul = (pf) => (pf.median * 1e6) / (pf.K * CHAIN), nm = (pf) => (pf.min * 1e6) / (pf.K * CHAIN);
const show = (name, v, pf) => { if (!pf) return; console.log(`${name.padEnd(6)} mism=${v ? v.mism : '?'}${v && v.mism ? ' ' + JSON.stringify(v.firsts) : ''}  K=${pf.K} median ${pf.median.toFixed(2)}ms -> ${nsmul(pf).toFixed(3)} ns/mul (min ${nm(pf).toFixed(3)})`); };
show('f8', result.f8, result.f8Perf);
show('coop45', result.coop, result.coopPerf);
if (result.coopPerf && result.f8Perf) console.log(`\ncoop45 / f8 = ${(nm(result.coopPerf) / nm(result.f8Perf)).toFixed(2)}x  (min ns/mul)`);
process.exit((result.coop && result.coop.mism === 0) ? 0 : 1);
