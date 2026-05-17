/// <reference types="@webgpu/types" />
// BY apply_matrix WebGPU dispatch test. Mounted standalone (no SRS, no MSM
// pipeline). Reads `?n=N&validate-n=N&reps=R`, generates seeded random
// (Mat, f, g, d, e) records by first sampling random u64 (f_lo, g_lo, delta)
// and running the TS `Wasm9x29.divsteps` to get a valid Mat (which
// guarantees matrix-entry bounds), then synthesising plausible random f, g,
// d, e BigIntBY states, runs `by_apply_matrix_fg` and `by_apply_matrix_de`
// on the GPU per input record, and validates each output against the TS
// `Wasm9x29.applyMatrix` reference.
//
// Safety. The shader's only loops are inherited from `by_apply_matrix_fg`
// and `by_apply_matrix_de`, both bounded by the WGSL `const BY_NUM_LIMBS = 9u`.
// One thread per input record, `n` capped at 2^20 to keep memory pressure
// manageable.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import {
  Wasm9x29,
  fromBigint as byFromBigint,
  makeZero as byMakeZero,
  normalise as byNormalise,
  N as BY_N,
} from '../../src/msm_webgpu/cuzk/bernstein_yang.js';

interface SampleSummary {
  reps: number;
  msSamples: number[];
  msMedian: number;
  msMin: number;
  msMax: number;
  applyMatrixPerSec: number;
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
    validateN: number;
    reps: number;
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
  console.log(`[bench-apply-matrix] ${msg}`);
}

const N_MAX = 1 << 20;
const INPUT_STRIDE_U32 = 44;
const OUTPUT_STRIDE_I32 = 36;

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomU64(rng: () => number): { lo: number; hi: number } {
  const lo = rng() >>> 0;
  const hi = rng() >>> 0;
  return { lo, hi };
}

// Random signed 29-bit limb in [-2^28, 2^28). The +shift then sub keeps the
// distribution roughly uniform across the signed range while staying inside
// the canonical |limb| < 2^29 invariant that `by_normalise` preserves.
function randomSignedLimb29(rng: () => number): bigint {
  const v = rng();
  // Map u32 → signed [-2^28, 2^28).
  const u29 = v & 0x1fffffff;
  return BigInt(u29) - (1n << 28n);
}

