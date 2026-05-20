/// <reference types="@webgpu/types" />
// bench-msm-tree-v3 — GPU-side planner + fused super-kernel.
//
// Per level (all GPU, encoded into one command list):
//   1. Reset totals atomic counter to 0.
//   2. Pre-pad chunk_plan + scatter_plan + carry_plan to safe values.
//   3. Planner kernel: 1 thread per bucket -> writes chunk_plan,
//      scatter_plan, carry_plan, new_counts, new_offsets via atomic
//      offset reservation.
//   4. Fused super-kernel: marshal + disjoint + scatter in one pass.
//      Reads chunk_plan + scatter_plan + active_sums_old; writes
//      active_sums_new.
//   5. Carry kernel: copies odd-count carries from active_sums_old to
//      active_sums_new.
//   6. Swap active_sums buffers, swap counts/offsets buffers.
//
// Over-dispatch L_MAX levels (default 8 for Poisson(λ=32) where max
// bucket count is ~50-60, requiring log2(60) = 6 levels). Extra levels
// with all-count-1 input are no-ops at the kernel level (planner
// produces zero pairs; fused kernel dispatched with 0 threads via
// host-side numWgs=0; carry kernel just copies the single-element-
// per-bucket data forward).
//
// Single submit across all 3*L_MAX kernel dispatches. Zero host-GPU
// round-trips between scalar-decompose and final readback.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';

const PG = 2;
const DEFAULT_N = 1 << 17;
const DEFAULT_BUCKETS = 1 << 12;
const DEFAULT_S = 16;
const DEFAULT_WGI = 64;
const DEFAULT_LEVELS = 8;

let NPTS = DEFAULT_N;
let BUCKETS = DEFAULT_BUCKETS;
let S = DEFAULT_S;
let WGI = DEFAULT_WGI;
let LEVELS = DEFAULT_LEVELS;

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
  for (;;) {
    let v = 0n;
    for (let i = 0; i < byteLen; i++) v = (v << 8n) | BigInt(rng() & 0xff);
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v > 0n && v < p) return v;
  }
}

function bigintToPackedU32x8(v: bigint): Uint32Array {
  const w = new Uint32Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    w[i] = Number(x & 0xffffffffn);
    x >>= 32n;
  }
  return w;
}

// Build initial active_sums and per-bucket counts/offsets (level 0).
function buildL0(N: number, B: number, R: bigint, p: bigint, rng: () => number) {
  const M = N + 2;
  const buf = new Uint32Array(2 * PG * M * 4);
  const xWords = new Uint32Array(8 * M);
  const yWords = new Uint32Array(8 * M);
  for (let i = 0; i < M; i++) {
    const x = (randomBelow(p, rng) * R) % p;
    const y = (randomBelow(p, rng) * R) % p;
    xWords.set(bigintToPackedU32x8(x), 8 * i);
    yWords.set(bigintToPackedU32x8(y), 8 * i);
  }
  if (xWords[8 * (M - 2)] === xWords[8 * (M - 1)]) xWords[8 * (M - 1)] ^= 1;
  const bucket = new Uint32Array(N);
  const counts = new Uint32Array(B);
  for (let i = 0; i < N; i++) {
    const hi = (rng() >>> 16) & 0xffff;
    const lo = (rng() >>> 16) & 0xffff;
    const v = hi * 0x10000 + lo;
    const b = v % B;
    bucket[i] = b;
    counts[b]++;
  }
  const offsets = new Uint32Array(B + 1);
  for (let b = 0; b < B; b++) offsets[b + 1] = offsets[b] + counts[b];
  const cursor = new Uint32Array(B);
  const writeElem = (planeIdx: number, dstIdx: number, words: Uint32Array, srcOff: number) => {
    for (let v = 0; v < PG; v++) {
      const base = ((planeIdx * PG + v) * M + dstIdx) * 4;
      buf[base + 0] = words[srcOff + 4 * v + 0];
      buf[base + 1] = words[srcOff + 4 * v + 1];
      buf[base + 2] = words[srcOff + 4 * v + 2];
      buf[base + 3] = words[srcOff + 4 * v + 3];
    }
  };
  for (let i = 0; i < N; i++) {
    const b = bucket[i];
    const dst = offsets[b] + cursor[b]++;
    writeElem(0, dst, xWords, 8 * i);
    writeElem(1, dst, yWords, 8 * i);
  }
  writeElem(0, M - 2, xWords, 8 * (M - 2));
  writeElem(1, M - 2, yWords, 8 * (M - 2));
  writeElem(0, M - 1, xWords, 8 * (M - 1));
  writeElem(1, M - 1, yWords, 8 * (M - 1));
  return { initBuf: buf, initCounts: counts, initOffsets: offsets, M };
}

