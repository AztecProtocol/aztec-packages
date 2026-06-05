// Thermal-stable A/B for cooperative-16 RNS variants. Validates each kernel byte-identical,
// then at every M times f8 and ALL candidate kernels INTERLEAVED within each rep (so any
// thermal drift hits them equally), reporting min-over-reps ns/mul and coop/f8.
//   RNS_T=16 RNS_W=16 RNS_RANK_F=27 node dev/msm-webgpu/coop16_ab.mjs <chain> <reps> <Ms> <kA.wgsl,kB.wgsl,...>
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { chromium } from 'playwright-core';
import { computeParams, rnsModmul, toMont, T, W } from './rns_params.mjs';

if (T !== 16 || W !== 16) { console.error(`run with RNS_T=16 RNS_W=16 RNS_RANK_F=27`); process.exit(2); }
const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
const HERE = dirname(fileURLToPath(import.meta.url));
const wgslDir = join(HERE, '..', '..', 'src', 'msm_webgpu', 'wgsl');
const CHAIN = Number(process.argv[2] ?? 256);
const reps = Number(process.argv[3] ?? 40);
const Ms = (process.argv[4] ?? '64,256,1024').split(',').map(Number);
const kernels = (process.argv[5] ?? 'rns_field_coop16.wgsl').split(',');

