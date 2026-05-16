/// <reference types="@webgpu/types" />
// Field-mul micro-benchmark page. Mounted standalone (no SRS, no MSM
// pipeline). Reads `?path=u32|f32&n=N&k=K&validate-n=N&reps=R`, generates
// random BN254 base-field pairs, runs `k` chained Montgomery products
// per thread, validates the first `validate-n` outputs against a host
// BigInt reference, and reports timing via `window.__bench`.
//
// Safety: `k` is capped at 100, `n` at 2^23, both checked before any
// dispatch. The only loop in either shader is the k-loop with this
// bound (see field_mul_bench_*.template.wgsl).

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';

type Path = 'u32' | 'f32';
interface SampleSummary {
  reps: number;
  msSamples: number[];
  msMedian: number;
  msMin: number;
  msMax: number;
  multsPerSec: number;
}
interface PathResult {
  path: Path;
  validateOk: boolean;
  mismatches: string[];
  timing: SampleSummary | null;
}
interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: {
    path: Path | 'both';
    n: number;
    k: number;
    validateN: number;
    reps: number;
  } | null;
  results: PathResult[];
  error: string | null;
  log: string[];
}

const benchState: BenchState = {
  state: 'boot',
  params: null,
  results: [],
  error: null,
  log: [],
};
(window as unknown as { __bench: BenchState }).__bench = benchState;

const $log = document.getElementById('log') as HTMLDivElement;
function log(level: 'info' | 'ok' | 'err' | 'warn', msg: string) {
  const cls = level === 'ok' ? 'ok' : level === 'err' ? 'err' : level === 'warn' ? 'warn' : '';
  const span = document.createElement('div');
  span.className = cls;
  span.textContent = msg;
  $log.appendChild(span);
  benchState.log.push(`[${level}] ${msg}`);
  console.log(`[bench-field-mul] ${msg}`);
}

const N_MAX = 1 << 23;
const K_MAX = 100;

// Default 22-bit-limb f32 layout (12 limbs × 22 bits). Variant-specific
// overrides live in getF32LimbConfig() below.
const NUM_LIMBS_F32_DEFAULT = 12;
const WORD_SIZE_F32_DEFAULT = 22;
const NUM_LIMBS_U32 = 20;
const WORD_SIZE_U32 = 13;

const W_U32 = 1n << BigInt(WORD_SIZE_U32);
const MASK_U32 = W_U32 - 1n;

// Mutable globals: filled in once we know the variant from the URL. Both
// the packing helpers and the post-result validation read these.
let NUM_LIMBS_F32 = NUM_LIMBS_F32_DEFAULT;
let WORD_SIZE_F32 = WORD_SIZE_F32_DEFAULT;
let W_F32 = 1n << BigInt(WORD_SIZE_F32);
let MASK_F32 = W_F32 - 1n;

function setF32LimbConfig(variant: string) {
  if (variant === 'sos3cf_19' || variant === 'sos3uv3cf_19') {
    NUM_LIMBS_F32 = 14;
    WORD_SIZE_F32 = 19;
  } else {
    NUM_LIMBS_F32 = NUM_LIMBS_F32_DEFAULT;
    WORD_SIZE_F32 = WORD_SIZE_F32_DEFAULT;
  }
  W_F32 = 1n << BigInt(WORD_SIZE_F32);
  MASK_F32 = W_F32 - 1n;
}

function bigintToLimbsU32(v: bigint): number[] {
  const limbs: number[] = new Array(NUM_LIMBS_U32);
  let x = v;
  for (let i = 0; i < NUM_LIMBS_U32; i++) {
    limbs[i] = Number(x & MASK_U32);
    x >>= BigInt(WORD_SIZE_U32);
  }
  return limbs;
}
function limbsU32ToBigint(limbs: ArrayLike<number>): bigint {
  let v = 0n;
  for (let i = NUM_LIMBS_U32 - 1; i >= 0; i--) {
    v = (v << BigInt(WORD_SIZE_U32)) | BigInt(limbs[i] >>> 0);
  }
  return v;
}
function bigintToLimbsF32(v: bigint): number[] {
  const limbs: number[] = new Array(NUM_LIMBS_F32);
  let x = v;
  for (let i = 0; i < NUM_LIMBS_F32; i++) {
    limbs[i] = Number(x & MASK_F32);
    x >>= BigInt(WORD_SIZE_F32);
  }
  return limbs;
}
function limbsF32ToBigint(limbs: ArrayLike<number>): bigint {
  let v = 0n;
  for (let i = NUM_LIMBS_F32 - 1; i >= 0; i--) {
    v = (v << BigInt(WORD_SIZE_F32)) | BigInt(Math.round(limbs[i]));
  }
  return v;
}

