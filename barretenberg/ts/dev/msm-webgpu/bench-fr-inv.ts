/// <reference types="@webgpu/types" />
// fr_inv WebGPU dispatch test. Mounted standalone (no SRS, no MSM
// pipeline). Reads `?n=N&k=K&validate-n=N&reps=R&variant=fr_inv|fr_inv_by`,
// generates seeded random BN254 base-field values in Montgomery form, runs
// `k` chained inverse calls per thread, validates each output against the
// host `modInverse` + Mont-correction reference (same reference for both
// variants — the algorithms must produce identical outputs), and reports
// timing via `window.__bench`.
//
// Safety: `n` is capped at 2^20, `k` at 100. The only data-dependent loop
// in the entry shader is `for (var i = 0u; i < k; ...)` with `k` capped.
// Every loop inside `fr_inv` / `fr_inv_by` (and its callees) is bounded by
// a compile-time `const` — see by_inverse.template.wgsl, bigint_by,
// fr_pow.template.wgsl, and montgomery_product.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { modInverse, BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';

interface SampleSummary {
  reps: number;
  msSamples: number[];
  msMedian: number;
  msMin: number;
  msMax: number;
  inversionsPerSec: number;
}
interface BenchResult {
  validateOk: boolean;
  mismatches: string[];
  timing: SampleSummary | null;
}
interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: {
    n: number;
    k: number;
    validateN: number;
    reps: number;
    variant: 'fr_inv' | 'fr_inv_by' | 'fr_inv_by_a' | 'fr_pow_inv';
  } | null;
  result: BenchResult | null;
  error: string | null;
  log: string[];
}

const benchState: BenchState = {
  state: 'boot',
  params: null,
  result: null,
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
  console.log(`[bench-fr-inv] ${msg}`);
}

const N_MAX = 1 << 20;
const K_MAX = 100;

// 20 x 13-bit limb layout matches the u32 MSM path (the only path that
// fr_inv_by is wired into in this bench).
const NUM_LIMBS_U32 = 20;
const WORD_SIZE_U32 = 13;
const W_U32 = 1n << BigInt(WORD_SIZE_U32);
const MASK_U32 = W_U32 - 1n;

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

// Seeded LCG (Numerical Recipes constants) for reproducible input gen.
// Matches the seeding convention in bench-field-mul.ts.
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

// Host reference: chained `fr_inv_by` over Mont-form inputs.
//
// fr_inv_by maps Mont(A) -> Mont(A^(-1)). Concretely, if input is
// a_m = A * R mod p, then output is A^(-1) * R mod p.
//
// One way to compute this on the host: unmont -> modInverse -> mont.
//   A          = a_m * Rinv mod p
//   A_inv      = modInverse(A, p) = A^(-1) mod p (canonical)
//   out_m      = A_inv * R mod p
//
// Equivalently: out_m = modInverse(a_m, p) * R^2 mod p (since
// modInverse(a_m) = (A*R)^(-1) = A^(-1) * R^(-1), times R^2 lands at
// A^(-1) * R = out_m). Either formula works; using the unmont->inv->mont
// chain mirrors how a user typically thinks about Mont arithmetic.
function fr_inv_by_host_once(a_mont: bigint, R: bigint, Rinv: bigint, p: bigint): bigint {
  if (a_mont === 0n) return 0n;
  const a_canonical = (a_mont * Rinv) % p;
  const a_inv = modInverse(a_canonical, p);
  return (a_inv * R) % p;
}

