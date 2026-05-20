/// <reference types="@webgpu/types" />
// bench-msm-tree-v2 — bin-packed pair-tree MSM bucket-accumulate with
// carry-forward. Eliminates the slow per-bucket tail kernel by packing
// pairs from any combination of buckets into the same chunk.
//
// For each (chunk t, slot k), the disjoint kernel sums (P_{2k}, P_{2k+1}).
// Both operands of each pair come from the SAME bucket; different
// (chunk, slot) entries can come from DIFFERENT buckets. The planner
// guarantees the within-pair bucket invariant.
//
// Per level transition:
//   1. host: per-bucket pair-count + carry, bin-pack into chunks of S.
//   2. marshal-pairs (GPU): gather operands per chunk_plan into chain_buf.
//   3. tree-disjoint (GPU, final=1): chain_buf -> simple strided output.
//   4. scatter-pairs (GPU): outputs -> active_sums_new at per-bucket positions.
//   5. carry-copy (GPU): odd-count carries -> active_sums_new (if any).
//   6. swap active_sums buffers, update counts/offsets.
//
// Terminate when max bucket count == 1.

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

let NPTS = DEFAULT_N;
let BUCKETS = DEFAULT_BUCKETS;
let S = DEFAULT_S;
let WGI = DEFAULT_WGI;

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

function makeSoABuf(device: GPUDevice, M: number, copyDst: boolean, copySrc: boolean): GPUBuffer {
  const bytes = 2 * PG * M * 4 * 4;
  let usage = GPUBufferUsage.STORAGE;
  if (copyDst) usage |= GPUBufferUsage.COPY_DST;
  if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
  return device.createBuffer({ size: bytes, usage });
}

// Build initial active_sums (Level 0). Points are assigned to random
// buckets and laid out bucket-major (bucket b's points at active_sums
// indices offsets[b] .. offsets[b]+counts[b]-1). The last 2 slots [M-2,
// M-1] hold a "pad pair" with distinct x — used to fill chunk-tail
// slots without divide-by-zero.
function buildL0ActiveSums(N: number, B: number, R: bigint, p: bigint, rng: () => number) {
  const M = N + 2;
  const buf = new Uint32Array(2 * PG * M * 4);
  // Generate N + 2 random points.
  const xWords = new Uint32Array(8 * M);
  const yWords = new Uint32Array(8 * M);
  for (let i = 0; i < M; i++) {
    const x = (randomBelow(p, rng) * R) % p;
    const y = (randomBelow(p, rng) * R) % p;
    xWords.set(bigintToPackedU32x8(x), 8 * i);
    yWords.set(bigintToPackedU32x8(y), 8 * i);
  }
  // Ensure pad pair x's differ.
  if (xWords[8 * (M - 2)] === xWords[8 * (M - 1)]) {
    xWords[8 * (M - 1)] ^= 1;
  }
  // Bucket assignment via composed hi/lo (unsigned).
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
  // Pad pair at indices M-2, M-1.
  writeElem(0, M - 2, xWords, 8 * (M - 2));
  writeElem(1, M - 2, yWords, 8 * (M - 2));
  writeElem(0, M - 1, xWords, 8 * (M - 1));
  writeElem(1, M - 1, yWords, 8 * (M - 1));
  return { initBuf: buf, initCounts: counts, initOffsets: offsets, M };
}

// Bin-pack the per-bucket pairs into chunks of S. Returns the per-chunk
// operand-index plan and the per-output destination plan, plus the
// carry plan and next-level (counts, offsets).
function buildLevelPlan(
  counts: Uint32Array,
  offsets: Uint32Array,
  s: number,
  padLIdx: number,
  padRIdx: number,
  discardIdx: number,
) {
  const B = counts.length;
  let totalPairs = 0;
  let totalCarries = 0;
  const newCounts = new Uint32Array(B);
  for (let b = 0; b < B; b++) {
    const n = counts[b];
    const p = Math.floor(n / 2);
    const c = n & 1;
    totalPairs += p;
    totalCarries += c;
    newCounts[b] = p + c;
  }
  const newOffsets = new Uint32Array(B + 1);
  for (let b = 0; b < B; b++) newOffsets[b + 1] = newOffsets[b] + newCounts[b];

  const numChunks = Math.max(1, Math.ceil(totalPairs / s));
  const chunkPlan = new Uint32Array(2 * s * numChunks);
  const scatterPlan = new Uint32Array(s * numChunks);
  const carryPlan = new Uint32Array(2 * Math.max(1, totalCarries));

  for (let i = 0; i < numChunks * s; i++) {
    chunkPlan[2 * i + 0] = padLIdx;
    chunkPlan[2 * i + 1] = padRIdx;
    scatterPlan[i] = discardIdx;
  }

  let slot = 0;
  let carryIdx = 0;
  for (let b = 0; b < B; b++) {
    const n = counts[b];
    const p = Math.floor(n / 2);
    for (let j = 0; j < p; j++) {
      chunkPlan[2 * slot + 0] = offsets[b] + 2 * j;
      chunkPlan[2 * slot + 1] = offsets[b] + 2 * j + 1;
      scatterPlan[slot] = newOffsets[b] + j;
      slot++;
    }
    if (n & 1) {
      carryPlan[2 * carryIdx + 0] = offsets[b] + n - 1;
      carryPlan[2 * carryIdx + 1] = newOffsets[b] + p;
      carryIdx++;
    }
  }
  return { chunkPlan, scatterPlan, carryPlan, newCounts, newOffsets, numChunks, numCarries: totalCarries, totalPairs };
}

