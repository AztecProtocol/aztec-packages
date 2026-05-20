/// <reference types="@webgpu/types" />
// Standalone microbench for the GPU bin-packing planner kernel.
// Isolates the planner from the rest of the MSM pipeline so we can
// pin down the minimum time required to build a per-level plan
// (chunk_plan + scatter_plan + carry_plan + new_counts/offsets) on
// the GPU.
//
// Inputs (synthetic, host-built upfront):
//   counts[B]   per-bucket active count drawn from Poisson(lambda).
//   offsets[B+1] prefix sum of counts.
//
// Each planner dispatch is one workgroup of TPB threads. Each thread
// handles PER_THREAD buckets. B = TPB * PER_THREAD.
//
// Timing methodology:
//   - Compile pipeline.
//   - Warmup (1 dispatch).
//   - For each rep:
//       Encode DISP back-to-back dispatches in ONE command encoder.
//       performance.now() right before submit and after await.
//   - Per-planner time = sample / DISP.
//   - Report min, median, max across reps.
//
// Validation (?validate=1):
//   - Run 1 dispatch.
//   - Read back chunk_plan, scatter_plan, carry_plan, new_counts,
//     new_offsets, totals.
//   - Cross-check against a host-side bin-pack reference.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { makeResultsClient } from './results_post.js';

let BUCKETS = 4096;
let LAMBDA = 32; // mean per-bucket count
let S = 16;
let TPB = 256;
let PER_THREAD = 16; // BUCKETS / TPB
let DISP = 128;
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

function buildSyntheticCounts(B: number, lambda: number, seed: number): { counts: Uint32Array; offsets: Uint32Array } {
  const rng = makeRng(seed);
  const counts = new Uint32Array(B);
  for (let b = 0; b < B; b++) counts[b] = poisson(lambda, rng);
  const offsets = new Uint32Array(B + 1);
  for (let b = 0; b < B; b++) offsets[b + 1] = offsets[b] + counts[b];
  return { counts, offsets };
}