function fr_inv_by_host_chained(
  a_mont: bigint,
  k: number,
  R: bigint,
  Rinv: bigint,
  p: bigint,
): bigint {
  let acc = a_mont;
  for (let i = 0; i < k; i++) {
    acc = fr_inv_by_host_once(acc, R, Rinv, p);
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
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const pipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
  return { pipeline, layout };
}

async function runBench(
  device: GPUDevice,
  sm: ShaderManager,
  n: number,
  k: number,
  validateN: number,
  reps: number,
  variant: 'fr_inv' | 'fr_inv_by' | 'fr_inv_by_a' | 'fr_pow_inv',
): Promise<BenchResult> {
  log('info', `building inputs (n=${n}, k=${k}, validate-n=${validateN}, reps=${reps}, variant=${variant})`);
  const p = BN254_BASE_FIELD;
  const params = compute_misc_params(p, WORD_SIZE_U32);
  if (params.num_words !== NUM_LIMBS_U32) {
    throw new Error(`expected num_words=${NUM_LIMBS_U32}, got ${params.num_words}`);
  }
  const R = params.r;
  const Rinv = params.rinv;
  if ((R * Rinv) % p !== 1n) {
    throw new Error(`R * Rinv mod p != 1`);
  }

  // Generate random canonical inputs.
  const rng = makeRng(0xc0ffee);
  const aCanonical: bigint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Ensure nonzero — fr_inv_by of 0 is undefined / 0 by convention but
    // the chained case requires invertibility every step. Reject 0.
    let v = randomBelow(p, rng);
    while (v === 0n) v = randomBelow(p, rng);
    aCanonical[i] = v;
  }
  const aMont: bigint[] = aCanonical.map(x => (x * R) % p);

  // Host reference for the first validate-n inputs.
  log('info', `computing host reference for ${validateN} pairs`);
  const expected: bigint[] = new Array(validateN);
  for (let i = 0; i < validateN; i++) {
    expected[i] = fr_inv_by_host_chained(aMont[i], k, R, Rinv, p);
  }

  // Pack input buffer: n BigInts (20 x u32 each).
  const bytesPerLimbArray = NUM_LIMBS_U32 * 4;
  const xsBytes = new ArrayBuffer(n * bytesPerLimbArray);
  const xv = new Uint32Array(xsBytes);
  for (let i = 0; i < n; i++) {
    const limbs = bigintToLimbsU32(aMont[i]);
    const off = i * NUM_LIMBS_U32;
    for (let j = 0; j < NUM_LIMBS_U32; j++) xv[off + j] = limbs[j];
  }

  // Shader & pipeline.
  const WORKGROUP_SIZE = 64;
  const code = sm.gen_fr_inv_bench_shader(WORKGROUP_SIZE, variant);
  const cacheKey = `fr-inv-bench-${variant}-wg${WORKGROUP_SIZE}`;
  log('info', `compiling shader (${code.length} chars)`);
  (window as unknown as Record<string, unknown>)[`__shader`] = code;
  const { pipeline, layout } = await createPipeline(device, code, cacheKey);

  // Buffers.
  const xsBuf = device.createBuffer({
    size: xsBytes.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(xsBuf, 0, xsBytes);
  const outBytes = n * NUM_LIMBS_U32 * 4;
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
      { binding: 1, resource: { buffer: outBuf } },
      { binding: 2, resource: { buffer: uniformBuf } },
    ],
  });

  const numWorkgroups = Math.ceil(n / WORKGROUP_SIZE);
  log('info', `dispatching ${numWorkgroups} workgroups of ${WORKGROUP_SIZE} threads (${n} threads total)`);

  // Warmup pass.
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
  log('info', 'warmup OK');

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

  const outU32 = new Uint32Array(outBytesCopy);
  const mismatches: string[] = [];
  let validateOk = true;
  for (let i = 0; i < validateN; i++) {
    const limbs = outU32.subarray(i * NUM_LIMBS_U32, (i + 1) * NUM_LIMBS_U32);
    const got = limbsU32ToBigint(limbs);
    if (got !== expected[i]) {
      validateOk = false;
      if (mismatches.length < 5) {
        mismatches.push(
          `pair[${i}]: a_canonical=0x${aCanonical[i].toString(16)} a_mont=0x${aMont[i].toString(16)}\n` +
            `  expected: 0x${expected[i].toString(16)}\n` +
            `  actual:   0x${got.toString(16)}\n` +
            `  expected_limbs: [${bigintToLimbsU32(expected[i]).join(', ')}]\n` +
            `  actual_limbs:   [${Array.from(limbs).join(', ')}]`,
        );
      }
    }
  }

  if (!validateOk) {
    log('err', `VALIDATION FAILED (${mismatches.length} mismatches shown; first ${validateN} pairs checked)`);
    for (const m of mismatches) log('err', m);
    xsBuf.destroy();
    outBuf.destroy();
    uniformBuf.destroy();
    return { validateOk: false, mismatches, timing: null };
  }
  log('ok', `VALIDATION OK (${validateN} pairs)`);

  // Timed reps.
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
  const totalInv = n * k;
  const inversionsPerSec = totalInv / (msMed / 1000);
  log(
    'ok',
    `timing reps=${reps} median=${msMed.toFixed(3)}ms min=${msMin.toFixed(3)}ms max=${msMax.toFixed(3)}ms inversions/s=${inversionsPerSec.toExponential(3)} (n*k=${totalInv.toLocaleString()})`,
  );

  xsBuf.destroy();
  outBuf.destroy();
  uniformBuf.destroy();

  return {
    validateOk: true,
    mismatches: [],
    timing: { reps, msSamples, msMedian: msMed, msMin, msMax, inversionsPerSec },
  };
}

function parseParams(): {
  n: number;
  k: number;
  validateN: number;
  reps: number;
  variant: 'fr_inv' | 'fr_inv_by' | 'fr_inv_by_a' | 'fr_pow_inv';
} {
  const qp = new URLSearchParams(window.location.search);
  const n = parseInt(qp.get('n') ?? '64', 10);
  const k = parseInt(qp.get('k') ?? '1', 10);
  const validateN = parseInt(qp.get('validate-n') ?? String(Math.min(64, n)), 10);
  const reps = parseInt(qp.get('reps') ?? '1', 10);
  const variantStr = qp.get('variant') ?? 'fr_inv_by';
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
  if (
    variantStr !== 'fr_inv' &&
    variantStr !== 'fr_inv_by' &&
    variantStr !== 'fr_inv_by_a' &&
    variantStr !== 'fr_pow_inv'
  ) {
    throw new Error(
      `?variant must be 'fr_inv' | 'fr_inv_by' | 'fr_inv_by_a' | 'fr_pow_inv', got '${variantStr}'`,
    );
  }
  return { n, k, validateN, reps, variant: variantStr };
}

async function main() {
  try {
    if (!('gpu' in navigator)) {
      throw new Error('navigator.gpu missing — WebGPU not available');
    }
    const params = parseParams();
    benchState.params = params;
    log(
      'info',
      `params: n=${params.n} k=${params.k} validate-n=${params.validateN} reps=${params.reps} variant=${params.variant}`,
    );

    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');

    const sm = new ShaderManager(4, params.n, BN254_CURVE_CONFIG, false);

    const result = await runBench(
      device,
      sm,
      params.n,
      params.k,
      params.validateN,
      params.reps,
      params.variant,
    );
    benchState.result = result;

    benchState.state = 'done';
    if (result.validateOk) {
      log('ok', 'bench done');
    } else {
      log('err', 'bench done with validation failures');
    }
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