// Make a random BigIntBY with limbs roughly uniform in [-2^28, 2^28),
// then normalise so the lower limbs canonicalise to [0, 2^29). This matches
// the post-by_normalise invariant the WGSL functions expect on input.
function randomNormalisedBigIntBY(rng: () => number): bigint[] {
  const x = byMakeZero();
  for (let i = 0; i < BY_N; i++) {
    x[i] = randomSignedLimb29(rng);
  }
  byNormalise(x);
  return x;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Reassemble a (lo: i32, hi: i32) GPU pair as a signed bigint (two's comp).
function pairToSignedBig(lo: number, hi: number): bigint {
  const loBig = BigInt(lo >>> 0);
  const hiBig = BigInt(hi >>> 0);
  let v = loBig | (hiBig << 32n);
  if (v >= 1n << 63n) v -= 1n << 64n;
  return v;
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

// Serialise a signed i64 bigint into (lo: u32, hi: u32) — the on-wire
// representation of Mat fields in the input buffer.
function i64ToLoHi(v: bigint): { lo: number; hi: number } {
  const U64 = (1n << 64n) - 1n;
  let u = v & U64;
  if (u < 0n) u += 1n << 64n;
  const lo = Number(u & 0xffffffffn) >>> 0;
  const hi = Number((u >> 32n) & 0xffffffffn) >>> 0;
  return { lo, hi };
}

async function runBench(
  device: GPUDevice,
  sm: ShaderManager,
  n: number,
  validateN: number,
  reps: number,
): Promise<BenchResult> {
  log('info', `building inputs (n=${n}, validate-n=${validateN}, reps=${reps})`);

  // Seeded inputs.
  const rng = makeRng(0xa57e1234);
  const inputsBuf = new Uint32Array(n * INPUT_STRIDE_U32);

  // Per-input ground truth: f', g', d', e' after applyMatrix.
  const expectedOutputs = new Int32Array(validateN * OUTPUT_STRIDE_I32);

  for (let i = 0; i < n; i++) {
    // 1. Sample random u64 f_lo, g_lo, and a small random delta; run the TS
    //    Wasm9x29.divsteps to produce a valid Mat (matrix entries satisfy
    //    the |entry| <= 2^58 bound that apply_matrix downstream expects).
    const f64 = randomU64(rng);
    const g64 = randomU64(rng);
    const delta = (rng() % 1025) - 512;
    const fBig = BigInt(f64.lo >>> 0) | (BigInt(f64.hi >>> 0) << 32n);
    const gBig = BigInt(g64.lo >>> 0) | (BigInt(g64.hi >>> 0) << 32n);
    const { mat } = Wasm9x29.divsteps(BigInt(delta), fBig, gBig);

    // 2. Synthesise random signed-canonical f, g, d, e BigIntBY states.
    const fState = randomNormalisedBigIntBY(rng);
    const gState = randomNormalisedBigIntBY(rng);
    const dState = randomNormalisedBigIntBY(rng);
    const eState = randomNormalisedBigIntBY(rng);

    // 3. Encode into the input buffer. Mat fields go (u, v, q, r, u_hi, v_hi,
    //    q_hi, r_hi). Each is the low 32 / high 32 of the i64 stored in
    //    bigint form.
    const base = i * INPUT_STRIDE_U32;
    const u_pair = i64ToLoHi(mat.u);
    const v_pair = i64ToLoHi(mat.v);
    const q_pair = i64ToLoHi(mat.q);
    const r_pair = i64ToLoHi(mat.r);
    inputsBuf[base + 0] = u_pair.lo;
    inputsBuf[base + 1] = v_pair.lo;
    inputsBuf[base + 2] = q_pair.lo;
    inputsBuf[base + 3] = r_pair.lo;
    inputsBuf[base + 4] = u_pair.hi;
    inputsBuf[base + 5] = v_pair.hi;
    inputsBuf[base + 6] = q_pair.hi;
    inputsBuf[base + 7] = r_pair.hi;
    for (let j = 0; j < BY_N; j++) {
      // Limbs are bigint after normalisation; coerce to signed 32-bit
      // representation. The `>>> 0` then re-cast to i32 via Int32Array
      // happens via writing as u32 in the buffer and bitcasting in WGSL.
      inputsBuf[base + 8 + j] = Number(BigInt.asIntN(32, fState[j])) | 0;
      inputsBuf[base + 17 + j] = Number(BigInt.asIntN(32, gState[j])) | 0;
      inputsBuf[base + 26 + j] = Number(BigInt.asIntN(32, dState[j])) | 0;
      inputsBuf[base + 35 + j] = Number(BigInt.asIntN(32, eState[j])) | 0;
    }

    // 4. Compute reference for validate-n.
    if (i < validateN) {
      const fRef = fState.slice();
      const gRef = gState.slice();
      const dRef = dState.slice();
      const eRef = eState.slice();
      const pRef = byFromBigint(Wasm9x29.P);
      Wasm9x29.applyMatrix(mat, fRef, gRef, dRef, eRef, pRef, Wasm9x29.P_INV);
      // applyMatrix output is signed; serialise as i32.
      const outBase = i * OUTPUT_STRIDE_I32;
      for (let j = 0; j < BY_N; j++) {
        expectedOutputs[outBase + 0 + j] = Number(BigInt.asIntN(32, fRef[j])) | 0;
        expectedOutputs[outBase + 9 + j] = Number(BigInt.asIntN(32, gRef[j])) | 0;
        expectedOutputs[outBase + 18 + j] = Number(BigInt.asIntN(32, dRef[j])) | 0;
        expectedOutputs[outBase + 27 + j] = Number(BigInt.asIntN(32, eRef[j])) | 0;
      }
    }
  }

  // Shader & pipeline.
  const WORKGROUP_SIZE = 64;
  const code = sm.gen_apply_matrix_bench_shader(WORKGROUP_SIZE);
  const cacheKey = `apply-matrix-bench-wg${WORKGROUP_SIZE}`;
  log('info', `compiling shader (${code.length} chars)`);
  (window as unknown as Record<string, unknown>)[`__shader`] = code;
  const { pipeline, layout } = await createPipeline(device, code, cacheKey);

  // Buffers.
  const inputsGpu = device.createBuffer({
    size: inputsBuf.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputsGpu, 0, inputsBuf);

  const outBytes = n * OUTPUT_STRIDE_I32 * 4;
  const outBuf = device.createBuffer({
    size: outBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  const uniformBytes = new ArrayBuffer(16);
  const uniformView = new Uint32Array(uniformBytes);
  uniformView[0] = n;
  uniformView[1] = 0;
  const uniformBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuf, 0, uniformBytes);

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: inputsGpu } },
      { binding: 1, resource: { buffer: outBuf } },
      { binding: 2, resource: { buffer: uniformBuf } },
    ],
  });

  const numWorkgroups = Math.ceil(n / WORKGROUP_SIZE);
  log('info', `dispatching ${numWorkgroups} workgroups of ${WORKGROUP_SIZE} threads each (${n} threads total)`);

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

  const outI32 = new Int32Array(outBytesCopy);
  const mismatches: string[] = [];
  let validateOk = true;
  for (let i = 0; i < validateN; i++) {
    const base = i * OUTPUT_STRIDE_I32;
    let pairOk = true;
    for (let j = 0; j < OUTPUT_STRIDE_I32; j++) {
      if (outI32[base + j] !== expectedOutputs[base + j]) {
        pairOk = false;
        break;
      }
    }
    if (!pairOk) {
      validateOk = false;
      if (mismatches.length < 5) {
        const got = Array.from(outI32.slice(base, base + OUTPUT_STRIDE_I32));
        const want = Array.from(expectedOutputs.slice(base, base + OUTPUT_STRIDE_I32));
        const labelLimbs = (arr: number[], offset: number, name: string) =>
          `${name}: [${arr.slice(offset, offset + 9).join(', ')}]`;
        mismatches.push(
          `pair[${i}]:\n` +
            `  expected:\n` +
            `    ${labelLimbs(want, 0, "f'")}\n` +
            `    ${labelLimbs(want, 9, "g'")}\n` +
            `    ${labelLimbs(want, 18, "d'")}\n` +
            `    ${labelLimbs(want, 27, "e'")}\n` +
            `  actual:\n` +
            `    ${labelLimbs(got, 0, "f'")}\n` +
            `    ${labelLimbs(got, 9, "g'")}\n` +
            `    ${labelLimbs(got, 18, "d'")}\n` +
            `    ${labelLimbs(got, 27, "e'")}`,
        );
      }
    }
  }

  if (!validateOk) {
    log('err', `VALIDATION FAILED (${mismatches.length} mismatches shown; first ${validateN} pairs checked)`);
    for (const m of mismatches) log('err', m);
    inputsGpu.destroy();
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
  const applyMatrixPerSec = n / (msMed / 1000);
  log(
    'ok',
    `timing reps=${reps} median=${msMed.toFixed(3)}ms min=${msMin.toFixed(3)}ms max=${msMax.toFixed(3)}ms apply_matrix_calls/s=${applyMatrixPerSec.toExponential(3)} (n=${n})`,
  );

  inputsGpu.destroy();
  outBuf.destroy();
  uniformBuf.destroy();

  return {
    validateOk: true,
    mismatches: [],
    timing: { reps, msSamples, msMedian: msMed, msMin, msMax, applyMatrixPerSec },
  };
}

function parseParams(): { n: number; validateN: number; reps: number } {
  const qp = new URLSearchParams(window.location.search);
  const n = parseInt(qp.get('n') ?? '1024', 10);
  const validateN = parseInt(qp.get('validate-n') ?? String(Math.min(64, n)), 10);
  const reps = parseInt(qp.get('reps') ?? '3', 10);
  if (!Number.isFinite(n) || n <= 0 || n > N_MAX) {
    throw new Error(`?n must be in (0, ${N_MAX}], got ${qp.get('n')}`);
  }
  if (!Number.isFinite(validateN) || validateN < 0 || validateN > n) {
    throw new Error(`?validate-n must be in [0, n], got ${qp.get('validate-n')}`);
  }
  if (!Number.isFinite(reps) || reps <= 0 || reps > 100) {
    throw new Error(`?reps must be in (0, 100], got ${qp.get('reps')}`);
  }
  return { n, validateN, reps };
}

async function main() {
  try {
    if (!('gpu' in navigator)) {
      throw new Error('navigator.gpu missing — WebGPU not available');
    }
    const params = parseParams();
    benchState.params = params;
    log('info', `params: n=${params.n} validate-n=${params.validateN} reps=${params.reps}`);

    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');

    // ShaderManager is keyed on chunk_size / input_size for the MSM pipeline;
    // for this bench we only need its constants table so values are arbitrary.
    const sm = new ShaderManager(4, params.n, BN254_CURVE_CONFIG, false);

    const result = await runBench(device, sm, params.n, params.validateN, params.reps);
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