// Host-side bin-pack reference. Returns the EXACT same outputs the GPU
// planner is expected to produce (modulo per-bucket atomic-ordering
// differences, which the v2 planner avoids — its order matches host).
function buildHostReference(counts: Uint32Array, offsets: Uint32Array, S: number) {
  const B = counts.length;
  let totalPairs = 0;
  let totalCarries = 0;
  let totalNew = 0;
  const newCounts = new Uint32Array(B);
  const newOffsets = new Uint32Array(B + 1);
  // First pass: compute new_counts and accumulate totals.
  for (let b = 0; b < B; b++) {
    const n = counts[b];
    const pc = Math.floor(n / 2);
    const cf = n & 1;
    newCounts[b] = pc + cf;
    totalPairs += pc;
    totalCarries += cf;
    totalNew += pc + cf;
  }
  for (let b = 0; b < B; b++) newOffsets[b + 1] = newOffsets[b] + newCounts[b];
  const numChunks = Math.max(1, Math.ceil(totalPairs / S));
  const chunkPlan = new Uint32Array(2 * numChunks * S);
  const scatterPlan = new Uint32Array(numChunks * S);
  const carryPlan = new Uint32Array(2 * Math.max(1, totalCarries));
  let pairOff = 0;
  let carryOff = 0;
  for (let b = 0; b < B; b++) {
    const n = counts[b];
    const pc = Math.floor(n / 2);
    const cf = n & 1;
    const bucketBase = offsets[b];
    for (let j = 0; j < pc; j++) {
      const slot = pairOff + j;
      const chunkId = Math.floor(slot / S);
      const slotInChunk = slot % S;
      const cpBase = 2 * (chunkId * S + slotInChunk);
      chunkPlan[cpBase + 0] = bucketBase + 2 * j;
      chunkPlan[cpBase + 1] = bucketBase + 2 * j + 1;
      scatterPlan[chunkId * S + slotInChunk] = newOffsets[b] + j;
    }
    if (cf) {
      carryPlan[2 * carryOff + 0] = bucketBase + n - 1;
      carryPlan[2 * carryOff + 1] = newOffsets[b] + pc;
      carryOff++;
    }
    pairOff += pc;
  }
  return { chunkPlan, scatterPlan, carryPlan, newCounts, newOffsets, totalPairs, totalCarries, totalNew, numChunks };
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface BenchResult {
  buckets: number;
  lambda: number;
  s: number;
  tpb: number;
  per_thread: number;
  disp: number;
  reps: number;
  total_pairs: number;
  total_carries: number;
  num_chunks: number;
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
    state: benchState.state, params: benchState.params, results: benchState.results,
    error: benchState.error, log: benchState.log,
    userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
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
    if (m.type === 'error') { console.error(line); log('err', line); errLines.push(line); hasError = true; }
    else { console.warn(line); }
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
  log('info', `=== B=${BUCKETS} λ=${LAMBDA} S=${S} TPB=${TPB} PER=${PER_THREAD} DISP=${DISP} REPS=${REPS}`);
  if (TPB * PER_THREAD !== BUCKETS) throw new Error(`BUCKETS=${BUCKETS} must equal TPB*PER_THREAD=${TPB * PER_THREAD}`);

  const { counts, offsets } = buildSyntheticCounts(BUCKETS, LAMBDA, 0x5fa11);
  let totalActive = 0;
  let cMin = 99999, cMax = 0;
  for (let b = 0; b < BUCKETS; b++) {
    totalActive += counts[b];
    if (counts[b] > cMax) cMax = counts[b];
    if (counts[b] < cMin) cMin = counts[b];
  }
  log('info', `synthetic counts: min=${cMin} max=${cMax} totalActive=${totalActive}`);

  const ref = buildHostReference(counts, offsets, S);
  log('info', `host reference: totalPairs=${ref.totalPairs} totalCarries=${ref.totalCarries} numChunks=${ref.numChunks}`);

  // Allocate output buffers sized for the host-computed plan.
  // For a real MSM these sizes would be conservative max bounds; here
  // we use exact host values for tighter validation.
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
  const totalsBytes = 16;

  const chunkPlanBuf = mkStorage(chunkPlanBytes, true);
  const scatterPlanBuf = mkStorage(scatterPlanBytes, true);
  const carryPlanBuf = mkStorage(carryPlanBytes, true);
  const newCountsBuf = mkStorage(newCountsBytes, true);
  const newOffsetsBuf = mkStorage(newOffsetsBytes, true);
  const totalsBuf = mkStorage(totalsBytes, true);

  const paramsBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(paramsBuf, 0, new Uint32Array([BUCKETS, S, 0, 0]));

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
  const pipeline = await compileOne(device, sm.gen_ba_planner_v2_bench_shader(TPB, PER_THREAD, S, 64), `planner-v2-T${TPB}-P${PER_THREAD}-S${S}`, layout);
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
      { binding: 7, resource: { buffer: totalsBuf } },
      { binding: 8, resource: { buffer: paramsBuf } },
    ],
  });

  // Warmup.
  {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(1, 1, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  log('info', 'warmup done');

  // Validation (one dispatch, read back, compare against host reference).
  let validated = false;
  if (VALIDATE) {
    const gpuTotals = await readbackU32(device, totalsBuf, totalsBytes);
    const gpuNewCounts = await readbackU32(device, newCountsBuf, newCountsBytes);
    const gpuNewOffsets = await readbackU32(device, newOffsetsBuf, newOffsetsBytes);
    const gpuChunkPlan = await readbackU32(device, chunkPlanBuf, chunkPlanBytes);
    const gpuScatterPlan = await readbackU32(device, scatterPlanBuf, scatterPlanBytes);
    const gpuCarryPlan = await readbackU32(device, carryPlanBuf, carryPlanBytes);

    const mismatches: string[] = [];
    if (gpuTotals[0] !== ref.totalPairs) mismatches.push(`totals[0]: gpu=${gpuTotals[0]} ref=${ref.totalPairs}`);
    if (gpuTotals[1] !== ref.totalCarries) mismatches.push(`totals[1]: gpu=${gpuTotals[1]} ref=${ref.totalCarries}`);
    if (gpuTotals[2] !== ref.totalNew) mismatches.push(`totals[2]: gpu=${gpuTotals[2]} ref=${ref.totalNew}`);
    for (let b = 0; b < BUCKETS && mismatches.length < 8; b++) {
      if (gpuNewCounts[b] !== ref.newCounts[b]) mismatches.push(`newCounts[${b}]: gpu=${gpuNewCounts[b]} ref=${ref.newCounts[b]}`);
      if (gpuNewOffsets[b] !== ref.newOffsets[b]) mismatches.push(`newOffsets[${b}]: gpu=${gpuNewOffsets[b]} ref=${ref.newOffsets[b]}`);
    }
    // chunk_plan/scatter_plan: compare element-wise.
    let cpFails = 0;
    for (let i = 0; i < ref.chunkPlan.length; i++) {
      if (gpuChunkPlan[i] !== ref.chunkPlan[i]) { cpFails++; if (cpFails <= 3) mismatches.push(`chunkPlan[${i}]: gpu=${gpuChunkPlan[i]} ref=${ref.chunkPlan[i]}`); }
    }
    let spFails = 0;
    for (let i = 0; i < ref.scatterPlan.length; i++) {
      if (gpuScatterPlan[i] !== ref.scatterPlan[i]) { spFails++; if (spFails <= 3) mismatches.push(`scatterPlan[${i}]: gpu=${gpuScatterPlan[i]} ref=${ref.scatterPlan[i]}`); }
    }
    let cyFails = 0;
    for (let i = 0; i < 2 * ref.totalCarries; i++) {
      if (gpuCarryPlan[i] !== ref.carryPlan[i]) { cyFails++; if (cyFails <= 3) mismatches.push(`carryPlan[${i}]: gpu=${gpuCarryPlan[i]} ref=${ref.carryPlan[i]}`); }
    }
    if (mismatches.length === 0 && cpFails === 0 && spFails === 0 && cyFails === 0) {
      validated = true;
      log('ok', 'validation: PASS — GPU planner output byte-equivalent to host reference');
    } else {
      log('err', `validation: FAIL — ${cpFails} chunkPlan, ${spFails} scatterPlan, ${cyFails} carryPlan mismatches; first few:`);
      for (const m of mismatches.slice(0, 10)) log('err', `  ${m}`);
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
      pass.dispatchWorkgroups(1, 1, 1);
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
    `  (total wall: min=${mn.toFixed(2)}ms median=${med.toFixed(2)}ms max=${mx.toFixed(2)}ms over DISP=${DISP})`,
  );

  countsBuf.destroy(); offsetsBuf.destroy(); chunkPlanBuf.destroy(); scatterPlanBuf.destroy();
  carryPlanBuf.destroy(); newCountsBuf.destroy(); newOffsetsBuf.destroy(); totalsBuf.destroy();
  paramsBuf.destroy();

  return {
    buckets: BUCKETS, lambda: LAMBDA, s: S, tpb: TPB, per_thread: PER_THREAD, disp: DISP, reps: REPS,
    total_pairs: ref.totalPairs, total_carries: ref.totalCarries, num_chunks: ref.numChunks,
    per_dispatch_us: { min: perDispatchMin, median: perDispatchMed, max: perDispatchMax },
    wall_samples_ms: samples,
    validated,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('buckets')) BUCKETS = parseInt(qp.get('buckets')!, 10);
  if (qp.get('lambda')) LAMBDA = parseInt(qp.get('lambda')!, 10);
  if (qp.get('s')) S = parseInt(qp.get('s')!, 10);
  if (qp.get('tpb')) TPB = parseInt(qp.get('tpb')!, 10);
  if (qp.get('per')) PER_THREAD = parseInt(qp.get('per')!, 10);
  if (qp.get('disp')) DISP = parseInt(qp.get('disp')!, 10);
  if (qp.get('reps')) REPS = parseInt(qp.get('reps')!, 10);
  if (qp.get('validate') === '1') VALIDATE = true;
  return { buckets: BUCKETS, lambda: LAMBDA, s: S, tpb: TPB, per: PER_THREAD, disp: DISP, reps: REPS, validate: VALIDATE };
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
    const sm = new ShaderManager(4, BUCKETS, BN254_CURVE_CONFIG, false);
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
  .catch(e => { const msg = e instanceof Error ? e.message : String(e); log('err', `unhandled: ${msg}`); benchState.state = 'error'; benchState.error = msg; })
  .finally(() => { postFinal().catch(() => {}); });
