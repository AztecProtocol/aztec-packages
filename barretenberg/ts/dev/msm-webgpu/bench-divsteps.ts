/// <reference types="@webgpu/types" />
// BY divsteps WebGPU dispatch test. Mounted standalone (no SRS, no MSM
// pipeline). Reads `?n=N&validate-n=N&reps=R`, generates seeded random
// (f_lo, g_lo, delta) tuples, runs the `by_divsteps` shader once per
// thread, validates each output against the TS `Wasm9x29.divsteps`
// reference, and reports timing via `window.__bench`.
//
// Safety. The shader's only loop is bounded by the WGSL `const BY_BATCH = 58u`
// (in bigint_by.template.wgsl). The dispatch is one thread per input tuple,
// `n` capped at 2^23. Inputs are u64 (for f_lo, g_lo) and i32 (for delta)
// — by_divsteps is variable-time over branches but always exits after exactly
// 58 iterations.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { Wasm9x29 } from '../../src/msm_webgpu/cuzk/bernstein_yang.js';

interface SampleSummary {
  reps: number;
  msSamples: number[];
  msMedian: number;
  msMin: number;
  msMax: number;
  divstepsPerSec: number;
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
  console.log(`[bench-divsteps] ${msg}`);
}

const N_MAX = 1 << 23;

// Seeded LCG (Numerical Recipes constants). Matches the pattern used in
// bench-field-mul.ts; the spec mandates seed 0xb33fb33f.
function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

// Produce a random u64 as a (lo32, hi32) pair via two LCG draws.
function randomU64(rng: () => number): { lo: number; hi: number } {
  const lo = rng() >>> 0;
  const hi = rng() >>> 0;
  return { lo, hi };
}

// Random delta in [-512, 512] inclusive (1025 values).
function randomDelta(rng: () => number): number {
  return (rng() % 1025) - 512;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Reassemble a (lo: i32, hi: i32) GPU output pair as a bigint (signed two's
// complement, 64 bits) for cross-checking against the TS reference's
// `bigint` matrix entries.
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

async function runBench(
  device: GPUDevice,
  sm: ShaderManager,
  n: number,
  validateN: number,
  reps: number,
): Promise<BenchResult> {
  log('info', `building inputs (n=${n}, validate-n=${validateN}, reps=${reps})`);

  // Generate seeded inputs and compute TS reference in lockstep.
  const rng = makeRng(0xb33fb33f);
  const inputsFg = new Uint32Array(n * 4);
  const inputsDelta = new Int32Array(n);
  const expectedU = new BigInt64Array(n);
  const expectedV = new BigInt64Array(n);
  const expectedQ = new BigInt64Array(n);
  const expectedR = new BigInt64Array(n);
  const expectedDelta = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const f = randomU64(rng);
    const g = randomU64(rng);
    const d = randomDelta(rng);
    inputsFg[i * 4 + 0] = f.lo;
    inputsFg[i * 4 + 1] = f.hi;
    inputsFg[i * 4 + 2] = g.lo;
    inputsFg[i * 4 + 3] = g.hi;
    inputsDelta[i] = d;
    // Reassemble u64 bigints for the TS reference; delta is signed i32.
    const fBig = BigInt(f.lo >>> 0) | (BigInt(f.hi >>> 0) << 32n);
    const gBig = BigInt(g.lo >>> 0) | (BigInt(g.hi >>> 0) << 32n);
    if (i < validateN) {
      const { mat, delta: deltaOut } = Wasm9x29.divsteps(BigInt(d), fBig, gBig);
      expectedU[i] = mat.u;
      expectedV[i] = mat.v;
      expectedQ[i] = mat.q;
      expectedR[i] = mat.r;
      // The TS port returns delta as bigint (the C++ i64 view). For our
      // i32 carrier on the GPU this is fine — under BATCH=58 inner ops,
      // delta changes by at most 58 per call, so for |delta_in| <= 512 the
      // result fits well inside i32.
      expectedDelta[i] = Number(deltaOut);
    }
  }

  // Shader & pipeline.
  const WORKGROUP_SIZE = 64;
  const code = sm.gen_divsteps_bench_shader(WORKGROUP_SIZE);
  const cacheKey = `divsteps-bench-wg${WORKGROUP_SIZE}`;
  log('info', `compiling shader (${code.length} chars)`);
  (window as unknown as Record<string, unknown>)[`__shader`] = code;
  const { pipeline, layout } = await createPipeline(device, code, cacheKey);

  // Buffers.
  const inputsFgBuf = device.createBuffer({
    size: inputsFg.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputsFgBuf, 0, inputsFg);
  const inputsDeltaBuf = device.createBuffer({
    size: inputsDelta.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputsDeltaBuf, 0, inputsDelta);
  const outBytes = n * 9 * 4;
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
      { binding: 0, resource: { buffer: inputsFgBuf } },
      { binding: 1, resource: { buffer: inputsDeltaBuf } },
      { binding: 2, resource: { buffer: outBuf } },
      { binding: 3, resource: { buffer: uniformBuf } },
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
  let mismatches: string[] = [];
  let validateOk = true;
  for (let i = 0; i < validateN; i++) {
    const base = i * 9;
    const u = pairToSignedBig(outI32[base + 0], outI32[base + 4]);
    const v = pairToSignedBig(outI32[base + 1], outI32[base + 5]);
    const q = pairToSignedBig(outI32[base + 2], outI32[base + 6]);
    const r = pairToSignedBig(outI32[base + 3], outI32[base + 7]);
    const dOut = outI32[base + 8];
    const okU = u === expectedU[i];
    const okV = v === expectedV[i];
    const okQ = q === expectedQ[i];
    const okR = r === expectedR[i];
    const okD = dOut === expectedDelta[i];
    if (!(okU && okV && okQ && okR && okD)) {
      validateOk = false;
      if (mismatches.length < 5) {
        const fLo = BigInt(inputsFg[i * 4] >>> 0) | (BigInt(inputsFg[i * 4 + 1] >>> 0) << 32n);
        const gLo = BigInt(inputsFg[i * 4 + 2] >>> 0) | (BigInt(inputsFg[i * 4 + 3] >>> 0) << 32n);
        mismatches.push(
          `pair[${i}]: delta_in=${inputsDelta[i]} f_lo=0x${fLo.toString(16)} g_lo=0x${gLo.toString(16)}\n` +
            `  expected: u=${expectedU[i]} v=${expectedV[i]} q=${expectedQ[i]} r=${expectedR[i]} delta=${expectedDelta[i]}\n` +
            `  actual:   u=${u} v=${v} q=${q} r=${r} delta=${dOut}`,
        );
      }
    }
  }

  if (!validateOk) {
    log('err', `VALIDATION FAILED (${mismatches.length} mismatches shown; first ${validateN} pairs checked)`);
    for (const m of mismatches) log('err', m);
    inputsFgBuf.destroy();
    inputsDeltaBuf.destroy();
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
  const divstepsPerSec = n / (msMed / 1000);
  log(
    'ok',
    `timing reps=${reps} median=${msMed.toFixed(3)}ms min=${msMin.toFixed(3)}ms max=${msMax.toFixed(3)}ms divsteps_calls/s=${divstepsPerSec.toExponential(3)} (n=${n})`,
  );

  inputsFgBuf.destroy();
  inputsDeltaBuf.destroy();
  outBuf.destroy();
  uniformBuf.destroy();

  return {
    validateOk: true,
    mismatches: [],
    timing: { reps, msSamples, msMedian: msMed, msMin, msMax, divstepsPerSec },
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
    // for this bench we only need its constants table (num_words, etc.) so
    // values are arbitrary.
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