// Seeded LCG (Numerical Recipes constants) for reproducible pair gen.
// Math.random() is fine for input pairs (we're not testing RNG quality),
// but a deterministic stream makes failures repeatable.
function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomBelow(p: bigint, rng: () => number): bigint {
  const bitlen = p.toString(2).length;
  const byteLen = Math.ceil(bitlen / 8);
  while (true) {
    let v = 0n;
    for (let i = 0; i < byteLen; i++) {
      v = (v << 8n) | BigInt(rng() & 0xff);
    }
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v < p) return v;
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Host BigInt reference for `k` chained Mont products. Inputs are in
// Mont form (x_m = x * R mod p). Each Mont multiply returns
// (x_m * y_m * R^-1) mod p. After `k` rounds starting from a_m, the
// result is a_m * b_m^k * (R^-1)^k mod p (in Mont form).
function chainedMontReference(
  aMont: bigint,
  bMont: bigint,
  k: number,
  Rinv: bigint,
  p: bigint,
): bigint {
  let acc = aMont;
  for (let i = 0; i < k; i++) {
    acc = (acc * bMont * Rinv) % p;
  }
  return acc;
}

async function createPipeline(
  device: GPUDevice,
  code: string,
  cacheKey: string,
): Promise<{ pipeline: GPUComputePipeline; layout: GPUBindGroupLayout }> {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  let hasError = false;
  for (const msg of info.messages) {
    const line = `[shader ${cacheKey}] ${msg.type}: ${msg.message} (line ${msg.lineNum}, col ${msg.linePos})`;
    if (msg.type === 'error') {
      console.error(line);
      hasError = true;
    } else {
      console.warn(line);
    }
  }
  if (hasError) {
    throw new Error(`WGSL compile failed for ${cacheKey}`);
  }
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const pipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
  return { pipeline, layout };
}

async function runPath(
  device: GPUDevice,
  sm: ShaderManager,
  path: Path,
  n: number,
  k: number,
  validateN: number,
  reps: number,
): Promise<PathResult> {
  // Determine variant FIRST — this controls the f32 limb layout (some
  // variants like sos3cf_19 use 14×19-bit instead of the 12×22-bit default).
  // All packing/unpacking below reads NUM_LIMBS_F32 / WORD_SIZE_F32, which
  // setF32LimbConfig updates in place.
  const qp = new URLSearchParams(window.location.search);
  const variant = (qp.get('variant') ?? 'unrolled') as
    | 'cios'
    | 'sos'
    | 'sos3'
    | 'sos3u'
    | 'sos3uv2'
    | 'sos3uv2nc'
    | 'sos3uv3'
    | 'sos3u32'
    | 'sos3wasm'
    | 'sos3wasm_v2'
    | 'sos3uv3_mixed'
    | 'sos3wasm_v3'
    | 'sos3cf_19'
    | 'sos3uv3cf_19'
    | 'karat'
    | 'v2'
    | 'unrolled'
    | 'unrolled2'
    | 'kara'
    | 'emmart';
  setF32LimbConfig(variant);

  log('info', `path=${path}: building pairs (n=${n}, k=${k}, validate-n=${validateN}, reps=${reps})`);
  const p = BN254_CURVE_CONFIG.baseFieldModulus;
  const wordSize = path === 'u32' ? WORD_SIZE_U32 : WORD_SIZE_F32;
  const numLimbs = path === 'u32' ? NUM_LIMBS_U32 : NUM_LIMBS_F32;
  const params = compute_misc_params(p, wordSize);
  if (params.num_words !== numLimbs) {
    throw new Error(`expected num_words=${numLimbs} for path=${path}, got ${params.num_words}`);
  }
  const R = params.r;
  const Rinv = params.rinv;
  if ((R * Rinv) % p !== 1n) {
    throw new Error(`R * Rinv mod p != 1 for path=${path}`);
  }

  // Generate random a_canonical, b_canonical pairs (CPU side BigInts).
  const rng = makeRng(0xc0ffee + (path === 'u32' ? 0 : 1));
  const aCanonical: bigint[] = new Array(n);
  const bCanonical: bigint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    aCanonical[i] = randomBelow(p, rng);
    bCanonical[i] = randomBelow(p, rng);
  }

  // Encode in the appropriate Mont ring.
  const aMont: bigint[] = aCanonical.map(x => (x * R) % p);
  const bMont: bigint[] = bCanonical.map(x => (x * R) % p);

  // CPU reference for the first validate-n pairs.
  log('info', `path=${path}: computing host reference for ${validateN} pairs`);
  const expected: bigint[] = new Array(validateN);
  for (let i = 0; i < validateN; i++) {
    expected[i] = chainedMontReference(aMont[i], bMont[i], k, Rinv, p);
  }

  // Pack separate `xs` / `ys` buffers — one BigInt per thread per buffer.
  const bytesPerLimbArray = numLimbs * 4;
  const xsBytes = new ArrayBuffer(n * bytesPerLimbArray);
  const ysBytes = new ArrayBuffer(n * bytesPerLimbArray);

  if (path === 'u32') {
    const xv = new Uint32Array(xsBytes);
    const yv = new Uint32Array(ysBytes);
    for (let i = 0; i < n; i++) {
      const aLimbs = bigintToLimbsU32(aMont[i]);
      const bLimbs = bigintToLimbsU32(bMont[i]);
      const off = i * NUM_LIMBS_U32;
      for (let j = 0; j < NUM_LIMBS_U32; j++) xv[off + j] = aLimbs[j];
      for (let j = 0; j < NUM_LIMBS_U32; j++) yv[off + j] = bLimbs[j];
    }
  } else {
    const xv = new Float32Array(xsBytes);
    const yv = new Float32Array(ysBytes);
    for (let i = 0; i < n; i++) {
      const aLimbs = bigintToLimbsF32(aMont[i]);
      const bLimbs = bigintToLimbsF32(bMont[i]);
      const off = i * NUM_LIMBS_F32;
      for (let j = 0; j < NUM_LIMBS_F32; j++) xv[off + j] = aLimbs[j];
      for (let j = 0; j < NUM_LIMBS_F32; j++) yv[off + j] = bLimbs[j];
    }
  }

  const WORKGROUP_SIZE = 64;
  // Allow the URL `?variant=karat` to switch the u32 mont to Karatsuba+Yuval.
  const u32Variant: 'cios' | 'karat' = variant === ('karat' as string) ? 'karat' : 'cios';
  const code =
    path === 'u32'
      ? sm.gen_field_mul_bench_u32_shader(WORKGROUP_SIZE, u32Variant)
      : sm.gen_field_mul_bench_f32_shader(WORKGROUP_SIZE, variant);
  const cacheKey = `field-mul-bench-${path}-wg${WORKGROUP_SIZE}`;
  log('info', `path=${path}: compiling shader (${code.length} chars)`);
  // Stash the rendered shader on window so external tooling can dump it
  // for post-mortem analysis when validation fails.
  (window as unknown as Record<string, unknown>)[`__shader_${path}`] = code;
  const { pipeline, layout } = await createPipeline(device, code, cacheKey);

  // Buffers.
  const xsBuf = device.createBuffer({
    size: xsBytes.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(xsBuf, 0, xsBytes);
  const ysBuf = device.createBuffer({
    size: ysBytes.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ysBuf, 0, ysBytes);
  const outBytes = n * numLimbs * 4;
  const outBuf = device.createBuffer({
    size: outBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const uniformBytes = new ArrayBuffer(16);
  const uniformView = new Uint32Array(uniformBytes);
  uniformView[0] = n;
  uniformView[1] = k;
  const uniformBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuf, 0, uniformBytes);

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xsBuf } },
      { binding: 1, resource: { buffer: ysBuf } },
      { binding: 2, resource: { buffer: outBuf } },
      { binding: 3, resource: { buffer: uniformBuf } },
    ],
  });

  const numWorkgroups = Math.ceil(n / WORKGROUP_SIZE);
  log('info', `path=${path}: dispatching ${numWorkgroups} workgroups of ${WORKGROUP_SIZE} threads each (${n} threads total)`);

  // Warmup pass — issued and awaited before the timed reps.
  {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numWorkgroups, 1, 1);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  log('info', `path=${path}: warmup OK`);

  // Validation pass — read back outputs.
  const stagingBuf = device.createBuffer({
    size: outBytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numWorkgroups, 1, 1);
    pass.end();
    encoder.copyBufferToBuffer(outBuf, 0, stagingBuf, 0, outBytes);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await stagingBuf.mapAsync(GPUMapMode.READ);
  }
  const outBytesCopy = stagingBuf.getMappedRange(0, outBytes).slice(0);
  stagingBuf.unmap();
  stagingBuf.destroy();

  // Compare first validate-n outputs.
  let mismatches: string[] = [];
  let validateOk = true;
  if (path === 'u32') {
    const outU32 = new Uint32Array(outBytesCopy);
    for (let i = 0; i < validateN; i++) {
      const limbs = outU32.subarray(i * NUM_LIMBS_U32, (i + 1) * NUM_LIMBS_U32);
      const got = limbsU32ToBigint(limbs);
      if (got !== expected[i]) {
        validateOk = false;
        if (mismatches.length < 5) {
          mismatches.push(
            `pair[${i}]: a_can=0x${aCanonical[i].toString(16)} b_can=0x${bCanonical[i].toString(16)}\n` +
              `  expected: 0x${expected[i].toString(16)}\n` +
              `  actual:   0x${got.toString(16)}\n` +
              `  expected_limbs: [${bigintToLimbsU32(expected[i]).join(', ')}]\n` +
              `  actual_limbs:   [${Array.from(limbs).join(', ')}]`,
          );
        }
      }
    }
  } else {
    const outF32 = new Float32Array(outBytesCopy);
    for (let i = 0; i < validateN; i++) {
      const limbs = outF32.subarray(i * NUM_LIMBS_F32, (i + 1) * NUM_LIMBS_F32);
      const got = limbsF32ToBigint(limbs);
      if (got !== expected[i]) {
        validateOk = false;
        if (mismatches.length < 5) {
          mismatches.push(
            `pair[${i}]: a_can=0x${aCanonical[i].toString(16)} b_can=0x${bCanonical[i].toString(16)}\n` +
              `  expected: 0x${expected[i].toString(16)}\n` +
              `  actual:   0x${got.toString(16)}\n` +
              `  expected_limbs: [${bigintToLimbsF32(expected[i]).join(', ')}]\n` +
              `  actual_limbs:   [${Array.from(limbs).map(x => Math.round(x)).join(', ')}]`,
          );
        }
      }
    }
  }

  if (!validateOk) {
    log('err', `path=${path}: VALIDATION FAILED (${mismatches.length}/${validateN} mismatches shown of total)`);
    for (const m of mismatches) log('err', m);
    // Diagnostic dump: log the first pair's input limbs as they were
    // packed into the GPU buffer. If all outputs are zero this confirms
    // the shader is not writing to the output buffer (vs. writing the
    // wrong value).
    const inLimbsA: number[] = [];
    const inLimbsB: number[] = [];
    if (path === 'u32') {
      const xv = new Uint32Array(xsBytes, 0, NUM_LIMBS_U32);
      const yv = new Uint32Array(ysBytes, 0, NUM_LIMBS_U32);
      for (let j = 0; j < NUM_LIMBS_U32; j++) inLimbsA.push(xv[j]);
      for (let j = 0; j < NUM_LIMBS_U32; j++) inLimbsB.push(yv[j]);
    } else {
      const xv = new Float32Array(xsBytes, 0, NUM_LIMBS_F32);
      const yv = new Float32Array(ysBytes, 0, NUM_LIMBS_F32);
      for (let j = 0; j < NUM_LIMBS_F32; j++) inLimbsA.push(xv[j]);
      for (let j = 0; j < NUM_LIMBS_F32; j++) inLimbsB.push(yv[j]);
    }
    log('err', `path=${path}: pair[0] input limbs as packed: a=[${inLimbsA.join(', ')}]  b=[${inLimbsB.join(', ')}]`);
    log('err', `path=${path}: pair[0] input limbs expected from canonical: a=[${(path === 'u32' ? bigintToLimbsU32(aMont[0]) : bigintToLimbsF32(aMont[0])).join(', ')}]`);
    xsBuf.destroy();
    ysBuf.destroy();
    outBuf.destroy();
    uniformBuf.destroy();
    return { path, validateOk: false, mismatches, timing: null };
  }
  log('ok', `path=${path}: VALIDATION OK (${validateN} pairs)`);

  // Timed reps. Each rep = one dispatch + queue.onSubmittedWorkDone wait.
  const msSamples: number[] = [];
  for (let rep = 0; rep < reps; rep++) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numWorkgroups, 1, 1);
    pass.end();
    const t0 = performance.now();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const t1 = performance.now();
    msSamples.push(t1 - t0);
  }
  const msMed = median(msSamples);
  const msMin = Math.min(...msSamples);
  const msMax = Math.max(...msSamples);
  const totalMults = n * k;
  const multsPerSec = totalMults / (msMed / 1000);
  log(
    'ok',
    `path=${path}: timing reps=${reps} median=${msMed.toFixed(3)}ms min=${msMin.toFixed(3)}ms max=${msMax.toFixed(3)}ms mults/s=${multsPerSec.toExponential(3)} (n*k=${totalMults.toLocaleString()})`,
  );

  xsBuf.destroy();
  ysBuf.destroy();
  outBuf.destroy();
  uniformBuf.destroy();

  return {
    path,
    validateOk: true,
    mismatches: [],
    timing: { reps, msSamples, msMedian: msMed, msMin, msMax, multsPerSec },
  };
}

