/// <reference types="@webgpu/types" />
// Standalone microbench for the GPU bin-packing planner kernel.
// Isolates the planner from the rest of the MSM pipeline so we can
// pin down the time required to build one per-level plan on the GPU.
//
// Production scale: an MSM splits each scalar into ceil(num_bits / c)
// Pippenger windows; each window is an independent bucket-method
// sub-problem of 2^(c-1) buckets. The planner dispatches one
// workgroup per window — workgroup w plans window w on its own, with
// no cross-workgroup communication. One dispatch covers all windows.
//
// Inputs (synthetic, host-built upfront):
//   counts[windows * 2^(c-1)]   per-bucket active count ~ Poisson(λ),
//                               with a deterministic sprinkle of empty
//                               and small (0-3) buckets injected so the
//                               finalize-and-drop path is exercised.
//   offsets[windows * 2^(c-1)]  per-window prefix sum of counts.
//
// Each window's 2^(c-1) buckets are handled by one workgroup of TPB
// threads, PER_THREAD = 2^(c-1) / TPB buckets per thread.
//
// Finalize-and-drop: a bucket with count 1 is already reduced — the
// planner emits no carry for it and sets new_count = 0, so it drops
// out of deeper levels. Indirect-dispatch args: the planner writes
// per-level consumer workgroup counts into the `meta` buffer. See
// ba_planner_v2_bench.template.wgsl.
//
// Timing methodology:
//   - Compile pipeline; warmup (1 dispatch of `windows` workgroups).
//   - For each rep: encode DISP back-to-back dispatches in ONE command
//     encoder; performance.now() around submit + await.
//   - Per-planner time = sample / DISP  (one planner = all windows).
//   - Report min / median / max across reps.
//
// Validation (?validate=1):
//   - Run 1 dispatch; read back every output buffer.
//   - Cross-check against a host-side multi-window bin-pack reference.
//
// Query params:
//   ?c=15&num_bits=254&lambda=32&s=16&tpb=256&wgi=64&disp=64&reps=5&validate=1

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { makeResultsClient } from './results_post.js';

let C = 15; // Pippenger window size in bits
let NUM_BITS = 254; // scalar bit-length (BN254 scalar field)
let LAMBDA = 32; // mean per-bucket count
let S = 16; // chunk size in pairs
let TPB = 256; // workgroup size; one window = TPB * PER_THREAD buckets
let WGI = 64; // consumer-kernel workgroup size (sizes the indirect-dispatch args)
let DISP = 64; // back-to-back dispatches per timed rep
let REPS = 5;
let VALIDATE = false;

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

// Approximate Poisson(λ) sample via the Knuth method. Adequate for
// generating synthetic bucket-count distributions in [0, ~3λ].
function poisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1.0;
  for (;;) {
    k++;
    const u = (rng() >>> 0) / 0x100000000;
    p *= u;
    if (p <= L) break;
    if (k > 200) break;
  }
  return k - 1;
}

// Poisson per-bucket counts for `windows` windows of `bucketsPerWindow`
// buckets each. `offsets` is a per-window prefix sum (each window's
// buckets index into that window's own point pool).
function buildSyntheticCounts(
  windows: number,
  bucketsPerWindow: number,
  lambda: number,
  seed: number,
): { counts: Uint32Array; offsets: Uint32Array } {
  const rng = makeRng(seed);
  const total = windows * bucketsPerWindow;
  const counts = new Uint32Array(total);
  for (let b = 0; b < total; b++) counts[b] = poisson(lambda, rng);
  // Inject a deterministic sprinkle of empty / small buckets (counts
  // 0,1,2,3) so the finalize-and-drop, empty-bucket and small-bucket
  // paths are exercised — Poisson(λ=32) alone never produces them.
  // ~1/16 of buckets; realistic for structured level-0 inputs and for
  // every deeper tree level.
  for (let b = 0; b < total; b += 16) {
    counts[b] = Math.floor(b / 16) % 4;
  }
  const offsets = new Uint32Array(total);
  for (let w = 0; w < windows; w++) {
    let acc = 0;
    for (let i = 0; i < bucketsPerWindow; i++) {
      const b = w * bucketsPerWindow + i;
      offsets[b] = acc;
      acc += counts[b];
    }
  }
  return { counts, offsets };
}