interface LevelTiming {
  T: number;
  pairs: number;
  carries: number;
  marshal_ms: number;
  disjoint_ms: number;
  scatter_ms: number;
  carry_ms: number;
}

interface RunResult {
  s: number;
  wgi: number;
  pairs: number;
  buckets: number;
  levels: number;
  total_pair_adds: number;
  total_wall_ms: number;
  level_timings: LevelTiming[];
  ns_per_inpt: number;
  sanity_ok: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { reps: number; n: number; buckets: number; s: number; wgi: number } | null;
  results: RunResult[];
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: [], error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;

const resultsClient = makeResultsClient({ page: 'bench-msm-tree-v2' });
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
  console.log(`[bench-msm-tree-v2] ${msg}`);
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

function ioLayout4(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
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

interface PassSpec { pipeline: GPUComputePipeline; bind: GPUBindGroup; numWgs: number }

// Encode multiple passes into one command encoder, submit once, await
// once. Returns the total wall time. Submit-overhead is paid once
// across all passes — the right way to measure a fused pipeline.
async function timeBatched(device: GPUDevice, passes: PassSpec[]): Promise<number> {
  const enc = device.createCommandEncoder();
  for (const p of passes) {
    const pass = enc.beginComputePass();
    pass.setPipeline(p.pipeline);
    pass.setBindGroup(0, p.bind);
    pass.dispatchWorkgroups(p.numWgs, 1, 1);
    pass.end();
  }
  const t0 = performance.now();
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  return performance.now() - t0;
}

async function runPipeline(device: GPUDevice, sm: ShaderManager, reps: number, R: bigint, p: bigint): Promise<RunResult> {
  log('info', `=== N=${NPTS} B=${BUCKETS} S=${S} WGI=${WGI}`);

  const rng = makeRng(0x9111);
  const { initBuf, initCounts, initOffsets, M } = buildL0ActiveSums(NPTS, BUCKETS, R, p, rng);
  log('info', `built L0 active_sums: M=${M}`);

  // Histogram peek
  let maxC0 = 0, minC0 = NPTS, c0 = 0, smallC = 0;
  for (let b = 0; b < initCounts.length; b++) {
    if (initCounts[b] > maxC0) maxC0 = initCounts[b];
    if (initCounts[b] < minC0) minC0 = initCounts[b];
    if (initCounts[b] === 0) c0++;
    if (initCounts[b] < 32) smallC++;
  }
  log('info', `bucket counts: min=${minC0} max=${maxC0} zero=${c0} small(<32)=${smallC}/${initCounts.length}`);

  const padLIdx = M - 2;
  const padRIdx = M - 1;
  // Use a fixed discard slot: M-2 (same as padLIdx). The discarded output
  // overwrites the pad pair on each level — fine because the pad pair is
  // re-set by buildL0 once and never relied on for correctness; in
  // subsequent levels the planner's pad selection still finds a valid
  // distinct-x pair as long as M-2 and M-1 hold distinct-x data at start.
  // Per level, we re-seed the pad slots by copying first two slots of
  // active_sums_new... actually simpler: use NEW pad slots per level. We
  // need slots that have distinct x in active_sums_new. For pure safety,
  // we'll have the planner discard scatters always go to (M-2) and pad
  // chunks always read from active_sums_OLD's (padLIdx, padRIdx) — which
  // is still ping-pong-stable if we maintain pad slots in both buffers.
  const discardIdx = M - 2;

  // Two ping-pong active_sums buffers, sized M.
  const bufA = makeSoABuf(device, M, true, true);
  const bufB = makeSoABuf(device, M, true, true);
  device.queue.writeBuffer(bufA, 0, initBuf);
  // Mirror the pad pair into bufB so it's available when we ping-pong.
  // Read M-2 and M-1 from initBuf and write them into bufB at the same slots.
  const padPairBytes = new Uint32Array(2 * PG * 2 * 4);
  for (let pl = 0; pl < 2; pl++) {
    for (let v = 0; v < PG; v++) {
      const baseSrc = ((pl * PG + v) * M + (M - 2)) * 4;
      const baseDst = (pl * PG + v) * 2 * 4 + 0;
      padPairBytes[baseDst + 0] = initBuf[baseSrc + 0];
      padPairBytes[baseDst + 1] = initBuf[baseSrc + 1];
      padPairBytes[baseDst + 2] = initBuf[baseSrc + 2];
      padPairBytes[baseDst + 3] = initBuf[baseSrc + 3];
      const baseSrc2 = ((pl * PG + v) * M + (M - 1)) * 4;
      padPairBytes[baseDst + 4] = initBuf[baseSrc2 + 0];
      padPairBytes[baseDst + 5] = initBuf[baseSrc2 + 1];
      padPairBytes[baseDst + 6] = initBuf[baseSrc2 + 2];
      padPairBytes[baseDst + 7] = initBuf[baseSrc2 + 3];
    }
  }
  // padPairBytes layout: same SoA but with M=2. Write into both bufA pad
  // region and bufB pad region. bufA already has them via initBuf; for
  // bufB write a sparse pad pair via a small upload at the pad offset.
  // Simpler: write the entire initBuf into bufB too (initial state matches).
  device.queue.writeBuffer(bufB, 0, initBuf);

  // Scratch buffers.
  const maxL0Chunks = Math.ceil(NPTS / 2 / S) + 1;
  const chainBuf = makeSoABuf(device, 2 * S * maxL0Chunks, false, false);
  const tempOutBuf = makeSoABuf(device, S * maxL0Chunks, false, true);

  // Compile all 4 pipelines.
  const layoutMarshal = ioLayout4(device);
  const layoutDisjoint = ioLayout4(device);
  const layoutScatter = ioLayout4(device);
  const layoutCarry = ioLayout4(device);
  const marshalPipe = await compileOne(device, sm.gen_ba_marshal_pairs_bench_shader(WGI, S), `marshal-pairs-W${WGI}-S${S}`, layoutMarshal);
  const disjointPipe = await compileOne(device, sm.gen_ba_pair_disjoint_tree_bench_shader(WGI, S), `disjoint-W${WGI}-S${S}`, layoutDisjoint);
  const scatterPipe = await compileOne(device, sm.gen_ba_scatter_pairs_bench_shader(WGI, S), `scatter-pairs-W${WGI}-S${S}`, layoutScatter);
  const carryPipe = await compileOne(device, sm.gen_ba_carry_copy_bench_shader(WGI), `carry-W${WGI}`, layoutCarry);
  log('info', '4 pipelines compiled');

  // Iterate.
  let counts = initCounts;
  let offsets = initOffsets;
  let curIn: GPUBuffer = bufA;
  let curOut: GPUBuffer = bufB;
  let totalPairAdds = 0;
  let levelIdx = 0;
  const levelTimings: LevelTiming[] = [];
  const dummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });

  const startTime = performance.now();

  for (;;) {
    let maxCount = 0;
    for (let b = 0; b < counts.length; b++) if (counts[b] > maxCount) maxCount = counts[b];
    if (maxCount <= 1) break;
    if (levelIdx > 24) throw new Error('exceeded safety level cap');

    const plan = buildLevelPlan(counts, offsets, S, padLIdx, padRIdx, discardIdx);
    totalPairAdds += plan.totalPairs;
    const T = plan.numChunks;
    const numWgs = Math.ceil(T / WGI);
    log('info', `L${levelIdx}: T=${T} pairs=${plan.totalPairs} carries=${plan.numCarries} maxCount=${maxCount}`);

    const chunkPlanBuf = device.createBuffer({ size: plan.chunkPlan.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(chunkPlanBuf, 0, plan.chunkPlan);
    const scatterPlanBuf = device.createBuffer({ size: plan.scatterPlan.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(scatterPlanBuf, 0, plan.scatterPlan);
    const carryPlanBuf = device.createBuffer({ size: plan.carryPlan.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(carryPlanBuf, 0, plan.carryPlan);

    const marshalParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(marshalParams, 0, new Uint32Array([T, M, 0, 0]));
    const disjointParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(disjointParams, 0, new Uint32Array([2 * S * T, T, 1, 0])); // final_flag=1
    const scatterParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(scatterParams, 0, new Uint32Array([T, M, 0, 0]));
    const carryParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    if (plan.numCarries > 0) {
      device.queue.writeBuffer(carryParams, 0, new Uint32Array([plan.numCarries, M, M, 0]));
    }

    const marshalBind = device.createBindGroup({
      layout: layoutMarshal, entries: [
        { binding: 0, resource: { buffer: chunkPlanBuf } },
        { binding: 1, resource: { buffer: curIn } },
        { binding: 2, resource: { buffer: chainBuf } },
        { binding: 3, resource: { buffer: marshalParams } },
      ],
    });
    const disjointBind = device.createBindGroup({
      layout: layoutDisjoint, entries: [
        { binding: 0, resource: { buffer: chainBuf } },
        { binding: 1, resource: { buffer: dummy } },
        { binding: 2, resource: { buffer: tempOutBuf } },
        { binding: 3, resource: { buffer: disjointParams } },
      ],
    });
    const scatterBind = device.createBindGroup({
      layout: layoutScatter, entries: [
        { binding: 0, resource: { buffer: scatterPlanBuf } },
        { binding: 1, resource: { buffer: tempOutBuf } },
        { binding: 2, resource: { buffer: curOut } },
        { binding: 3, resource: { buffer: scatterParams } },
      ],
    });
    let carryBind: GPUBindGroup | null = null;
    if (plan.numCarries > 0) {
      carryBind = device.createBindGroup({
        layout: layoutCarry, entries: [
          { binding: 0, resource: { buffer: carryPlanBuf } },
          { binding: 1, resource: { buffer: curIn } },
          { binding: 2, resource: { buffer: curOut } },
          { binding: 3, resource: { buffer: carryParams } },
        ],
      });
    }

    // Bundle this level's 4 kernel dispatches into a single command
    // encoder + single submit + single await. Submit overhead amortises
    // across the level's kernels.
    const passes: PassSpec[] = [
      { pipeline: marshalPipe, bind: marshalBind, numWgs },
      { pipeline: disjointPipe, bind: disjointBind, numWgs },
      { pipeline: scatterPipe, bind: scatterBind, numWgs },
    ];
    if (plan.numCarries > 0 && carryBind) {
      const carryWgs = Math.ceil(plan.numCarries / WGI);
      passes.push({ pipeline: carryPipe, bind: carryBind, numWgs: carryWgs });
    }
    const levelMs = await timeBatched(device, passes);
    levelTimings.push({
      T, pairs: plan.totalPairs, carries: plan.numCarries,
      marshal_ms: 0, disjoint_ms: 0, scatter_ms: 0, carry_ms: 0,  // unused — batched
    });
    log('info', `  L${levelIdx} batched_ms=${levelMs.toFixed(2)} (4 kernels in one submit)`);

    // Cleanup level-local buffers.
    chunkPlanBuf.destroy();
    scatterPlanBuf.destroy();
    carryPlanBuf.destroy();
    marshalParams.destroy();
    disjointParams.destroy();
    scatterParams.destroy();
    carryParams.destroy();

    counts = plan.newCounts;
    offsets = plan.newOffsets;
    [curIn, curOut] = [curOut, curIn];
    levelIdx++;
  }

  const wall = performance.now() - startTime;
  const sanity = await readNonZero(device, curIn, 8);

  bufA.destroy();
  bufB.destroy();
  chainBuf.destroy();
  tempOutBuf.destroy();
  dummy.destroy();

  const nsPerInpt = (wall * 1e6) / NPTS;
  log(
    sanity ? 'ok' : 'err',
    `pipeline: ${levelIdx} levels, ${totalPairAdds} pair-adds, total_wall=${wall.toFixed(2)}ms, ns/in-pt=${nsPerInpt.toFixed(2)}, sanity=${sanity ? 'OK' : 'FAIL'}`,
  );

  return {
    s: S, wgi: WGI, pairs: NPTS, buckets: BUCKETS, levels: levelIdx,
    total_pair_adds: totalPairAdds, total_wall_ms: wall, level_timings: levelTimings,
    ns_per_inpt: nsPerInpt, sanity_ok: sanity,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  const reps = parseInt(qp.get('reps') ?? '3', 10);
  if (!Number.isFinite(reps) || reps <= 0 || reps > 50) throw new Error(`?reps must be in (0, 50]`);
  if (qp.get('n')) NPTS = parseInt(qp.get('n')!, 10);
  if (qp.get('buckets')) BUCKETS = parseInt(qp.get('buckets')!, 10);
  if (qp.get('s')) S = parseInt(qp.get('s')!, 10);
  if (qp.get('wgi')) WGI = parseInt(qp.get('wgi')!, 10);
  return { reps, n: NPTS, buckets: BUCKETS, s: S, wgi: WGI };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const params = parseParams();
    benchState.params = params;
    log('info', `params: reps=${params.reps} n=${params.n} buckets=${params.buckets} s=${params.s} wgi=${params.wgi}`);
    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');
    const p = BN254_BASE_FIELD;
    const miscParams = compute_misc_params(p, 13);
    const R = miscParams.r;
    const sm = new ShaderManager(4, NPTS, BN254_CURVE_CONFIG, false);
    const r = await runPipeline(device, sm, params.reps, R, p);
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