function parseParams(): {
  path: Path | 'both';
  n: number;
  k: number;
  validateN: number;
  reps: number;
  debug: string | null;
} {
  const qp = new URLSearchParams(window.location.search);
  const pathStr = qp.get('path') ?? 'both';
  if (pathStr !== 'u32' && pathStr !== 'f32' && pathStr !== 'both') {
    throw new Error(`?path must be u32|f32|both, got ${pathStr}`);
  }
  const n = parseInt(qp.get('n') ?? '64', 10);
  const k = parseInt(qp.get('k') ?? '1', 10);
  const validateN = parseInt(qp.get('validate-n') ?? String(Math.min(64, n)), 10);
  const reps = parseInt(qp.get('reps') ?? '3', 10);
  const debug = qp.get('debug');
  if (!Number.isFinite(n) || n <= 0 || n > N_MAX) {
    throw new Error(`?n must be in (0, ${N_MAX}], got ${qp.get('n')}`);
  }
  if (!Number.isFinite(k) || k <= 0 || k > K_MAX) {
    throw new Error(`?k must be in (0, ${K_MAX}], got ${qp.get('k')}`);
  }
  if (!Number.isFinite(validateN) || validateN < 0 || validateN > n) {
    throw new Error(`?validate-n must be in [0, n], got ${qp.get('validate-n')}`);
  }
  if (!Number.isFinite(reps) || reps <= 0 || reps > 100) {
    throw new Error(`?reps must be in (0, 100], got ${qp.get('reps')}`);
  }
  return { path: pathStr as Path | 'both', n, k, validateN, reps, debug };
}

