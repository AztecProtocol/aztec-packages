/// <reference types="@webgpu/types" />
// Standalone single-dispatch WebGPU benchmark for batch-affine EC addition.
// Sweeps BATCH_SIZE in {32, 64, 128, 256, 512, 1024, 2048} at fixed
// TOTAL_PAIRS = 65536 to find the sweet spot where amortising the single
// `fr_inv_by_a` per batch stops beating the loss of GPU thread occupancy.
//
// SAFETY: NO MSM pipeline touched. The shader has only compile-time-const
// loop bounds (BS, TPB, NUM_WORDS). Single dispatch per measurement, no
// recursion. Total VRAM under 40 MB.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';

// TOTAL_PAIRS defaults to 65536 (2^16). Overridable via ?total=N for
// smoke-tests on small slices (NOT used in the headline sweep, but
// useful for "does this dispatch return at all" runs at N=1024).
const DEFAULT_TOTAL_PAIRS = 1 << 16; // 65536
let TOTAL_PAIRS = DEFAULT_TOTAL_PAIRS;
// BATCH_SIZES is also overridable via ?sizes=A,B,C for the smoke-test
// where we only want to run one size.
const DEFAULT_BATCH_SIZES = [32, 64, 128, 256, 512, 1024, 2048] as const;
let BATCH_SIZES: readonly number[] = DEFAULT_BATCH_SIZES;

// (batch_size, tpb, per_thread_count) table. Per the bench spec:
//   B=32:  TPB=32, BS=1
//   B=64:  TPB=64, BS=1
//   B=128+: TPB=64, BS=B/64
function tpbFor(batchSize: number): { tpb: number; bs: number } {
  if (batchSize === 32) return { tpb: 32, bs: 1 };
  if (batchSize === 64) return { tpb: 64, bs: 1 };
  return { tpb: 64, bs: batchSize / 64 };
}

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

// Seeded LCG (Numerical Recipes constants). Matches the seeding convention
// used by the other dev-page benches.
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

interface PerSizeResult {
  batch_size: number;
  tpb: number;
  bs: number;
  num_wgs: number;
  total_threads: number;
  median_ms: number;
  min_ms: number;
  max_ms: number;
  ns_per_pair: number;
  samples_ms: number[];
  validated: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { reps: number } | null;
  results: PerSizeResult[];
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
  console.log(`[bench-batch-affine] ${msg}`);
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
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
  return { pipeline, layout };
}

// Build inputs ONCE per batch_size (deterministic via LCG seeded with
// 0xdeadbeef + batch_size). Generates `TOTAL_PAIRS * 4` BigInts holding
// random Mont-form values: pair k = [P_k.x, P_k.y, Q_k.x, Q_k.y]. The
// algebra is garbage (these aren't on-curve points), but the shader
// produces SOMETHING and the dispatch shape is what we're timing.
function buildInputs(batchSize: number, R: bigint, p: bigint): ArrayBuffer {
  const rng = makeRng(0xdeadbeef + batchSize);
  const bytes = new ArrayBuffer(TOTAL_PAIRS * 4 * NUM_LIMBS_U32 * 4);
  const buf = new Uint32Array(bytes);
  for (let k = 0; k < TOTAL_PAIRS; k++) {
    // Generate four field elements per pair, then Montgomery-form them so
    // the shader's `montgomery_product` calls produce in-Mont-form
    // outputs. We must also ensure P.x != Q.x (delta != 0) per pair, since
    // batch-inverse on a zero delta is undefined and would NaN the run.
    let pxMont: bigint, qxMont: bigint;
    do {
      const pxCan = randomBelow(p, rng);
      pxMont = (pxCan * R) % p;
      const qxCan = randomBelow(p, rng);
      qxMont = (qxCan * R) % p;
    } while (pxMont === qxMont);
    const pyMont = (randomBelow(p, rng) * R) % p;
    const qyMont = (randomBelow(p, rng) * R) % p;
    const coords = [pxMont, pyMont, qxMont, qyMont];
    const base = k * 4 * NUM_LIMBS_U32;
    for (let c = 0; c < 4; c++) {
      const limbs = bigintToLimbsU32(coords[c]);
      const off = base + c * NUM_LIMBS_U32;
      for (let j = 0; j < NUM_LIMBS_U32; j++) buf[off + j] = limbs[j];
    }
  }
  return bytes;
}