function makeSoABuf(device: GPUDevice, M: number, copyDst: boolean, copySrc: boolean): GPUBuffer {
  const bytes = 2 * PG * M * 4 * 4;
  let usage = GPUBufferUsage.STORAGE;
  if (copyDst) usage |= GPUBufferUsage.COPY_DST;
  if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
  return device.createBuffer({ size: bytes, usage });
}

interface RunResult {
  s: number;
  wgi: number;
  pairs: number;
  buckets: number;
  levels_run: number;
  gpu_wall_ms: number;
  ns_per_inpt: number;
  sanity_ok: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { n: number; buckets: number; s: number; wgi: number; levels: number } | null;
  results: RunResult[];
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: [], error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;

const resultsClient = makeResultsClient({ page: 'bench-msm-tree-v3' });
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
  console.log(`[bench-msm-tree-v3] ${msg}`);
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

async function readNonZero(device: GPUDevice, buf: GPUBuffer, u32Count: number): Promise<boolean> {
  const bytes = u32Count * 4;
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await staging.mapAsync(GPUMapMode.READ);
  const u32 = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  for (let i = 0; i < u32.length; i++) if (u32[i] !== 0) return true;
  return false;
}

async function runPipeline(device: GPUDevice, sm: ShaderManager, R: bigint, p: bigint): Promise<RunResult> {
  log('info', `=== N=${NPTS} B=${BUCKETS} S=${S} WGI=${WGI} LEVELS=${LEVELS}`);

  const rng = makeRng(0xc711);
  const { initBuf, initCounts, initOffsets, M } = buildL0(NPTS, BUCKETS, R, p, rng);
  log('info', `L0 active_sums: M=${M}, B=${BUCKETS}`);

  // Histogram peek
  let maxC = 0, minC = NPTS, smallC = 0;
  for (let b = 0; b < initCounts.length; b++) {
    if (initCounts[b] > maxC) maxC = initCounts[b];
    if (initCounts[b] < minC) minC = initCounts[b];
    if (initCounts[b] < 32) smallC++;
  }
  log('info', `bucket counts: min=${minC} max=${maxC} small(<32)=${smallC}/${BUCKETS}`);

  // Plan-buffer sizing — must accommodate L0 max chunks.
  // At L0: total pairs <= N/2 = 65536; max chunks = ceil(65536/S) = 4096.
  // At deeper levels: shrinks. So max-allocated for L0.
  const MAX_CHUNKS = Math.ceil(NPTS / 2 / S) + 16;  // pad
  const MAX_PAIR_SLOTS = MAX_CHUNKS * S;
  const MAX_CARRIES = BUCKETS;  // at most one carry per bucket

  const mkStorage = (bytes: number, copyDst = true, copySrc = false): GPUBuffer => {
    let usage = GPUBufferUsage.STORAGE;
    if (copyDst) usage |= GPUBufferUsage.COPY_DST;
    if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
    return device.createBuffer({ size: bytes, usage });
  };

  // Ping-pong active_sums.
  const bufA = makeSoABuf(device, M, true, true);
  const bufB = makeSoABuf(device, M, true, true);
  device.queue.writeBuffer(bufA, 0, initBuf);
  device.queue.writeBuffer(bufB, 0, initBuf);  // mirror initial for pad-pair availability

  // Plan buffers (reused per level).
  const chunkPlanBuf = mkStorage(2 * MAX_PAIR_SLOTS * 4);
  const scatterPlanBuf = mkStorage(MAX_PAIR_SLOTS * 4);
  const carryPlanBuf = mkStorage(2 * MAX_CARRIES * 4);

  // Per-level counts/offsets buffers (ping-pong).
  const countsA = mkStorage(BUCKETS * 4);
  const countsB = mkStorage(BUCKETS * 4);
  const offsetsA = mkStorage((BUCKETS + 1) * 4);
  const offsetsB = mkStorage((BUCKETS + 1) * 4);
  device.queue.writeBuffer(countsA, 0, initCounts);
  device.queue.writeBuffer(offsetsA, 0, initOffsets);

  // Totals atomic counter [pair_off_accum, carry_off_accum, new_off_accum, _]
  const totalsBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Pre-padded chunk_plan / scatter_plan / carry_plan templates.
  // Pad slots all point to safe values:
  //   chunk_plan pad pair  = (M-2, M-1)        — known distinct-x in active_sums
  //   scatter_plan pad dst = M-2                — discard target (within active_sums_new)
  //   carry_plan pad src   = M-2, dst = M-2     — no-op self-copy of pad slot
  const padChunkPlan = new Uint32Array(2 * MAX_PAIR_SLOTS);
  const padScatterPlan = new Uint32Array(MAX_PAIR_SLOTS);
  const padCarryPlan = new Uint32Array(2 * MAX_CARRIES);
  for (let i = 0; i < MAX_PAIR_SLOTS; i++) {
    padChunkPlan[2 * i + 0] = M - 2;
    padChunkPlan[2 * i + 1] = M - 1;
    padScatterPlan[i] = M - 2;
  }
  for (let i = 0; i < MAX_CARRIES; i++) {
    padCarryPlan[2 * i + 0] = M - 2;
    padCarryPlan[2 * i + 1] = M - 2;
  }

  // Per-level params (reused).
  const plannerParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const fusedParams: GPUBuffer[] = [];
  const carryParams: GPUBuffer[] = [];
  for (let i = 0; i < LEVELS; i++) {
    fusedParams.push(device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    carryParams.push(device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
  }
  device.queue.writeBuffer(plannerParams, 0, new Uint32Array([BUCKETS, S, 0, 0]));

  // Layouts.
  const plannerLayout = device.createBindGroupLayout({
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
  const fusedLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const carryLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });

  const plannerPipe = await compileOne(device, sm.gen_ba_planner_bench_shader(WGI, S, 64), `planner-W${WGI}-S${S}`, plannerLayout);
  const fusedPipe = await compileOne(device, sm.gen_ba_fused_super_bench_shader(WGI, S), `fused-W${WGI}-S${S}`, fusedLayout);
  const carryPipe = await compileOne(device, sm.gen_ba_carry_copy_bench_shader(WGI), `carry-W${WGI}`, carryLayout);
  log('info', '3 pipelines compiled');

  // Encode all level passes into one command encoder.
  // Per level k:
  //   - clear totalsBuf to zero (writeBuffer queued before submit)
  //   - clear plan buffers to pad templates (writeBuffer queued)
  //   - dispatch planner
  //   - dispatch fused (numWgs = ceil(MAX_CHUNKS / WGI) — over-provisioned;
  //     idle threads early-out via if (t >= T) check)
  //   - dispatch carry (numWgs = ceil(MAX_CARRIES / WGI) — over-provisioned)
  //   - swap counts/offsets via bind group selection on next level

  const enc = device.createCommandEncoder();
  let curCountsIn: GPUBuffer = countsA;
  let curCountsOut: GPUBuffer = countsB;
  let curOffsetsIn: GPUBuffer = offsetsA;
  let curOffsetsOut: GPUBuffer = offsetsB;
  let curActiveIn: GPUBuffer = bufA;
  let curActiveOut: GPUBuffer = bufB;

  const numWgsPlanner = Math.ceil(BUCKETS / WGI);
  const numWgsFused = Math.ceil(MAX_CHUNKS / WGI);
  const numWgsCarry = Math.ceil(MAX_CARRIES / WGI);
  log('info', `dispatch sizes: planner=${numWgsPlanner} fused=${numWgsFused} carry=${numWgsCarry}`);

  // Pre-write per-level params (since they depend on iteration index).
  for (let lv = 0; lv < LEVELS; lv++) {
    // params.x = T_fused = MAX_CHUNKS (over-provisioned; planner-written
    // chunk_plan/scatter_plan trailers point to pad => safe early-out
    // is implicit because pads do harmless add+discard)
    device.queue.writeBuffer(fusedParams[lv], 0, new Uint32Array([MAX_CHUNKS, M, M, 0]));
    device.queue.writeBuffer(carryParams[lv], 0, new Uint32Array([MAX_CARRIES, M, M, 0]));
  }

  // Pre-pad plan buffers (only need to do once; planner overwrites real
  // entries each level, and the pre-pad is stable across levels because
  // pad slots remain pad-valued).
  device.queue.writeBuffer(chunkPlanBuf, 0, padChunkPlan);
  device.queue.writeBuffer(scatterPlanBuf, 0, padScatterPlan);
  device.queue.writeBuffer(carryPlanBuf, 0, padCarryPlan);

  // Bind groups built per level (to swap counts/offsets/active buffers).
  for (let lv = 0; lv < LEVELS; lv++) {
    // Reset totals atomic counter before this level's planner.
    device.queue.writeBuffer(totalsBuf, 0, new Uint32Array([0, 0, 0, 0]));
    // Re-pad plan buffers (planner overwrites only real entries; the
    // pad regions get re-padded between levels to clean any leftover
    // real entries from the prior level).
    device.queue.writeBuffer(chunkPlanBuf, 0, padChunkPlan);
    device.queue.writeBuffer(scatterPlanBuf, 0, padScatterPlan);
    device.queue.writeBuffer(carryPlanBuf, 0, padCarryPlan);

    const plannerBind = device.createBindGroup({
      layout: plannerLayout,
      entries: [
        { binding: 0, resource: { buffer: curCountsIn } },
        { binding: 1, resource: { buffer: curOffsetsIn } },
        { binding: 2, resource: { buffer: chunkPlanBuf } },
        { binding: 3, resource: { buffer: scatterPlanBuf } },
        { binding: 4, resource: { buffer: carryPlanBuf } },
        { binding: 5, resource: { buffer: totalsBuf } },
        { binding: 6, resource: { buffer: curCountsOut } },
        { binding: 7, resource: { buffer: curOffsetsOut } },
        { binding: 8, resource: { buffer: plannerParams } },
      ],
    });
    const fusedBind = device.createBindGroup({
      layout: fusedLayout,
      entries: [
        { binding: 0, resource: { buffer: chunkPlanBuf } },
        { binding: 1, resource: { buffer: scatterPlanBuf } },
        { binding: 2, resource: { buffer: curActiveIn } },
        { binding: 3, resource: { buffer: curActiveOut } },
        { binding: 4, resource: { buffer: fusedParams[lv] } },
      ],
    });
    const carryBind = device.createBindGroup({
      layout: carryLayout,
      entries: [
        { binding: 0, resource: { buffer: carryPlanBuf } },
        { binding: 1, resource: { buffer: curActiveIn } },
        { binding: 2, resource: { buffer: curActiveOut } },
        { binding: 3, resource: { buffer: carryParams[lv] } },
      ],
    });

    // Encode the 3 passes for this level.
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(plannerPipe);
      pass.setBindGroup(0, plannerBind);
      pass.dispatchWorkgroups(numWgsPlanner, 1, 1);
      pass.end();
    }
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(fusedPipe);
      pass.setBindGroup(0, fusedBind);
      pass.dispatchWorkgroups(numWgsFused, 1, 1);
      pass.end();
    }
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(carryPipe);
      pass.setBindGroup(0, carryBind);
      pass.dispatchWorkgroups(numWgsCarry, 1, 1);
      pass.end();
    }

    // Swap for next level.
    [curCountsIn, curCountsOut] = [curCountsOut, curCountsIn];
    [curOffsetsIn, curOffsetsOut] = [curOffsetsOut, curOffsetsIn];
    [curActiveIn, curActiveOut] = [curActiveOut, curActiveIn];
  }