async function runDebugMulhiloF32(device: GPUDevice, _sm: ShaderManager): Promise<void> {
  log('info', `[debug=mulhilo] testing mulhilo on hard-coded values`);
  // Test cases: hand-picked products that exercise specific bit patterns.
  const cases = [
    { a: 1443728, b: 418697 },
    { a: 1, b: 1 },
    { a: 8388607, b: 8388607 },
    { a: 4194304, b: 2 },
    { a: 100, b: 200 },
  ];
  const inputBytes = new ArrayBuffer(cases.length * 8);
  const iv = new Float32Array(inputBytes);
  for (let i = 0; i < cases.length; i++) {
    iv[i * 2] = cases[i].a;
    iv[i * 2 + 1] = cases[i].b;
  }
  const outBytes = cases.length * 2 * 4;
  const inBuf = device.createBuffer({ size: inputBytes.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inBuf, 0, inputBytes);
  const outBuf = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });

  // Just inline the mulhilo constants and function directly.
  const code = `
const BIAS: f32 = 70368744177664.0;
const W: f32    = 8388608.0;
const W_INV: f32 = 1.1920928955078125e-7;

fn mulhilo(a: f32, b: f32) -> vec2<f32> {
    let q   = fma(a, b, BIAS) - BIAS;
    let lo0 = fma(a, b, -q);
    let underflow = step(lo0, -0.5);
    let hi = q * W_INV - underflow;
    let lo = lo0 + underflow * W;
    return vec2<f32>(hi, lo);
}

@group(0) @binding(0) var<storage, read> ins: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> outs: array<vec2<f32>>;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = arrayLength(&ins);
    if (gid.x >= n) { return; }
    let v = ins[gid.x];
    outs[gid.x] = mulhilo(v.x, v.y);
}
`;
  const module = device.createShaderModule({ code });
  await module.getCompilationInfo();
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
  const bg = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: inBuf } },
      { binding: 1, resource: { buffer: outBuf } },
    ],
  });
  const enc = device.createCommandEncoder();
  const ps = enc.beginComputePass();
  ps.setPipeline(pipeline);
  ps.setBindGroup(0, bg);
  ps.dispatchWorkgroups(cases.length, 1, 1);
  ps.end();
  const stagingBuf = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  enc.copyBufferToBuffer(outBuf, 0, stagingBuf, 0, outBytes);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await stagingBuf.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(stagingBuf.getMappedRange().slice(0));
  stagingBuf.unmap();
  stagingBuf.destroy();
  inBuf.destroy();
  outBuf.destroy();

  for (let i = 0; i < cases.length; i++) {
    const { a, b } = cases[i];
    const prod = BigInt(a) * BigInt(b);
    const W = 8388608n;
    const expHi = prod / W;
    const expLo = prod % W;
    const gotHi = Math.round(out[i * 2]);
    const gotLo = Math.round(out[i * 2 + 1]);
    const ok = (gotHi === Number(expHi)) && (gotLo === Number(expLo));
    log(ok ? 'ok' : 'err', `[debug] mulhilo(${a}, ${b}) = (hi=${gotHi}, lo=${gotLo}); expected (hi=${expHi}, lo=${expLo}) ${ok ? 'OK' : 'WRONG'}`);
  }
}