// Host-side multi-window bin-pack reference: produces the exact output
// the GPU planner is expected to write, in the same per-window layout,
// for byte-for-byte ?validate=1 cross-checks. chunksPerWindow /
// carriesPerWindow are sized to the largest window and become the
// per-window output strides passed to the kernel via `params`.
//
// Finalize-and-drop: a bucket with count exactly 1 is already reduced;
// it produces no pair and no carry, and gets new_count = 0.
function buildHostReference(
  counts: Uint32Array,
  offsets: Uint32Array,
  s: number,
  windows: number,
  bucketsPerWindow: number,
  wgi: number,
) {
  // count == 1 -> finalize-and-drop: no carry. count 0 also -> 0.
  const carryOf = (cnt: number): number => (cnt === 1 ? 0 : cnt & 1);
  // Pass 1: per-window pair / carry tallies.
  const perWindowPairs = new Uint32Array(windows);
  const perWindowCarries = new Uint32Array(windows);
  for (let w = 0; w < windows; w++) {
    let p = 0;
    let c = 0;
    for (let i = 0; i < bucketsPerWindow; i++) {
      const cnt = counts[w * bucketsPerWindow + i];
      p += cnt >>> 1;
      c += carryOf(cnt);
    }
    perWindowPairs[w] = p;
    perWindowCarries[w] = c;
  }
  // Uniform per-window output strides = largest window.
  let chunksPerWindow = 1;
  let carriesPerWindow = 1;
  for (let w = 0; w < windows; w++) {
    chunksPerWindow = Math.max(chunksPerWindow, Math.ceil(perWindowPairs[w] / s));
    carriesPerWindow = Math.max(carriesPerWindow, perWindowCarries[w]);
  }
  const chunkPlan = new Uint32Array(windows * chunksPerWindow * s * 2);
  const scatterPlan = new Uint32Array(windows * chunksPerWindow * s);
  const carryPlan = new Uint32Array(windows * carriesPerWindow * 2);
  const newCounts = new Uint32Array(windows * bucketsPerWindow);
  const newOffsets = new Uint32Array(windows * bucketsPerWindow);
  // meta = [3*windows per-window totals] + [6 indirect-dispatch args].
  const meta = new Uint32Array(3 * windows + 6);
  let totalPairs = 0;
  let totalCarries = 0;
  let totalNew = 0;
  // Pass 2: fill each window's plan region.
  for (let w = 0; w < windows; w++) {
    const windowChunkBase = w * chunksPerWindow;
    const windowCarryBase = w * carriesPerWindow;
    let pairOff = 0;
    let carryOff = 0;
    let newOff = 0;
    for (let i = 0; i < bucketsPerWindow; i++) {
      const b = w * bucketsPerWindow + i;
      const cnt = counts[b];
      const pc = cnt >>> 1;
      const cf = carryOf(cnt);
      const nc = pc + cf;
      newCounts[b] = nc;
      newOffsets[b] = newOff;
      const bucketBase = offsets[b];
      for (let j = 0; j < pc; j++) {
        const slotInWindow = pairOff + j;
        const globalChunk = windowChunkBase + Math.floor(slotInWindow / s);
        const slotInChunk = slotInWindow % s;
        const flatSlot = globalChunk * s + slotInChunk;
        chunkPlan[2 * flatSlot + 0] = bucketBase + 2 * j;
        chunkPlan[2 * flatSlot + 1] = bucketBase + 2 * j + 1;
        scatterPlan[flatSlot] = newOff + j;
      }
      if (cf) {
        const cs = windowCarryBase + carryOff;
        carryPlan[2 * cs + 0] = bucketBase + cnt - 1;
        carryPlan[2 * cs + 1] = newOff + pc;
      }
      pairOff += pc;
      carryOff += cf;
      newOff += nc;
    }
    meta[3 * w + 0] = pairOff;
    meta[3 * w + 1] = carryOff;
    meta[3 * w + 2] = newOff;
    totalPairs += pairOff;
    totalCarries += carryOff;
    totalNew += newOff;
  }
  // Indirect-dispatch args (level-wide): workgroup counts for a consumer
  // of workgroup size `wgi` walking the full windows*stride layout.
  const wgiSafe = Math.max(wgi, 1);
  const chunkWgs = Math.ceil((windows * chunksPerWindow) / wgiSafe);
  const carryWgs = Math.ceil((windows * carriesPerWindow) / wgiSafe);
  meta[3 * windows + 0] = chunkWgs;
  meta[3 * windows + 1] = 1;
  meta[3 * windows + 2] = 1;
  meta[3 * windows + 3] = carryWgs;
  meta[3 * windows + 4] = 1;
  meta[3 * windows + 5] = 1;
  return {
    chunkPlan,
    scatterPlan,
    carryPlan,
    newCounts,
    newOffsets,
    meta,
    chunksPerWindow,
    carriesPerWindow,
    chunkWgs,
    carryWgs,
    totalPairs,
    totalCarries,
    totalNew,
  };
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface BenchResult {
  c: number;
  num_bits: number;
  windows: number;
  buckets_per_window: number;
  total_buckets: number;
  lambda: number;
  s: number;
  tpb: number;
  wgi: number;
  per_thread: number;
  chunks_per_window: number;
  carries_per_window: number;
  chunk_dispatch_wgs: number;
  carry_dispatch_wgs: number;
  disp: number;
  reps: number;
  total_pairs: number;
  total_carries: number;
  per_dispatch_us: { min: number; median: number; max: number };
  wall_samples_ms: number[];
  validated: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: Record<string, unknown> | null;
  results: BenchResult[];
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: [], error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;
const resultsClient = makeResultsClient({ page: 'bench-planner' });
(window as unknown as { __runId: string }).__runId = resultsClient.runId;

async function postFinal(): Promise<void> {
  await resultsClient.postResults({
    state: benchState.state,
    params: benchState.params,
    results: benchState.results,
    error: benchState.error,
    log: benchState.log,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
}

const $log = document.getElementById('log') as HTMLDivElement;
function log(level: 'info' | 'ok' | 'err' | 'warn', msg: string) {
  const cls = level === 'ok' ? 'ok' : level === 'err' ? 'err' : level === 'warn' ? 'warn' : '';
  const span = document.createElement('div');
  span.className = cls;
  span.textContent = msg;
  $log.appendChild(span);
  benchState.log.push(`[${level}] ${msg}`);
  console.log(`[bench-planner] ${msg}`);
}

async function compileOne(device: GPUDevice, code: string, key: string, layout: GPUBindGroupLayout): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  let hasError = false;
  const errLines: string[] = [];
  for (const m of info.messages) {
    const line = `[shader ${key}] ${m.type}: ${m.message} (line ${m.lineNum}, col ${m.linePos})`;
    if (m.type === 'error') {
      console.error(line);
      log('err', line);
      errLines.push(line);
      hasError = true;
    } else {
      console.warn(line);
    }
  }
  if (hasError) throw new Error(`WGSL compile failed for ${key}: ${errLines.slice(0, 4).join(' | ')}`);
  return device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
}

async function readbackU32(device: GPUDevice, buf: GPUBuffer, byteLength: number): Promise<Uint32Array> {
  const staging = device.createBuffer({ size: byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, staging, 0, byteLength);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await staging.mapAsync(GPUMapMode.READ);
  const out = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return out;
}

async function runOne(device: GPUDevice, sm: ShaderManager): Promise<BenchResult> {
  const windows = Math.ceil(NUM_BITS / C);
  const bucketsPerWindow = 2 ** (C - 1);
  if (bucketsPerWindow % TPB !== 0) {
    throw new Error(`2^(C-1)=${bucketsPerWindow} must be a positive multiple of TPB=${TPB}`);
  }
  const perThread = bucketsPerWindow / TPB;
  const totalBuckets = windows * bucketsPerWindow;
  log(
    'info',
    `=== C=${C} num_bits=${NUM_BITS} windows=${windows} buckets/window=${bucketsPerWindow} ` +
      `total=${totalBuckets} λ=${LAMBDA} S=${S} TPB=${TPB} WGI=${WGI} PER=${perThread} DISP=${DISP} REPS=${REPS}`,
  );

  const { counts, offsets } = buildSyntheticCounts(windows, bucketsPerWindow, LAMBDA, 0x5fa11);
  let totalActive = 0;
  let cMin = 0xffffffff;
  let cMax = 0;
  let cZeros = 0;
  let cOnes = 0;
  for (let b = 0; b < totalBuckets; b++) {
    totalActive += counts[b];
    if (counts[b] > cMax) cMax = counts[b];
    if (counts[b] < cMin) cMin = counts[b];
    if (counts[b] === 0) cZeros++;
    if (counts[b] === 1) cOnes++;
  }
  log('info', `synthetic counts: min=${cMin} max=${cMax} totalActive=${totalActive} zero=${cZeros} one(finalized)=${cOnes}`);

  const ref = buildHostReference(counts, offsets, S, windows, bucketsPerWindow, WGI);
  log(
    'info',
    `host reference: totalPairs=${ref.totalPairs} totalCarries=${ref.totalCarries} ` +
      `chunksPerWindow=${ref.chunksPerWindow} carriesPerWindow=${ref.carriesPerWindow} ` +
      `dispatchWgs(chunk=${ref.chunkWgs} carry=${ref.carryWgs})`,
  );

  // Output buffers are sized for the host-computed plan. For a real MSM
  // these would be conservative max bounds; here exact host values give
  // tighter validation.
  const mkStorage = (bytes: number, copySrc = false, copyDst = false): GPUBuffer => {
    let usage = GPUBufferUsage.STORAGE;
    if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
    if (copyDst) usage |= GPUBufferUsage.COPY_DST;
    return device.createBuffer({ size: bytes, usage });
  };

  const countsBuf = mkStorage(counts.byteLength, false, true);
  const offsetsBuf = mkStorage(offsets.byteLength, false, true);
  device.queue.writeBuffer(countsBuf, 0, counts);
  device.queue.writeBuffer(offsetsBuf, 0, offsets);

  const chunkPlanBytes = ref.chunkPlan.byteLength;
  const scatterPlanBytes = ref.scatterPlan.byteLength;
  const carryPlanBytes = ref.carryPlan.byteLength;
  const newCountsBytes = ref.newCounts.byteLength;
  const newOffsetsBytes = ref.newOffsets.byteLength;
  const metaBytes = ref.meta.byteLength;

  const chunkPlanBuf = mkStorage(chunkPlanBytes, true);
  const scatterPlanBuf = mkStorage(scatterPlanBytes, true);
  const carryPlanBuf = mkStorage(carryPlanBytes, true);
  const newCountsBuf = mkStorage(newCountsBytes, true);
  const newOffsetsBuf = mkStorage(newOffsetsBytes, true);
  const metaBuf = mkStorage(metaBytes, true);

  const paramsBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(paramsBuf, 0, new Uint32Array([ref.chunksPerWindow, ref.carriesPerWindow, WGI, 0]));

  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const pipeline = await compileOne(
    device,
    sm.gen_ba_planner_v2_bench_shader(TPB, C, NUM_BITS, S, 64),
    `planner-v2-c${C}-T${TPB}-S${S}`,
    layout,
  );
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: countsBuf } },
      { binding: 1, resource: { buffer: offsetsBuf } },
      { binding: 2, resource: { buffer: chunkPlanBuf } },
      { binding: 3, resource: { buffer: scatterPlanBuf } },
      { binding: 4, resource: { buffer: carryPlanBuf } },
      { binding: 5, resource: { buffer: newCountsBuf } },
      { binding: 6, resource: { buffer: newOffsetsBuf } },
      { binding: 7, resource: { buffer: metaBuf } },
      { binding: 8, resource: { buffer: paramsBuf } },
    ],
  });

  // Warmup: one dispatch of `windows` workgroups.
  {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(windows, 1, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  log('info', 'warmup done');

  // Validation: the warmup dispatch already ran; read back and compare.
  let validated = false;
  if (VALIDATE) {
    const gpuMeta = await readbackU32(device, metaBuf, metaBytes);
    const gpuNewCounts = await readbackU32(device, newCountsBuf, newCountsBytes);
    const gpuNewOffsets = await readbackU32(device, newOffsetsBuf, newOffsetsBytes);
    const gpuChunkPlan = await readbackU32(device, chunkPlanBuf, chunkPlanBytes);
    const gpuScatterPlan = await readbackU32(device, scatterPlanBuf, scatterPlanBytes);
    const gpuCarryPlan = await readbackU32(device, carryPlanBuf, carryPlanBytes);

    const mismatches: string[] = [];
    for (let w = 0; w < windows && mismatches.length < 8; w++) {
      if (gpuMeta[3 * w + 0] !== ref.meta[3 * w + 0])
        mismatches.push(`totals[pairs,w=${w}]: gpu=${gpuMeta[3 * w + 0]} ref=${ref.meta[3 * w + 0]}`);
      if (gpuMeta[3 * w + 1] !== ref.meta[3 * w + 1])
        mismatches.push(`totals[carries,w=${w}]: gpu=${gpuMeta[3 * w + 1]} ref=${ref.meta[3 * w + 1]}`);
      if (gpuMeta[3 * w + 2] !== ref.meta[3 * w + 2])
        mismatches.push(`totals[new,w=${w}]: gpu=${gpuMeta[3 * w + 2]} ref=${ref.meta[3 * w + 2]}`);
    }
    for (let i = 0; i < 6; i++) {
      const idx = 3 * windows + i;
      if (gpuMeta[idx] !== ref.meta[idx])
        mismatches.push(`dispatchArgs[${i}]: gpu=${gpuMeta[idx]} ref=${ref.meta[idx]}`);
    }
    for (let b = 0; b < totalBuckets && mismatches.length < 12; b++) {
      if (gpuNewCounts[b] !== ref.newCounts[b])
        mismatches.push(`newCounts[${b}]: gpu=${gpuNewCounts[b]} ref=${ref.newCounts[b]}`);
      if (gpuNewOffsets[b] !== ref.newOffsets[b])
        mismatches.push(`newOffsets[${b}]: gpu=${gpuNewOffsets[b]} ref=${ref.newOffsets[b]}`);
    }
    let cpFails = 0;
    for (let i = 0; i < ref.chunkPlan.length; i++) {
      if (gpuChunkPlan[i] !== ref.chunkPlan[i]) {
        cpFails++;
        if (cpFails <= 3) mismatches.push(`chunkPlan[${i}]: gpu=${gpuChunkPlan[i]} ref=${ref.chunkPlan[i]}`);
      }
    }
    let spFails = 0;
    for (let i = 0; i < ref.scatterPlan.length; i++) {
      if (gpuScatterPlan[i] !== ref.scatterPlan[i]) {
        spFails++;
        if (spFails <= 3) mismatches.push(`scatterPlan[${i}]: gpu=${gpuScatterPlan[i]} ref=${ref.scatterPlan[i]}`);
      }
    }
    let cyFails = 0;
    for (let i = 0; i < ref.carryPlan.length; i++) {
      if (gpuCarryPlan[i] !== ref.carryPlan[i]) {
        cyFails++;
        if (cyFails <= 3) mismatches.push(`carryPlan[${i}]: gpu=${gpuCarryPlan[i]} ref=${ref.carryPlan[i]}`);
      }
    }
    if (mismatches.length === 0 && cpFails === 0 && spFails === 0 && cyFails === 0) {
      validated = true;
      log('ok', 'validation: PASS — GPU planner output byte-equivalent to host reference');
    } else {
      log('err', `validation: FAIL — ${cpFails} chunkPlan, ${spFails} scatterPlan, ${cyFails} carryPlan mismatches; first few:`);
      for (const m of mismatches.slice(0, 12)) log('err', `  ${m}`);
    }
  }

  // Timed runs: DISP back-to-back planner dispatches in one command encoder.
  const samples: number[] = [];
  for (let r = 0; r < REPS; r++) {
    const enc = device.createCommandEncoder();
    for (let d = 0; d < DISP; d++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(windows, 1, 1);
      pass.end();
    }
    const t0 = performance.now();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  const med = median(samples);
  const mn = Math.min(...samples);
  const mx = Math.max(...samples);
  const perDispatchMin = (mn / DISP) * 1000;
  const perDispatchMed = (med / DISP) * 1000;
  const perDispatchMax = (mx / DISP) * 1000;

  log(
    'ok',
    `per-planner: min=${perDispatchMin.toFixed(2)}μs median=${perDispatchMed.toFixed(2)}μs max=${perDispatchMax.toFixed(2)}μs` +
      `  (one planner = all ${windows} windows; total wall min=${mn.toFixed(2)}ms median=${med.toFixed(2)}ms over DISP=${DISP})`,
  );

  countsBuf.destroy();
  offsetsBuf.destroy();
  chunkPlanBuf.destroy();
  scatterPlanBuf.destroy();
  carryPlanBuf.destroy();
  newCountsBuf.destroy();
  newOffsetsBuf.destroy();
  metaBuf.destroy();
  paramsBuf.destroy();

  return {
    c: C,
    num_bits: NUM_BITS,
    windows,
    buckets_per_window: bucketsPerWindow,
    total_buckets: totalBuckets,
    lambda: LAMBDA,
    s: S,
    tpb: TPB,
    wgi: WGI,
    per_thread: perThread,
    chunks_per_window: ref.chunksPerWindow,
    carries_per_window: ref.carriesPerWindow,
    chunk_dispatch_wgs: ref.chunkWgs,
    carry_dispatch_wgs: ref.carryWgs,
    disp: DISP,
    reps: REPS,
    total_pairs: ref.totalPairs,
    total_carries: ref.totalCarries,
    per_dispatch_us: { min: perDispatchMin, median: perDispatchMed, max: perDispatchMax },
    wall_samples_ms: samples,
    validated,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('c')) C = parseInt(qp.get('c')!, 10);
  if (qp.get('num_bits')) NUM_BITS = parseInt(qp.get('num_bits')!, 10);
  if (qp.get('lambda')) LAMBDA = parseInt(qp.get('lambda')!, 10);
  if (qp.get('s')) S = parseInt(qp.get('s')!, 10);
  if (qp.get('tpb')) TPB = parseInt(qp.get('tpb')!, 10);
  if (qp.get('wgi')) WGI = parseInt(qp.get('wgi')!, 10);
  if (qp.get('disp')) DISP = parseInt(qp.get('disp')!, 10);
  if (qp.get('reps')) REPS = parseInt(qp.get('reps')!, 10);
  if (qp.get('validate') === '1') VALIDATE = true;
  return { c: C, num_bits: NUM_BITS, lambda: LAMBDA, s: S, tpb: TPB, wgi: WGI, disp: DISP, reps: REPS, validate: VALIDATE };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const params = parseParams();
    benchState.params = params;
    log('info', `params: ${JSON.stringify(params)}`);
    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');
    const totalBuckets = Math.ceil(NUM_BITS / C) * 2 ** (C - 1);
    const sm = new ShaderManager(4, totalBuckets, BN254_CURVE_CONFIG, false);
    const r = await runOne(device, sm);
    benchState.results.push(r);
    resultsClient.postProgress({ kind: 'planner_done', per_dispatch_us: r.per_dispatch_us, validated: r.validated });
    benchState.state = 'done';
    log('ok', 'done');
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `FATAL: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  }
}

main()
  .catch(e => {
    const msg = e instanceof Error ? e.message : String(e);
    log('err', `unhandled: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  })
  .finally(() => {
    postFinal().catch(() => {});
  });