  // Single submit + single await for the entire bucket-accumulate.
  const t0 = performance.now();
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  const gpuWall = performance.now() - t0;

  // Sanity: at least one element of the final active_sums must be non-zero.
  const sanity = await readNonZero(device, curActiveIn, 8);
  const nsPerInpt = (gpuWall * 1e6) / NPTS;

  log(
    sanity ? 'ok' : 'err',
    `v3 pipeline: ${LEVELS} levels over-dispatched, single submit GPU wall=${gpuWall.toFixed(2)}ms, ns/in-pt=${nsPerInpt.toFixed(2)}, sanity=${sanity ? 'OK' : 'FAIL'}`,
  );

  // Cleanup
  bufA.destroy(); bufB.destroy();
  chunkPlanBuf.destroy(); scatterPlanBuf.destroy(); carryPlanBuf.destroy();
  countsA.destroy(); countsB.destroy(); offsetsA.destroy(); offsetsB.destroy();
  totalsBuf.destroy();
  plannerParams.destroy();
  for (const b of fusedParams) b.destroy();
  for (const b of carryParams) b.destroy();

  return {
    s: S, wgi: WGI, pairs: NPTS, buckets: BUCKETS,
    levels_run: LEVELS, gpu_wall_ms: gpuWall, ns_per_inpt: nsPerInpt, sanity_ok: sanity,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('n')) NPTS = parseInt(qp.get('n')!, 10);
  if (qp.get('buckets')) BUCKETS = parseInt(qp.get('buckets')!, 10);
  if (qp.get('s')) S = parseInt(qp.get('s')!, 10);
  if (qp.get('wgi')) WGI = parseInt(qp.get('wgi')!, 10);
  if (qp.get('levels')) LEVELS = parseInt(qp.get('levels')!, 10);
  return { n: NPTS, buckets: BUCKETS, s: S, wgi: WGI, levels: LEVELS };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const params = parseParams();
    benchState.params = params;
    log('info', `params: n=${params.n} buckets=${params.buckets} s=${params.s} wgi=${params.wgi} levels=${params.levels}`);
    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');
    const p = BN254_BASE_FIELD;
    const miscParams = compute_misc_params(p, 13);
    const R = miscParams.r;
    const sm = new ShaderManager(4, NPTS, BN254_CURVE_CONFIG, false);
    const r = await runPipeline(device, sm, R, p);
    benchState.results.push(r);
    resultsClient.postProgress({ kind: 'pipeline_done', ns_per_inpt: r.ns_per_inpt, sanity_ok: r.sanity_ok });
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