async function runDebugF32(device: GPUDevice, sm: ShaderManager, debugTag: string): Promise<void> {
  log('info', `[debug=${debugTag}] running f32 Mont debug shader`);
  const p = BN254_CURVE_CONFIG.baseFieldModulus;
  const params_f32 = compute_misc_params(p, WORD_SIZE_F32);
  const R = params_f32.r;
  const Rinv = params_f32.rinv;
  log('info', `[debug] n0_f32=${params_f32.n0.toString()} num_words=${params_f32.num_words}`);

  // Pair: a = 1, b = 1 (canonical). aMont = R mod p, bMont = R mod p.
  // Mont(R, R, R^-1) = R^2 * R^-1 = R = aMont. So expected output limbs == aMont limbs.
  const aMont = R % p;
  const bMont = R % p;
  const aLimbs = bigintToLimbsF32(aMont);
  const bLimbs = bigintToLimbsF32(bMont);
  const xsBytes = new ArrayBuffer(NUM_LIMBS_F32 * 4);
  const ysBytes = new ArrayBuffer(NUM_LIMBS_F32 * 4);
  const xv = new Float32Array(xsBytes);
  const yv = new Float32Array(ysBytes);
  for (let j = 0; j < NUM_LIMBS_F32; j++) xv[j] = aLimbs[j];
  for (let j = 0; j < NUM_LIMBS_F32; j++) yv[j] = bLimbs[j];

  // Capture intermediates: 64 f32 slots.
  // [0..11]  = s[0..11] AFTER i=0 outer iter
  // [12..15] = (xy0_lo, xy0_hi, sum0, qi) at i=0
  // [16..19] = (qp0_lo, qp0_hi, c_lo_init, c_hi_init) at i=0
  // [20..31] = output limbs (after full montgomery_product)
  // [32..33] = direct mulhilo(1443728.0, 418697.0).{x,y}
  // [34..35] = direct mulhilo(sum0_s.y, N0).{x,y}
  // [36..39] = (sum0_s.x, sum0_s.y, N0 echo, x.limbs[0] echo)
  // [40..41] = bias_split_f32(1443728.0).{x,y}
  // [42..43] = bias_split_f32(sum0).{x,y}  // sum0 is the actual variable
  // [44..47] = (bias_split_f32(rv).{x,y}, bias_split_f32(xy0.y).{x,y})
  // [48..63] = j=11 intermediates (xyj.{x,y}, qpj.{x,y}, t1, t1_s.{x,y}, t2, t2_s.{x,y}, t3, t3_s.{x,y}, c_lo_before, c_lo_after)
  const DEBUG_SLOTS = 64;
  const xsBuf = device.createBuffer({
    size: xsBytes.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(xsBuf, 0, xsBytes);
  const ysBuf = device.createBuffer({
    size: ysBytes.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ysBuf, 0, ysBytes);
  const dbgBuf = device.createBuffer({
    size: DEBUG_SLOTS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  // Use ShaderManager's helper bundle (mulhilo + bigint_f32 + montgomery_product_f32).
  const helpers = sm.gen_montgomery_product_f32_shader();
  // Append a debug entry point that mirrors the Mont algorithm but captures
  // per-position state for i=0 and finally writes the full Mont output.
  const debugEntry = `
@group(0) @binding(0) var<storage, read> xs: array<BigIntF32>;
@group(0) @binding(1) var<storage, read> ys: array<BigIntF32>;
@group(0) @binding(2) var<storage, read_write> dbg: array<f32, ${DEBUG_SLOTS}>;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x != 0u) { return; }
    var x = xs[0];
    var y = ys[0];

    // Run Mont. Capture intermediates by inlining the first outer iteration.
    var s: BigIntF32;
    for (var k = 0u; k < NUM_LIMBS; k ++) { s.limbs[k] = 0.0; }
    var pp = get_p_f32();

    // i = 0
    let xy0 = mulhilo(x.limbs[0], y.limbs[0]);
    let sum0 = s.limbs[0] + xy0.y;
    let sum0_s = bias_split_f32(sum0);
    let qi = mulhilo(sum0_s.y, N0).y;
    let qp0 = mulhilo(qi, pp.limbs[0]);
    let lo_cancel = sum0_s.y + qp0.y;
    let c_small = lo_cancel * W_INV + sum0_s.x;
    let hi_pair = xy0.x + qp0.x;
    let carry_full = hi_pair + c_small;
    let carry_s = bias_split_f32(carry_full);
    var c_hi = carry_s.x;
    var c_lo = carry_s.y;

    dbg[12] = xy0.y;
    dbg[13] = xy0.x;
    dbg[14] = sum0;
    dbg[15] = qi;
    dbg[16] = qp0.y;
    dbg[17] = qp0.x;
    dbg[18] = c_lo;
    dbg[19] = c_hi;

    // Direct test: mulhilo(1443728.0, 418697.0).y. Should be 1489936.
    let direct_test = mulhilo(1443728.0, 418697.0);
    dbg[32] = direct_test.x;  // hi
    dbg[33] = direct_test.y;  // lo
    // Also test with sum0_s.y and N0 directly (no Mont context).
    let direct_test2 = mulhilo(sum0_s.y, N0);
    dbg[34] = direct_test2.x;
    dbg[35] = direct_test2.y;
    dbg[36] = sum0_s.x;
    dbg[37] = sum0_s.y;
    dbg[38] = N0;
    dbg[39] = x.limbs[0];

    // Direct call to bias_split_f32 with a hard-coded constant.
    let bs_const = bias_split_f32(1443728.0);
    dbg[40] = bs_const.x;
    dbg[41] = bs_const.y;
    // Direct call to bias_split_f32 with the actual sum0 value.
    let bs_var = bias_split_f32(sum0);
    dbg[42] = bs_var.x;
    dbg[43] = bs_var.y;
    // Direct call with a runtime-derived variable that equals 1443728.
    var rv: f32 = 1443728.0;
    let bs_rv = bias_split_f32(rv);
    dbg[44] = bs_rv.x;
    dbg[45] = bs_rv.y;
    // Direct call with xy0.y (the mulhilo result, runtime variable).
    let bs_xy = bias_split_f32(xy0.y);
    dbg[46] = bs_xy.x;
    dbg[47] = bs_xy.y;


    for (var j = 1u; j < NUM_LIMBS; j ++) {
        let xyj = mulhilo(x.limbs[0], y.limbs[j]);
        let qpj = mulhilo(qi, pp.limbs[j]);
        let t1 = s.limbs[j] + xyj.y;
        let t1_s = bias_split_f32(t1);
        let t2 = t1_s.y + qpj.y;
        let t2_s = bias_split_f32(t2);
        let c_lo_before = c_lo;
        let t3 = t2_s.y + c_lo;
        let t3_s = bias_split_f32(t3);
        if (j == 11u) {
            dbg[60] = c_lo_before;
            dbg[61] = t3_s.y;
            // Direct re-check: what does bias_split_f32(5290618.0) return here?
            let dt = bias_split_f32(5290618.0);
            dbg[62] = dt.x;
            dbg[63] = dt.y;
        }
        s.limbs[j - 1u] = t3_s.y;
        let sum_overflow = t1_s.x + t2_s.x + t3_s.x + c_hi;
        let nc1 = xyj.x + qpj.x;
        let nc1_s = bias_split_f32(nc1);
        let nc2 = nc1_s.y + sum_overflow;
        let nc2_s = bias_split_f32(nc2);
        c_hi = nc1_s.x + nc2_s.x;
        c_lo = nc2_s.y;
        if (j == 11u) {
            // Capture j=11 intermediates.
            dbg[48] = xyj.x;
            dbg[49] = xyj.y;
            dbg[50] = qpj.x;
            dbg[51] = qpj.y;
            dbg[52] = t1;
            dbg[53] = t1_s.y;
            dbg[54] = t2;
            dbg[55] = t2_s.y;
            dbg[56] = t3;
            dbg[57] = t3_s.x;
            dbg[58] = t3_s.y;
            dbg[59] = c_lo;  // this is c_lo AFTER update (since we capture after assignment)
        }
    }
    s.limbs[NUM_LIMBS - 1u] = fma(c_hi, W, c_lo);

    for (var k = 0u; k < NUM_LIMBS; k ++) { dbg[k] = s.limbs[k]; }

    // Now call the full Mont function to compare.
    var x2 = xs[0];
    var y2 = ys[0];
    let full = montgomery_product_f32(&x2, &y2);
    for (var k = 0u; k < NUM_LIMBS; k ++) { dbg[20u + k] = full.limbs[k]; }
}
`;
  const code = `${helpers}\n${debugEntry}`;
  const module = device.createShaderModule({ code });
  const ci = await module.getCompilationInfo();
  let hasErr = false;
  for (const m of ci.messages) {
    if (m.type === 'error') {
      console.error(`[debug shader] error: ${m.message} (line ${m.lineNum})`);
      hasErr = true;
    } else {
      console.warn(`[debug shader] ${m.type}: ${m.message} (line ${m.lineNum})`);
    }
  }
  if (hasErr) throw new Error('debug shader compile failed');

  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
  const bg = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xsBuf } },
      { binding: 1, resource: { buffer: ysBuf } },
      { binding: 2, resource: { buffer: dbgBuf } },
    ],
  });

  const enc = device.createCommandEncoder();
  const ps = enc.beginComputePass();
  ps.setPipeline(pipeline);
  ps.setBindGroup(0, bg);
  ps.dispatchWorkgroups(1, 1, 1);
  ps.end();
  const stagingBuf = device.createBuffer({
    size: DEBUG_SLOTS * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  enc.copyBufferToBuffer(dbgBuf, 0, stagingBuf, 0, DEBUG_SLOTS * 4);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await stagingBuf.mapAsync(GPUMapMode.READ);
  const view = new Float32Array(stagingBuf.getMappedRange().slice(0));
  stagingBuf.unmap();
  stagingBuf.destroy();

  const fmtArr = (arr: Float32Array, start: number, end: number) =>
    Array.from(arr.subarray(start, end))
      .map(v => Math.round(v))
      .join(', ');

  log('info', `[debug] input a (Mont(1)): [${aLimbs.join(', ')}]`);
  log('info', `[debug] input b (Mont(1)): [${bLimbs.join(', ')}]`);
  log('info', `[debug] inline-i0 s[0..11] = [${fmtArr(view, 0, 12)}]`);
  log('info', `[debug] inline-i0 xy0=(lo=${Math.round(view[12])}, hi=${Math.round(view[13])}) sum0=${Math.round(view[14])} qi=${Math.round(view[15])} qp0=(lo=${Math.round(view[16])}, hi=${Math.round(view[17])}) c_lo=${Math.round(view[18])} c_hi=${Math.round(view[19])}`);
  log('info', `[debug] mont_full output = [${fmtArr(view, 20, 32)}]`);
  log('info', `[debug] direct mulhilo(1443728, 418697) = (hi=${Math.round(view[32])}, lo=${Math.round(view[33])})`);
  log('info', `[debug] direct mulhilo(sum0_s.y, N0) = (hi=${Math.round(view[34])}, lo=${Math.round(view[35])})`);
  log('info', `[debug] sum0_s=(hi=${Math.round(view[36])}, lo=${Math.round(view[37])}) N0_echo=${Math.round(view[38])} x.limbs[0]_echo=${Math.round(view[39])}`);
  log('info', `[debug] bias_split_f32(1443728.0) = (hi=${Math.round(view[40])}, lo=${Math.round(view[41])})`);
  log('info', `[debug] bias_split_f32(sum0) = (hi=${Math.round(view[42])}, lo=${Math.round(view[43])})`);
  log('info', `[debug] bias_split_f32(var rv=1443728.0) = (hi=${Math.round(view[44])}, lo=${Math.round(view[45])})`);
  log('info', `[debug] bias_split_f32(xy0.y) = (hi=${Math.round(view[46])}, lo=${Math.round(view[47])})`);
  log('info', `[debug] j=11: xyj=(hi=${Math.round(view[48])}, lo=${Math.round(view[49])}) qpj=(hi=${Math.round(view[50])}, lo=${Math.round(view[51])})`);
  log('info', `[debug] j=11: t1=${Math.round(view[52])} t1_s.y=${Math.round(view[53])} t2=${Math.round(view[54])} t2_s.y=${Math.round(view[55])}`);
  log('info', `[debug] j=11: t3=${Math.round(view[56])} t3_s.x=${Math.round(view[57])} t3_s.y=${Math.round(view[58])}`);
  log('info', `[debug] j=11: c_lo_before=${Math.round(view[60])} t3_s.y_recheck=${Math.round(view[61])}`);
  log('info', `[debug] j=11: bias_split_f32(5290618.0) direct = (hi=${Math.round(view[62])}, lo=${Math.round(view[63])})`);
  log('info', `[debug] j=11: c_lo_after = ${Math.round(view[59])}`);

  xsBuf.destroy();
  ysBuf.destroy();
  dbgBuf.destroy();
}

async function main() {
  try {
    if (!('gpu' in navigator)) {
      throw new Error('navigator.gpu missing — WebGPU not available');
    }
    const params = parseParams();
    benchState.params = params;
    log('info', `params: path=${params.path} n=${params.n} k=${params.k} validate-n=${params.validateN} reps=${params.reps}`);

    benchState.state = 'running';
    const device = await get_device();
    log('info', `WebGPU device acquired`);

    // ShaderManager is keyed on chunk_size / input_size for the MSM
    // pipeline; for the micro-bench we only need its Mont-constant
    // pre-computation, so values are arbitrary.
    const sm = new ShaderManager(4, params.n, BN254_CURVE_CONFIG, false);

    if (params.debug) {
      if (params.debug === 'mulhilo') {
        await runDebugMulhiloF32(device, sm);
      } else {
        await runDebugF32(device, sm, params.debug);
      }
      benchState.state = 'done';
      log('ok', `[debug] done`);
      return;
    }

    const paths: Path[] = params.path === 'both' ? ['u32', 'f32'] : [params.path];
    for (const path of paths) {
      const result = await runPath(device, sm, path, params.n, params.k, params.validateN, params.reps);
      benchState.results.push(result);
      if (!result.validateOk) {
        // Surface the failure but continue with the other path so the
        // caller can see both results in one shot if requested.
        log('err', `path=${path} failed validation — stopping path traversal`);
        break;
      }
    }

    benchState.state = 'done';
    log('ok', `bench done: ${benchState.results.length} paths`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `FATAL: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  }
}

main().catch(e => {
  const msg = e instanceof Error ? e.message : String(e);
  log('err', `unhandled: ${msg}`);
  benchState.state = 'error';
  benchState.error = msg;
});
