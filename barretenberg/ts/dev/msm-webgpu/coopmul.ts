// Driver for the hand-written WGSL Montgomery-multiply kernels (solo / coop2 /
// coop4 / blocked): byte-identical validation against a bigint Montgomery
// reference, and timing across occupancy. The WGSL is authored in .wgsl files
// and loaded verbatim via `?raw`; CHAIN_K is a WebGPU pipeline-override constant.
// No shader source is assembled in TypeScript.

import soloWgsl from './solo_montmul.wgsl?raw';
import coop2Wgsl from './coop2_montmul.wgsl?raw';
import coop4Wgsl from './coop4_montmul.wgsl?raw';
import blockedWgsl from './blocked_montmul.wgsl?raw';

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const WS = 13n;

function packLimbs20(x: bigint): number[] {
  const o: number[] = [];
  const m = (1n << WS) - 1n;
  let t = ((x % P) + P) % P;
  for (let i = 0; i < 20; i++) { o.push(Number(t & m) >>> 0); t >>= WS; }
  return o;
}
function valueFromLimbs(limbs: number[]): bigint {
  let v = 0n;
  for (let j = 0; j < limbs.length; j++) v += BigInt(limbs[j]) << (WS * BigInt(j));
  return v % P;
}

type Variant = 'solo' | 'coop2' | 'coop4' | 'blocked';

// Lanes (threads) per montmul instance for each variant.
function lanesPer(variant: Variant): number {
  return variant === 'coop2' ? 2 : variant === 'coop4' ? 4 : 1;
}

async function getDevice(): Promise<GPUDevice> {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('[coop] no WebGPU adapter');
  return adapter.requestDevice({ requiredFeatures: adapter.features.has('subgroups') ? (['subgroups'] as GPUFeatureName[]) : [] });
}

async function buildPipeline(device: GPUDevice, variant: Variant, chainK: number): Promise<GPUComputePipeline> {
  const code = variant === 'solo' ? soloWgsl : variant === 'coop2' ? coop2Wgsl : variant === 'coop4' ? coop4Wgsl : blockedWgsl;
  const entryPoint = variant === 'solo' ? 'solo_main' : variant === 'coop2' ? 'coop2_main' : variant === 'coop4' ? 'coop4_main' : 'blocked_main';
  const module = device.createShaderModule({ code, label: `${variant}_montmul` });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(`[${variant}] WGSL compile L${errs[0].lineNum}:${errs[0].linePos} ${errs[0].message}`);
  return device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint, constants: { CHAIN_K: chainK } },
  });
}

export interface CoopValidateResult {
  total: number;
  soloPass: number; coop2Pass: number; coop4Pass: number; blockedPass: number;
  firstSoloFail: string | null; firstCoop2Fail: string | null; firstCoop4Fail: string | null; firstBlockedFail: string | null;
  hiK: number; hiTotal: number; coop2HiPass: number; coop4HiPass: number; firstHiFail: string | null;
  sqK: number; sqTotal: number; coop4SqPass: number; firstSqFail: string | null;
}

