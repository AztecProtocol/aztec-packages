// Self-contained validator for the HANDOFF bundle (no sibling-file deps):
//   - ec_vmpack.wgsl     : complete projective EC add/dbl/madd  (vs noble BN254)
//   - coop2_inverse.wgsl : W=2 cooperative safegcd inverse      (vs bigint modinv)
//   - coop2sg_inverse.wgsl: W=2 subgroup-pipeline inverse       (vs bigint modinv)
// Imports ONLY those three WGSL files + @noble/curves. Drop it next to the .wgsl,
// point an HTML page at it (ec_handoff.html), open with WebGPU; it prints pass
// counts and ends with "[bench] DONE". Field is BN254 Fq (base field), 20x13-bit.

import vmpackWgsl from './ec_vmpack.wgsl?raw';
import coop2InvWgsl from './coop2_inverse.wgsl?raw';
import coop2sgInvWgsl from './coop2sg_inverse.wgsl?raw';
import { bn254 } from '@noble/curves/bn254';

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n; // BN254 Fq
const WS = 13n;
const MASK = (1n << WS) - 1n;
const R = 1n << (WS * 20n); // Montgomery R = 2^260

function packLimbs20(x: bigint): number[] {
  const o: number[] = []; let t = ((x % P) + P) % P;
  for (let i = 0; i < 20; i++) { o.push(Number(t & MASK) >>> 0); t >>= WS; }
  return o;
}
function valueFromLimbs(limbs: number[]): bigint {
  let v = 0n;
  for (let j = 0; j < limbs.length; j++) v += BigInt(limbs[j] & 0x1fff) << (WS * BigInt(j));
  return ((v % P) + P) % P;
}
function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] { if (b === 0n) return [a, 1n, 0n]; const [g, x, y] = egcd(b, a % b); return [g, y, x - (a / b) * y]; }
function modinv(a: bigint): bigint { const [g, x] = egcd(((a % P) + P) % P, P); if (g !== 1n) throw new Error('no inverse'); return ((x % P) + P) % P; }
const toMont = (x: bigint): number[] => packLimbs20((((x % P) + P) % P) * R % P);
const fromMont = (m: bigint): bigint => (m * modinv(R)) % P;

const $log = document.getElementById('log') as HTMLDivElement;
function log(msg: string, cls = ''): void { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = msg; $log.appendChild(d); console.log(msg); }

async function getDevice(): Promise<GPUDevice> {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no WebGPU adapter');
  return adapter.requestDevice({ requiredFeatures: adapter.features.has('subgroups') ? (['subgroups'] as GPUFeatureName[]) : [] });
}

async function pipeline(device: GPUDevice, code: string, entry: string, label: string, extra: Record<string, number> = {}): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ code, label });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(`[${label}] WGSL L${errs[0].lineNum}:${errs[0].linePos} ${errs[0].message}`);
  return device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: entry, constants: { CHAIN_K: 1, ...extra } } });
}

async function run(device: GPUDevice, pl: GPUComputePipeline, input: Uint32Array, outU32: number, threads: number): Promise<Uint32Array> {
  const inBuf = device.createBuffer({ size: Math.max(4, input.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inBuf, 0, input);
  const outBytes = outU32 * 4;
  const outBuf = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bg = device.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
  const stage = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pl); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(threads / 64)); pass.end();
  enc.copyBufferToBuffer(outBuf, 0, stage, 0, outBytes);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await stage.mapAsync(GPUMapMode.READ, 0, outBytes);
  const out = new Uint32Array(stage.getMappedRange(0, outBytes).slice(0));
  stage.unmap(); inBuf.destroy(); outBuf.destroy(); stage.destroy();
  return out;
}

// ---------- cooperative inverse: a^-1 mod p (input/output 20 limbs each, 2 lanes/op) ----------
async function checkInverse(device: GPUDevice): Promise<void> {
  const inputs: bigint[] = [1n, 2n, 3n, 7n, P - 1n, P - 2n, (P - 1n) / 2n, 123456789n];
  for (let k = 0; k < 254; k++) inputs.push((1n << BigInt(k)) % P);      // adversarial: powers of two
  let seed = 0x9e3779b97f4a7c15n;
  const rnd = (): bigint => { let v = 0n; for (let k = 0; k < 4; k++) { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); v = (v << 64n) | seed; } return ((v % P) + P) % P; };
  while (inputs.length < 512) inputs.push(rnd());
  const G = inputs.length;
  const input = new Uint32Array(G * 20);
  for (let g = 0; g < G; g++) { const al = packLimbs20(inputs[g]); for (let j = 0; j < 20; j++) input[g * 20 + j] = al[j]; }
  const ref = inputs.map(modinv);

  for (const [variant, code, entry, extra] of [
    ['coop2', coop2InvWgsl, 'coop2_inv_main', {}],
    ['coop2sg', coop2sgInvWgsl, 'coop2sg_inv_main', { DBG: 0 }],
  ] as const) {
    const pl = await pipeline(device, code, entry, `${variant}_inv`, extra);
    const out = await run(device, pl, input, G * 20, G * 2);
    let pass = 0; let fail: string | null = null;
    for (let g = 0; g < G; g++) {
      const got = valueFromLimbs(Array.from(out.subarray(g * 20, g * 20 + 20)));
      if (got === ref[g]) pass++; else if (fail === null) fail = `a=${inputs[g]} exp=${ref[g]} got=${got}`;
    }
    log(`[bench]   inverse ${variant}: ${pass}/${G}${fail ? ` FAIL(${fail})` : ''}`, pass === G ? 'ok' : 'err');
  }
}