const modinv = (a, m) => { let [g, x, g2, x2] = [((a % m) + m) % m, 1n, m, 0n]; while (g2) { const q = g / g2;[g, g2] = [g2, g - q * g2];[x, x2] = [x2, x - q * x2]; } return ((x % m) + m) % m; };
const rnd = () => { let r = 0n; for (let i = 0; i < 8; i++) r = (r << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return r % P; };
const pairs = []; for (let i = 0; i < 4096; i++) pairs.push([rnd(), rnd()]);
const p = computeParams();
const rnsIn = []; const rnsExp = [];
for (const [a, b] of pairs) {
  const aM = toMont(a, p.mM), aN = toMont(a, p.mN), bM = toMont(b, p.mM), bN = toMont(b, p.mN);
  rnsIn.push(...aM, ...aN, ...bM, ...bN);
  const { rM, rN } = rnsModmul(aM, aN, bM, bN, p); rnsExp.push(...rM, ...rN);
}
const constants = readFileSync(join(wgslDir, 'rns', 'rns_constants_16x16.wgsl'), 'utf8');
const coopWgsls = kernels.map((k) => ['enable subgroups;', constants, readFileSync(join(wgslDir, 'rns', k), 'utf8')].join('\n'));
const Wb = 13n, MASKb = (1n << Wb) - 1n;
const N0 = ((1n << Wb) - modinv(P & MASKb, 1n << Wb)) % (1n << Wb);
const P8 = [...Array(8)].map((_, i) => Number((P >> BigInt(32 * i)) & 0xffffffffn));
const Rinv = modinv((1n << 260n) % P, P);
const pack8 = (x) => [...Array(8)].map((_, i) => Number((x >> BigInt(32 * i)) & 0xffffffffn));
const f8In = []; for (const [a, b] of pairs) f8In.push(...pack8(a), ...pack8(b));
const f8Wgsl = `
const WORD_SIZE: u32 = 13u; const MASK: u32 = 8191u; const N0: u32 = ${N0}u;
${P8.map((v, i) => `const P8_${i}: u32 = ${v >>> 0}u;`).join('\n')}
struct BigInt { limbs: array<u32, 20> }
fn unpack256_to_limbs(x: array<u32, 8>) -> BigInt { var r: BigInt; for (var i=0u;i<20u;i++){let bit=i*13u;let w=bit>>5u;let off=bit&31u;var v=x[w]>>off;if(off>19u&&w<7u){v=v|(x[w+1u]<<(32u-off));}r.limbs[i]=v&0x1fffu;} return r; }
${readFileSync(join(wgslDir, 'montgomery', 'mont_pro_product_f8_native.template.wgsl'), 'utf8')}
@group(0) @binding(0) var<storage, read> ins: array<u32>;
@group(0) @binding(1) var<storage, read_write> outs: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n=arrayLength(&outs)/8u; if(gid.x>=n){return;} let base=gid.x*16u; var a:array<u32,8>; var b:array<u32,8>;
  for(var i=0u;i<8u;i++){a[i]=ins[base+i];b[i]=ins[base+8u+i];} var r=a; for(var k=0u;k<${CHAIN}u;k++){r=montgomery_product_f8(r,b);}
  let o=gid.x*8u; for(var i=0u;i<8u;i++){outs[o+i]=r[i];} }`;

const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><html><body></body></html>'); }).listen(0);
const port = srv.address().port;
const ctx = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'] });
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async ({ coopWgsls, f8Wgsl, rnsIn, rnsExp, f8In, Ms, CHAIN, reps, kernels }) => {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter.features.has('subgroups')) return { err: 'no subgroups' };
  const device = await adapter.requestDevice({ requiredFeatures: ['subgroups'] });
  const build = async (code, c) => {
    const m = device.createShaderModule({ code });
    const ci = await m.getCompilationInfo(); const e = ci.messages.filter((x) => x.type === 'error').map((x) => `${x.lineNum}:${x.linePos} ${x.message}`);
    if (e.length) return { err: e };
    return { pipe: device.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main', constants: c } }) };
  };
  const mkRun = (pipe, K, inArr, outU32, lanes) => {
    const inBuf = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inBuf, 0, inArr);
    const outBuf = device.createBuffer({ size: K * outU32 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    return { outBuf, outBytes: K * outU32 * 4, enc: () => { const e = device.createCommandEncoder(); const pp = e.beginComputePass(); pp.setPipeline(pipe); pp.setBindGroup(0, bg); pp.dispatchWorkgroups(Math.ceil((K * lanes) / 64)); pp.end(); return e.finish(); } };
  };
  const sub = async (f) => { device.queue.submit([f]); await device.queue.onSubmittedWorkDone(); };

  // build + validate each coop kernel (chain=1)
  const coopV = [], mism = [];
  const cin = new Uint32Array(rnsIn);
  for (let ki = 0; ki < coopWgsls.length; ki++) {
    const b = await build(coopWgsls[ki], { CHAIN: 1 });
    if (b.err) return { compileError: { kernel: kernels[ki], err: b.err } };
    coopV.push(b.pipe);
    const KV = rnsExp.length / 32;
    const v = mkRun(b.pipe, KV, cin, 32, 16);
    const stage = device.createBuffer({ size: v.outBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    await sub(v.enc());
    { const e = device.createCommandEncoder(); e.copyBufferToBuffer(v.outBuf, 0, stage, 0, v.outBytes); device.queue.submit([e.finish()]); }
    await stage.mapAsync(GPUMapMode.READ);
    const got = new Uint32Array(stage.getMappedRange().slice(0)); stage.unmap();
    let mm = 0; for (let i = 0; i < rnsExp.length; i++) if (got[i] !== rnsExp[i]) mm++;
    mism.push(mm);
  }
  // perf pipelines (chain=CHAIN)
  const f8p = (await build(f8Wgsl, {})).pipe;
  const coopP = [];
  for (const w of coopWgsls) coopP.push((await build(w, { CHAIN })).pipe);

  const fin = new Uint32Array(f8In);
  const rows = [];
  for (const M of Ms) {
    const fi = new Uint32Array(M * 16); for (let i = 0; i < fi.length; i++) fi[i] = fin[i % fin.length];
    const ci = new Uint32Array(M * 64); for (let i = 0; i < ci.length; i++) ci[i] = cin[i % cin.length];
    const fr = mkRun(f8p, M, fi, 8, 1);
    const crs = coopP.map((p) => mkRun(p, M, ci, 32, 16));
    // warmup
    for (let w = 0; w < 3; w++) { await sub(fr.enc()); for (const c of crs) await sub(c.enc()); }
    const fBest = []; const cBest = crs.map(() => Infinity);
    let fb = Infinity;
    for (let r = 0; r < reps; r++) {
      let t = performance.now(); await sub(fr.enc()); fb = Math.min(fb, performance.now() - t);
      for (let c = 0; c < crs.length; c++) { t = performance.now(); await sub(crs[c].enc()); cBest[c] = Math.min(cBest[c], performance.now() - t); }
    }
    rows.push({ M, f8: (fb * 1e6) / (M * CHAIN), coop: cBest.map((b) => (b * 1e6) / (M * CHAIN)) });
  }
  return { mism, rows };
}, { coopWgsls, f8Wgsl, rnsIn, rnsExp, f8In, Ms, CHAIN, reps, kernels });

await ctx.close(); srv.close();
if (result.err || result.compileError) { console.error('ERROR:', JSON.stringify(result.err ?? result.compileError).slice(0, 500)); process.exit(1); }
console.log(`\nchain=${CHAIN} reps=${reps}  validate mism: ${kernels.map((k, i) => `${k.replace('rns_field_', '').replace('.wgsl', '')}=${result.mism[i]}`).join(' ')}\n`);
const names = kernels.map((k) => k.replace('rns_field_', '').replace('.wgsl', ''));
console.log('  M       f8' + names.map((n) => `   ${n}(x)`).join(''));
for (const r of result.rows) {
  console.log(`  ${String(r.M).padEnd(7)} ${r.f8.toFixed(2).padStart(6)}` + r.coop.map((c) => `  ${c.toFixed(2)}(${(c / r.f8).toFixed(2)})`).join(''));
}
process.exit(result.mism.every((m) => m === 0) ? 0 : 1);