// Validates solo/coop2/coop4/blocked vs a bigint Montgomery reference over edge
// cases + deterministic random vectors at K=1 and K=3. Then two closure stresses
// for the 1-bit-redundant (skewed) coop output:
//   - a long chain (one operand skewed, fed back as the multiplier),
//   - a squaring chain (BOTH operands skewed — the EC use case).
// A skewed limb growing past 2^14 would overflow the next montmul's u32
// accumulator and diverge from the canonical reference.
export async function runCoopValidate(): Promise<CoopValidateResult> {
  const Rinv = modinv(1n << (WS * 20n), P);
  const G = 64;
  const vecs: Array<{ a: bigint; b: bigint }> = [
    { a: 0n, b: 0n }, { a: 1n, b: 1n }, { a: P - 1n, b: P - 1n },
    { a: P - 1n, b: 1n }, { a: 0n, b: P - 1n }, { a: 1n, b: P - 1n },
  ];
  let seed = 0x123456789abcdef1n;
  const rnd = (): bigint => {
    let v = 0n;
    for (let k = 0; k < 4; k++) { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); v = (v << 64n) | seed; }
    return v % P;
  };
  while (vecs.length < G) vecs.push({ a: rnd(), b: rnd() });

  const chainRef = (a: bigint, b: bigint, K: number): bigint => {
    let r = a % P;
    for (let k = 0; k < K; k++) r = (((r * (b % P)) % P) * Rinv) % P;
    return r;
  };

  const input = new Uint32Array(G * 40);
  for (let g = 0; g < G; g++) {
    const al = packLimbs20(vecs[g].a);
    const bl = packLimbs20(vecs[g].b);
    for (let j = 0; j < 20; j++) { input[g * 40 + j] = al[j]; input[g * 40 + 20 + j] = bl[j]; }
  }

  const device = await getDevice();
  const runKernel = async (variant: Variant, K: number): Promise<bigint[]> => {
    const pipeline = await buildPipeline(device, variant, K);
    const inBuf = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inBuf, 0, input);
    const outBytes = G * 20 * 4;
    const outBuf = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil((G * lanesPer(variant)) / 64)); pass.end();
    const stage = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    enc.copyBufferToBuffer(outBuf, 0, stage, 0, outBytes);
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    await stage.mapAsync(GPUMapMode.READ, 0, outBytes);
    const all = new Uint32Array(stage.getMappedRange(0, outBytes).slice(0));
    stage.unmap();
    inBuf.destroy(); outBuf.destroy(); stage.destroy();
    const out: bigint[] = [];
    for (let g = 0; g < G; g++) out.push(valueFromLimbs(Array.from(all.subarray(g * 20, g * 20 + 20))));
    return out;
  };

  let total = 0;
  let soloPass = 0; let coop2Pass = 0; let coop4Pass = 0; let blockedPass = 0;
  let firstSoloFail: string | null = null; let firstCoop2Fail: string | null = null; let firstCoop4Fail: string | null = null; let firstBlockedFail: string | null = null;
  for (const K of [1, 3]) {
    const solo = await runKernel('solo', K);
    const coop2 = await runKernel('coop2', K);
    const coop4 = await runKernel('coop4', K);
    const blocked = await runKernel('blocked', K);
    for (let g = 0; g < G; g++) {
      const exp = chainRef(vecs[g].a, vecs[g].b, K);
      total++;
      if (solo[g] === exp) soloPass++; else if (firstSoloFail === null) firstSoloFail = `K=${K} g=${g} exp=${exp} got=${solo[g]}`;
      if (coop2[g] === exp) coop2Pass++; else if (firstCoop2Fail === null) firstCoop2Fail = `K=${K} g=${g} exp=${exp} got=${coop2[g]}`;
      if (coop4[g] === exp) coop4Pass++; else if (firstCoop4Fail === null) firstCoop4Fail = `K=${K} g=${g} exp=${exp} got=${coop4[g]}`;
      if (blocked[g] === exp) blockedPass++; else if (firstBlockedFail === null) firstBlockedFail = `K=${K} g=${g} exp=${exp} got=${blocked[g]}`;
    }
  }

  // Closure stress 1: long chain (the skewed result is fed back as the multiplier).
  const hiK = 257;
  let hiTotal = 0; let coop2HiPass = 0; let coop4HiPass = 0; let firstHiFail: string | null = null;
  {
    const solo = await runKernel('solo', hiK);
    const c2 = await runKernel('coop2', hiK);
    const c4 = await runKernel('coop4', hiK);
    for (let g = 0; g < G; g++) {
      const exp = chainRef(vecs[g].a, vecs[g].b, hiK);
      hiTotal++;
      if (c2[g] === exp && solo[g] === exp) coop2HiPass++; else if (firstHiFail === null) firstHiFail = `coop2 K=${hiK} g=${g} exp=${exp} got=${c2[g]}`;
      if (c4[g] === exp && solo[g] === exp) coop4HiPass++; else if (firstHiFail === null) firstHiFail = `coop4 K=${hiK} g=${g} exp=${exp} got=${c4[g]}`;
    }
  }

  // Closure stress 2 (the EC use case): squaring chain r <- r^2*R^-1, host-chained
  // so the SKEWED limbs feed back into BOTH operands every step (not re-canonicalised).
  const sqK = 129;
  let sqTotal = 0; let coop4SqPass = 0; let firstSqFail: string | null = null;
  {
    const pipe = await buildPipeline(device, 'coop4', 1);
    const inBuf = device.createBuffer({ size: G * 40 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const outBuf = device.createBuffer({ size: G * 20 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const stage = device.createBuffer({ size: G * 20 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    const sqIn = new Uint32Array(G * 40);
    for (let g = 0; g < G; g++) { const al = packLimbs20(vecs[g].a); for (let j = 0; j < 20; j++) { sqIn[g * 40 + j] = al[j]; sqIn[g * 40 + 20 + j] = al[j]; } }
    const ref = vecs.map((v) => ((v.a % P) + P) % P);
    for (let k = 0; k < sqK; k++) {
      device.queue.writeBuffer(inBuf, 0, sqIn);
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil((G * 4) / 64)); pass.end();
      enc.copyBufferToBuffer(outBuf, 0, stage, 0, G * 20 * 4);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      await stage.mapAsync(GPUMapMode.READ, 0, G * 20 * 4);
      const out = new Uint32Array(stage.getMappedRange(0, G * 20 * 4).slice(0));
      stage.unmap();
      for (let g = 0; g < G; g++) {
        for (let j = 0; j < 20; j++) { const v = out[g * 20 + j]; sqIn[g * 40 + j] = v; sqIn[g * 40 + 20 + j] = v; }
        ref[g] = (((ref[g] * ref[g]) % P) * Rinv) % P;
      }
      if (k === sqK - 1) {
        for (let g = 0; g < G; g++) {
          sqTotal++;
          const got = valueFromLimbs(Array.from(out.subarray(g * 20, g * 20 + 20)));
          if (got === ref[g]) coop4SqPass++; else if (firstSqFail === null) firstSqFail = `sqK=${sqK} g=${g} exp=${ref[g]} got=${got}`;
        }
      }
    }
    inBuf.destroy(); outBuf.destroy(); stage.destroy();
  }

  return { total, soloPass, coop2Pass, coop4Pass, blockedPass, firstSoloFail, firstCoop2Fail, firstCoop4Fail, firstBlockedFail, hiK, hiTotal, coop2HiPass, coop4HiPass, firstHiFail, sqK, sqTotal, coop4SqPass, firstSqFail };
}

// Timing: each thread (solo) or lane-group (coop2/coop4) chains CHAIN_K montmuls
// over `groups` instances. solo dispatches `groups` threads; coopN dispatches
// `groups*N`. At fixed groups (same montmul count) the wall ratio is the per-montmul
// latency (starved regime); at fixed thread count it is the per-thread throughput
// (saturated regime).
export async function runMontmulTiming(
  variant: Variant, groups: number, chainK: number, reps: number,
): Promise<{ medianMs: number; minMs: number; walls: number[] }> {
  const device = await getDevice();
  const pipeline = await buildPipeline(device, variant, chainK);
  const al = packLimbs20(0x9e3779b97f4a7c15n);
  const bl = packLimbs20(0x2545f4914f6cdd1dn);
  const input = new Uint32Array(groups * 40);
  for (let g = 0; g < groups; g++) { for (let j = 0; j < 20; j++) { input[g * 40 + j] = al[j]; input[g * 40 + 20 + j] = bl[j]; } }
  const inBuf = device.createBuffer({ size: Math.max(4, input.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inBuf, 0, input);
  const outBuf = device.createBuffer({ size: Math.max(4, groups * 20 * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
  const threads = groups * lanesPer(variant);
  const numWg = Math.ceil(threads / 64);
  const dispatch = (): void => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(numWg); pass.end();
    device.queue.submit([enc.finish()]);
  };
  dispatch(); await device.queue.onSubmittedWorkDone();
  dispatch(); await device.queue.onSubmittedWorkDone();
  const walls: number[] = [];
  for (let r = 0; r < reps; r++) { const t0 = performance.now(); dispatch(); await device.queue.onSubmittedWorkDone(); walls.push(performance.now() - t0); }
  inBuf.destroy(); outBuf.destroy();
  const s = [...walls].sort((a, b) => a - b);
  return { medianMs: s[s.length >> 1], minMs: s[0], walls };
}

function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - (a / b) * y];
}
function modinv(a: bigint, m: bigint): bigint {
  const [g, x] = egcd(((a % m) + m) % m, m);
  if (g !== 1n) throw new Error('no inverse');
  return ((x % m) + m) % m;
}