// ---------- vmpack complete EC add/dbl/madd (homogeneous projective, vs noble) ----------
async function checkVmpack(device: GPUDevice): Promise<void> {
  const PP = bn254.G1.ProjectivePoint; const ORDER = bn254.G1.CURVE.n;
  let seed = 0x123456789abcdef1n;
  const rnd = (): bigint => { let v = 0n; for (let k = 0; k < 4; k++) { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); v = (v << 64n) | seed; } return v; };
  const sc = (): bigint => { const s = rnd() % ORDER; return s === 0n ? 1n : s; };
  const rz = (): bigint => { const z = rnd() % P; return z === 0n ? 1n : z; };
  const proj = (x: bigint, y: bigint, z: bigint) => ({ X: (x * z) % P, Y: (y * z) % P, Z: z }); // homogeneous
  const check = (out: Uint32Array, off: number, xr: bigint, yr: bigint): boolean => {
    const X = fromMont(valueFromLimbs(Array.from(out.subarray(off, off + 20))));
    const Y = fromMont(valueFromLimbs(Array.from(out.subarray(off + 20, off + 40))));
    const Z = fromMont(valueFromLimbs(Array.from(out.subarray(off + 40, off + 60))));
    if (Z === 0n) return false;
    return X === (xr * Z) % P && Y === (yr * Z) % P;
  };
  const G = 64;
  for (const op of ['add', 'dbl', 'madd'] as const) {
    const stride = op === 'add' ? 120 : op === 'madd' ? 100 : 60;
    const input = new Uint32Array(G * stride);
    const refs: Array<{ x: bigint; y: bigint }> = [];
    for (let g = 0; g < G; g++) {
      const k1 = sc(); let k2 = sc();
      if (op !== 'dbl' && g < 16) k2 = k1; // doubling-via-add: complete formula must handle P==Q
      const p1 = PP.BASE.multiply(k1); const a1 = p1.toAffine();
      const J1 = proj(a1.x, a1.y, rz());
      const x1 = toMont(J1.X), y1 = toMont(J1.Y), z1 = toMont(J1.Z);
      const b = g * stride;
      for (let j = 0; j < 20; j++) { input[b + j] = x1[j]; input[b + 20 + j] = y1[j]; input[b + 40 + j] = z1[j]; }
      let r;
      if (op === 'dbl') { r = p1.double().toAffine(); }
      else {
        const p2 = PP.BASE.multiply(k2); const a2 = p2.toAffine();
        if (op === 'add') { const J2 = proj(a2.x, a2.y, rz()); const x2 = toMont(J2.X), y2 = toMont(J2.Y), z2 = toMont(J2.Z); for (let j = 0; j < 20; j++) { input[b + 60 + j] = x2[j]; input[b + 80 + j] = y2[j]; input[b + 100 + j] = z2[j]; } }
        else { const x2 = toMont(a2.x), y2 = toMont(a2.y); for (let j = 0; j < 20; j++) { input[b + 60 + j] = x2[j]; input[b + 80 + j] = y2[j]; } } // madd: P2 affine, Z2=1
        r = p1.add(p2).toAffine();
      }
      refs.push({ x: r.x, y: r.y });
    }
    const pl = await pipeline(device, vmpackWgsl, `${op}_main`, `vmpack_${op}`);
    const out = await run(device, pl, input, G * 60, G);
    let pass = 0; let fail: string | null = null;
    for (let g = 0; g < G; g++) { if (check(out, g * 60, refs[g].x, refs[g].y)) pass++; else if (fail === null) fail = `${op} g=${g}`; }
    log(`[bench]   vmpack ${op}: ${pass}/${G}${fail ? ` FAIL(${fail})` : ''}`, pass === G ? 'ok' : 'err');
  }
}

async function main(): Promise<void> {
  try {
    if (!('gpu' in navigator)) { log('state=error no WebGPU', 'err'); return; }
    const device = await getDevice();
    log('[bench] === coop2 / coop2sg inverse vs bigint modinv ===');
    await checkInverse(device);
    log('[bench] === ec_vmpack complete add/dbl/madd vs noble ===');
    await checkVmpack(device);
    log('[bench] DONE');
  } catch (e) {
    log('state=error ' + (e as Error).message + '\n' + ((e as Error).stack ?? ''), 'err');
  }
}
void main();