async function runOne(
  device: GPUDevice,
  sm: ShaderManager,
  batchSize: number,
  reps: number,
  R: bigint,
  p: bigint,
): Promise<PerSizeResult> {
  const { tpb, bs } = tpbFor(batchSize);
  const numWgs = TOTAL_PAIRS / batchSize;
  const totalThreads = numWgs * tpb;
  log(
    'info',
    `=== batch_size=${batchSize}: TPB=${tpb} BS=${bs} num_WGs=${numWgs} total_threads=${totalThreads}`,
  );

  // Compile shader.
  const code = sm.gen_bench_batch_affine_shader(batchSize, tpb);
  const cacheKey = `bench-batch-affine-B${batchSize}-T${tpb}`;
  log('info', `compiling shader (${code.length} chars)`);
  (window as unknown as Record<string, unknown>)[`__shader_${batchSize}`] = code;
  const { pipeline, layout } = await createPipeline(device, code, cacheKey);

  // Build inputs.
  const inputsAB = buildInputs(batchSize, R, p);

  // Buffers.
  const inputBytes = inputsAB.byteLength; // TOTAL_PAIRS * 4 * 80 = 21 MB
  const inputsBuf = device.createBuffer({
    size: inputBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputsBuf, 0, inputsAB);

  const prefixBytes = TOTAL_PAIRS * NUM_LIMBS_U32 * 4; // ~5.2 MB
  const prefixBuf = device.createBuffer({
    size: prefixBytes,
    usage: GPUBufferUsage.STORAGE,
  });

  const outputBytes = TOTAL_PAIRS * 2 * NUM_LIMBS_U32 * 4; // ~10.5 MB
  const outputsBuf = device.createBuffer({
    size: outputBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: inputsBuf } },
      { binding: 1, resource: { buffer: prefixBuf } },
      { binding: 2, resource: { buffer: outputsBuf } },
    ],
  });

  // Warmup + small validation: confirm the first pair's R.x/R.y are
  // nonzero. We DON'T check algebraic correctness — the inputs aren't on
  // an elliptic curve. We just need the shader to do SOMETHING and not
  // hang or produce all zeros.
  {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numWgs, 1, 1);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  log('info', 'warmup dispatch returned');

  // Sanity readback: copy first pair's R.x to host and confirm non-zero.
  const sanityBytes = 2 * NUM_LIMBS_U32 * 4;
  const stagingBuf = device.createBuffer({
    size: sanityBytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(outputsBuf, 0, stagingBuf, 0, sanityBytes);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await stagingBuf.mapAsync(GPUMapMode.READ);
  }
  const sanityBytesCopy = stagingBuf.getMappedRange(0, sanityBytes).slice(0);
  stagingBuf.unmap();
  stagingBuf.destroy();
  const sanityU32 = new Uint32Array(sanityBytesCopy);
  const rx = limbsU32ToBigint(sanityU32.subarray(0, NUM_LIMBS_U32));
  const ry = limbsU32ToBigint(sanityU32.subarray(NUM_LIMBS_U32, 2 * NUM_LIMBS_U32));
  if (rx === 0n && ry === 0n) {
    log('err', `SANITY FAIL @ B=${batchSize}: first pair R.x and R.y both zero`);
    inputsBuf.destroy();
    prefixBuf.destroy();
    outputsBuf.destroy();
    throw new Error(`sanity fail at batch_size=${batchSize}`);
  }
  log('ok', `sanity OK: pair[0].R.x=0x${rx.toString(16).slice(0, 16)}... R.y=0x${ry.toString(16).slice(0, 16)}...`);

  // Timed reps. Each rep includes a fresh encoder so we measure
  // submit→idle (the shape the user cares about). Match bench-fr-inv.ts.
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numWgs, 1, 1);
    pass.end();
    const t0 = performance.now();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const t1 = performance.now();
    samples.push(t1 - t0);
  }
  const med = median(samples);
  const mn = Math.min(...samples);
  const mx = Math.max(...samples);
  const nsPerPair = (med * 1e6) / TOTAL_PAIRS;

  log(
    'ok',
    `B=${batchSize}: median=${med.toFixed(3)}ms min=${mn.toFixed(3)}ms max=${mx.toFixed(3)}ms ns/pair=${nsPerPair.toFixed(1)}`,
  );

  inputsBuf.destroy();
  prefixBuf.destroy();
  outputsBuf.destroy();

  return {
    batch_size: batchSize,
    tpb,
    bs,
    num_wgs: numWgs,
    total_threads: totalThreads,
    median_ms: med,
    min_ms: mn,
    max_ms: mx,
    ns_per_pair: nsPerPair,
    samples_ms: samples,
    validated: true,
  };
}

function parseParams(): { reps: number } {
  const qp = new URLSearchParams(window.location.search);
  const reps = parseInt(qp.get('reps') ?? '5', 10);
  if (!Number.isFinite(reps) || reps <= 0 || reps > 50) {
    throw new Error(`?reps must be in (0, 50], got ${qp.get('reps')}`);
  }
  const totalStr = qp.get('total');
  if (totalStr !== null) {
    const total = parseInt(totalStr, 10);
    if (!Number.isFinite(total) || total <= 0 || total > (1 << 20)) {
      throw new Error(`?total must be in (0, 2^20], got ${totalStr}`);
    }
    TOTAL_PAIRS = total;
  }
  const sizesStr = qp.get('sizes');
  if (sizesStr !== null) {
    const sizes = sizesStr.split(',').map(s => parseInt(s, 10));
    for (const s of sizes) {
      if (!Number.isFinite(s) || s <= 0 || s > 4096) {
        throw new Error(`?sizes entries must be in (0, 4096], got ${s}`);
      }
      if (TOTAL_PAIRS % s !== 0) {
        throw new Error(`?sizes entry ${s} does not divide TOTAL_PAIRS=${TOTAL_PAIRS}`);
      }
    }
    BATCH_SIZES = sizes;
  }
  return { reps };
}

async function main() {
  try {
    if (!('gpu' in navigator)) {
      throw new Error('navigator.gpu missing — WebGPU not available');
    }
    const params = parseParams();
    benchState.params = params;
    log('info', `params: reps=${params.reps} TOTAL_PAIRS=${TOTAL_PAIRS}`);

    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');

    const p = BN254_BASE_FIELD;
    const miscParams = compute_misc_params(p, WORD_SIZE_U32);
    if (miscParams.num_words !== NUM_LIMBS_U32) {
      throw new Error(`expected num_words=${NUM_LIMBS_U32}, got ${miscParams.num_words}`);
    }
    const R = miscParams.r;

    const sm = new ShaderManager(4, TOTAL_PAIRS, BN254_CURVE_CONFIG, false);

    for (const B of BATCH_SIZES) {
      try {
        const r = await runOne(device, sm, B, params.reps, R, p);
        benchState.results.push(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('err', `B=${B} failed: ${msg} — STOPPING sweep at first failure`);
        benchState.state = 'error';
        benchState.error = msg;
        return;
      }
    }

    benchState.state = 'done';
    log('ok', 'all batches done');
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
