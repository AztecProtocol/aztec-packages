// 16-lane cooperative RNS (t=16, 16-bit odd moduli, double-Montgomery) — starved-regime
// harness. Validates byte-identical, then sweeps LOW modmul counts (the thread-starved
// regime) with f8 in the SAME GPU session at each point, min-of-reps.
//   RNS_T=16 RNS_W=16 RNS_RANK_F=27 node dev/msm-webgpu/coop16_bench.mjs [chain=256] [reps=25] [Ms=64,256,1024,4096,16384]
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { chromium } from 'playwright-core';
import { computeParams, rnsModmul, toMont, T, W } from './rns_params.mjs';

if (T !== 16 || W !== 16) { console.error(`run with RNS_T=16 RNS_W=16 RNS_RANK_F=27 (got T=${T} W=${W})`); process.exit(2); }
const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
const HERE = dirname(fileURLToPath(import.meta.url));
const wgslDir = join(HERE, '..', '..', 'src', 'msm_webgpu', 'wgsl');
const CHAIN = Number(process.argv[2] ?? 256);
const reps = Number(process.argv[3] ?? 25);
const Ms = (process.argv[4] ?? '64,256,1024,4096,16384').split(',').map(Number);
const KERNEL = process.argv[5] ?? 'rns_field_coop16.wgsl'; // swap in variants

const modinv = (a, m) => { let [g, x, g2, x2] = [((a % m) + m) % m, 1n, m, 0n]; while (g2) { const q = g / g2;[g, g2] = [g2, g - q * g2];[x, x2] = [x2, x - q * x2]; } return ((x % m) + m) % m; };
const rnd = () => { let r = 0n; for (let i = 0; i < 8; i++) r = (r << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return r % P; };
const KVAL = 4096;
const pairs = []; for (let i = 0; i < KVAL; i++) pairs.push([rnd(), rnd()]);

const p = computeParams();
const rnsIn = []; const rnsExp = [];
for (const [a, b] of pairs) {
  const aM = toMont(a, p.mM), aN = toMont(a, p.mN), bM = toMont(b, p.mM), bN = toMont(b, p.mN);
  rnsIn.push(...aM, ...aN, ...bM, ...bN); // 64 u32/modmul
  const { rM, rN } = rnsModmul(aM, aN, bM, bN, p);
  rnsExp.push(...rM, ...rN); // 32 u32/modmul
}
const coopWgsl = ['enable subgroups;', readFileSync(join(wgslDir, 'rns', 'rns_constants_16x16.wgsl'), 'utf8'), readFileSync(join(wgslDir, 'rns', KERNEL), 'utf8')].join('\n');

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

const result = await page.evaluate(async ({ coopWgsl, f8WgslN, rnsIn, rnsExp, f8In, Ms, CHAIN, reps }) => {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter.features.has('subgroups')) return { err: 'no subgroups' };
  const device = await adapter.requestDevice({ requiredFeatures: ['subgroups'] });
  const build = async (code, constants) => {
    const m = device.createShaderModule({ code });
    const ci = await m.getCompilationInfo();
    const errs = ci.messages.filter((x) => x.type === 'error').map((x) => `${x.lineNum}:${x.linePos} ${x.message}`);
    if (errs.length) return { err: errs };
    return { pipe: device.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main', constants } }) };
  };
  const mkRun = (pipe, K, inArr, outU32, lanes) => {
    const inBuf = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inBuf, 0, inArr);
    const outBytes = K * outU32 * 4;
    const outBuf = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    const enc = () => { const e = device.createCommandEncoder(); const pp = e.beginComputePass(); pp.setPipeline(pipe); pp.setBindGroup(0, bg); pp.dispatchWorkgroups(Math.ceil((K * lanes) / 64)); pp.end(); return e.finish(); };
    return { outBuf, outBytes, enc };
  };
  const timeMin = async (run) => {
    for (let w = 0; w < 3; w++) device.queue.submit([run.enc()]);
    await device.queue.onSubmittedWorkDone();
    let best = Infinity;
    for (let r = 0; r < reps; r++) { const t0 = performance.now(); device.queue.submit([run.enc()]); await device.queue.onSubmittedWorkDone(); best = Math.min(best, performance.now() - t0); }
    return best;
  };

  // validate coop at chain=1
  const cv = await build(coopWgsl, { CHAIN: 1 });
  if (cv.err) return { compileError: cv.err };
  const KV = rnsExp.length / 32;
  const v = mkRun(cv.pipe, KV, new Uint32Array(rnsIn), 32, 16);
  const stage = device.createBuffer({ size: v.outBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  device.queue.submit([v.enc()]);
  { const e = device.createCommandEncoder(); e.copyBufferToBuffer(v.outBuf, 0, stage, 0, v.outBytes); device.queue.submit([e.finish()]); }
  await stage.mapAsync(GPUMapMode.READ);
  const got = new Uint32Array(stage.getMappedRange().slice(0)); stage.unmap();
  let mism = 0; const firsts = [];
  for (let i = 0; i < rnsExp.length; i++) if (got[i] !== rnsExp[i]) { mism++; if (firsts.length < 5) firsts.push({ i, got: got[i], exp: rnsExp[i] }); }

  // starved sweep: at each M, time f8 then coop back-to-back
  const cp = await build(coopWgsl, { CHAIN });
  const fp = await build(f8WgslN, {});
  if (cp.err || fp.err) return { compileError: cp.err ?? fp.err, mism, firsts };
  const rows = [];
  const cin = new Uint32Array(rnsIn); const fin = new Uint32Array(f8In);
  for (const M of Ms) {
    const ci2 = new Uint32Array(M * 64); for (let i = 0; i < ci2.length; i++) ci2[i] = cin[i % cin.length];
    const fi2 = new Uint32Array(M * 16); for (let i = 0; i < fi2.length; i++) fi2[i] = fin[i % fin.length];
    const cr = mkRun(cp.pipe, M, ci2, 32, 16);
    const fr = mkRun(fp.pipe, M, fi2, 8, 1);
    const f8ms = await timeMin(fr);
    const coopms = await timeMin(cr);
    rows.push({ M, f8: (f8ms * 1e6) / (M * CHAIN), coop: (coopms * 1e6) / (M * CHAIN) });
  }
  return { mism, firsts, rows };
}, { coopWgsl, f8WgslN: f8Wgsl(CHAIN), rnsIn, rnsExp, f8In, Ms, CHAIN, reps });

await ctx.close(); srv.close();
if (result.err || result.compileError) { console.error('ERROR:', JSON.stringify(result.err ?? result.compileError).slice(0, 500)); process.exit(1); }
console.log(`coop16 [${KERNEL}] correctness: mism=${result.mism}${result.mism ? ' ' + JSON.stringify(result.firsts) : ''}   chain=${CHAIN} reps=${reps}\n`);
console.log('  M        f8 ns/mul   coop16 ns/mul   coop/f8');
for (const r of result.rows) console.log(`  ${String(r.M).padEnd(8)} ${r.f8.toFixed(3).padStart(9)} ${r.coop.toFixed(3).padStart(14)} ${(r.coop / r.f8).toFixed(2).padStart(9)}x`);
process.exit(result.mism === 0 ? 0 : 1);
