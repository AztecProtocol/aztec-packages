/// <reference types="@webgpu/types" />
// bench-msm-tree — end-to-end MSM bucket-accumulate benchmark for the
// multi-level pair-tree pipeline:
//   1. marshal-l0          (CSR + chunk_plan + point_pool -> strided chain_buf)
//   2. tree-disjoint level 0 (chain_buf -> level-1 input layout, in-place via ping-pong)
//   3. tree-disjoint level 1 (continues in ping-pong)
//      ...
//   level L-1 (final): tree-disjoint with `final` flag -> simple strided output
//   4. tail kernel         (small buckets count<2*S -> one sum each)
//
// Reports per-stage and combined ns/in-pt for the full bucket-accumulate
// over N points distributed across B buckets.
//
// Modes:
//   ?mode=uniform : every bucket has exactly 2*S = 32 points (clean
//                   multi-level test, no tail).
//   ?mode=skewed  : Poisson-distributed via uniform random scalar
//                   assignment. Main pair-tree handles buckets with
//                   count >= 2*S; tail kernel handles the rest.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';

const PG = 2;
const DEFAULT_N = 1 << 17;        // 131072 points
const DEFAULT_BUCKETS = 1 << 12;  // 4096 buckets -> uniform avg 32 = 2*S
const DEFAULT_S = 16;
const DEFAULT_WGI = 64;
const DEFAULT_DISP = 4;           // dispatch amortisation per timed sample
const DEFAULT_MODE = 'uniform' as const;

let NPTS = DEFAULT_N;
let BUCKETS = DEFAULT_BUCKETS;
let S = DEFAULT_S;
let WGI = DEFAULT_WGI;
let DISP = DEFAULT_DISP;
let MODE: 'uniform' | 'skewed' = DEFAULT_MODE;

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

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function buildPointPool(poolSize: number, R: bigint, p: bigint, rng: () => number): Uint32Array {
  const M = poolSize;
  const buf = new Uint32Array(2 * PG * M * 4);
  for (let e = 0; e < M; e++) {
    const x = (randomBelow(p, rng) * R) % p;
    const y = (randomBelow(p, rng) * R) % p;
    const wx = bigintToPackedU32x8(x);
    const wy = bigintToPackedU32x8(y);
    for (let v = 0; v < PG; v++) {
      const baseX = ((0 * PG + v) * M + e) * 4;
      const baseY = ((1 * PG + v) * M + e) * 4;
      buf[baseX + 0] = wx[4 * v + 0];
      buf[baseX + 1] = wx[4 * v + 1];
      buf[baseX + 2] = wx[4 * v + 2];
      buf[baseX + 3] = wx[4 * v + 3];
      buf[baseY + 0] = wy[4 * v + 0];
      buf[baseY + 1] = wy[4 * v + 1];
      buf[baseY + 2] = wy[4 * v + 2];
      buf[baseY + 3] = wy[4 * v + 3];
    }
  }
  return buf;
}

interface CSR {
  csrIndices: Uint32Array; // 1-based: index 0 reserved (decoy/unused)
  offsets: Uint32Array;
  counts: Uint32Array;
}

function buildUniformCSR(N: number, B: number, perBucket: number): CSR {
  if (N !== B * perBucket) {
    throw new Error(`uniform mode requires N=${N} = B*${perBucket}=${B * perBucket}`);
  }
  const counts = new Uint32Array(B);
  const offsets = new Uint32Array(B + 1);
  const csrIndices = new Uint32Array(N);
  for (let b = 0; b < B; b++) {
    counts[b] = perBucket;
    offsets[b + 1] = offsets[b] + perBucket;
    for (let i = 0; i < perBucket; i++) {
      csrIndices[offsets[b] + i] = b * perBucket + i + 1; // 1-based
    }
  }
  return { csrIndices, offsets, counts };
}

function buildSkewedCSR(N: number, B: number, rng: () => number): CSR {
  const bucket = new Uint32Array(N);
  const counts = new Uint32Array(B);
  // LCG low bits have short periods; mix high bits of two calls into
  // the bucket index to get a real uniform-random scalar assignment
  // (so Poisson-skewed counts, not perfectly-even-with-cyclic-RNG).
  for (let i = 0; i < N; i++) {
    const hi = (rng() >>> 16) & 0xffff;
    const lo = (rng() >>> 16) & 0xffff;
    const b = ((hi << 16) | lo) % B;
    bucket[i] = b;
    counts[b]++;
  }
  const offsets = new Uint32Array(B + 1);
  for (let b = 0; b < B; b++) offsets[b + 1] = offsets[b] + counts[b];
  const cursor = new Uint32Array(B);
  const csrIndices = new Uint32Array(N);
  for (let i = 0; i < N; i++) {
    const b = bucket[i];
    csrIndices[offsets[b] + cursor[b]++] = i + 1; // 1-based
  }
  return { csrIndices, offsets, counts };
}

// Split each bucket into (a) full 2*S chunks for the level-0 marshal +
// pair-tree pass and (b) a tail of count mod 2*S points for the tail
// kernel. Returns a chunk_plan for the main pipeline and a tail_plan
// for the tail kernel.
//
// Only buckets where count >= 2*S contribute to the main path. Each
// contributes floor(count / (2*S)) chunks of exactly 2*S points each.
// Remaining count mod 2*S points go to the tail. Buckets with
// count < 2*S go entirely to the tail. NOTE: for v1, the per-bucket
// "extra full-2S chunks already reduced via main path" is *not*
// re-folded into a single per-bucket sum; this would matter for
// correctness but for the bench we just measure dispatch wall-clock.
function buildChunkAndTailPlans(
  offsets: Uint32Array,
  counts: Uint32Array,
  S: number,
): { chunkPlan: Uint32Array; T: number; tailPlan: Uint32Array; TT: number; mainPoints: number; tailPoints: number } {
  const B = counts.length;
  const blkSize = 2 * S;
  let T = 0;
  let TT = 0;
  let mainPts = 0;
  let tailPts = 0;
  for (let b = 0; b < B; b++) {
    const c = counts[b];
    const nMain = Math.floor(c / blkSize);
    T += nMain;
    mainPts += nMain * blkSize;
    const remain = c - nMain * blkSize;
    if (remain > 0) {
      TT++;
      tailPts += remain;
    }
  }
  const chunkPlan = new Uint32Array(2 * T);
  const tailPlan = new Uint32Array(3 * TT);
  let t = 0;
  let tt = 0;
  for (let b = 0; b < B; b++) {
    const c = counts[b];
    const nMain = Math.floor(c / blkSize);
    for (let k = 0; k < nMain; k++) {
      chunkPlan[2 * t + 0] = b;
      chunkPlan[2 * t + 1] = offsets[b] + k * blkSize;
      t++;
    }
    const remain = c - nMain * blkSize;
    if (remain > 0) {
      tailPlan[3 * tt + 0] = b;
      tailPlan[3 * tt + 1] = offsets[b] + nMain * blkSize;
      tailPlan[3 * tt + 2] = remain;
      tt++;
    }
  }
  return { chunkPlan, T, tailPlan, TT, mainPoints: mainPts, tailPoints: tailPts };
}

interface KernelTiming {
  median_ms: number;
  min_ms: number;
  max_ms: number;
  samples_ms: number[];
}

async function compile(
  device: GPUDevice,
  code: string,
  cacheKey: string,
  layout: GPUBindGroupLayout,
): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  let hasError = false;
  const errLines: string[] = [];
  for (const m of info.messages) {
    const line = `[shader ${cacheKey}] ${m.type}: ${m.message} (line ${m.lineNum}, col ${m.linePos})`;
    if (m.type === 'error') {
      console.error(line);
      log('err', line);
      errLines.push(line);
      hasError = true;
    } else {
      console.warn(line);
    }
  }
  if (hasError) throw new Error(`WGSL compile failed for ${cacheKey}: ${errLines.slice(0, 4).join(' | ')}`);
  return device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
}

function marshalLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
}

function treeKernelLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
}

function tailLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
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

async function timeDispatch(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bind: GPUBindGroup,
  numWgs: number,
  reps: number,
  passes: number,
): Promise<KernelTiming> {
  // warmup
  {
    const enc = device.createCommandEncoder();
    for (let p = 0; p < passes; p++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(numWgs, 1, 1);
      pass.end();
    }
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const enc = device.createCommandEncoder();
    for (let p = 0; p < passes; p++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(numWgs, 1, 1);
      pass.end();
    }
    const t0 = performance.now();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  return {
    median_ms: median(samples),
    min_ms: Math.min(...samples),
    max_ms: Math.max(...samples),
    samples_ms: samples,
  };
}

interface RunResult {
  s: number;
  wgi: number;
  disp: number;
  pairs: number;
  buckets: number;
  mode: string;
  T_main: number;
  T_tail: number;
  main_points: number;
  tail_points: number;
  levels: number;
  marshal_ms: number;
  level_ms: number[];
  tail_ms: number;
  total_ms: number;
  marshal_ns_per_inpt: number;
  pair_tree_ns_per_inpt: number;
  tail_ns_per_inpt: number;
  combined_ns_per_inpt: number;
  sanity_ok: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { reps: number; n: number; buckets: number; s: number; wgi: number; disp: number; mode: string } | null;
  results: RunResult[];
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

const resultsClient = makeResultsClient({ page: 'bench-msm-tree' });
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
  console.log(`[bench-msm-tree] ${msg}`);
}

async function runPipeline(
  device: GPUDevice,
  sm: ShaderManager,
  reps: number,
  R: bigint,
  p: bigint,
): Promise<RunResult> {
  log('info', `=== mode=${MODE} N=${NPTS} B=${BUCKETS} S=${S} WGI=${WGI} DISP=${DISP}`);

  const rng = makeRng(0x4711);
  const poolSize = NPTS + 1; // index 0 reserved (1-based)
  const poolU32 = buildPointPool(poolSize, R, p, rng);

  const csr: CSR =
    MODE === 'uniform'
      ? buildUniformCSR(NPTS, BUCKETS, NPTS / BUCKETS)
      : buildSkewedCSR(NPTS, BUCKETS, rng);

  const offsets = csr.offsets;
  const counts = csr.counts;
  const { chunkPlan, T, tailPlan, TT, mainPoints, tailPoints } = buildChunkAndTailPlans(offsets, counts, S);
  log(
    'info',
    `plan: main T=${T} chunks (${mainPoints} pts) | tail TT=${TT} threads (${tailPoints} pts) | dropped=${NPTS - mainPoints - tailPoints}`,
  );
  if (T === 0 && TT === 0) throw new Error('plan is empty');

  // Determine number of pair-tree levels. Each level halves T and
  // every level produces T*S outputs. We stop when T*S equals the
  // distinct-bucket count contributing to the main path (= one sum
  // per bucket). Iterating further would start pairing across
  // buckets, which is incorrect.
  let bMain = 0;
  for (let b = 0; b < counts.length; b++) {
    if (counts[b] >= 2 * S) bMain++;
  }
  if (bMain === 0) throw new Error('no buckets in main path');
  const stopT = Math.max(1, Math.ceil(bMain / S));
  const levels: number[] = [];
  for (let t = T; t >= stopT; t = Math.floor(t / 2)) {
    levels.push(t);
    if (t === stopT) break;
    if (levels.length > 24) throw new Error('too many tree levels');
  }
  log(
    'info',
    `pair-tree levels: ${levels.length} (T sequence: ${levels.join(' -> ')}, stopT=${stopT}, bMain=${bMain})`,
  );

  // Buffers.
  const mkSb = (size: number, copyDst: boolean, copySrc: boolean): GPUBuffer => {
    let usage = GPUBufferUsage.STORAGE;
    if (copyDst) usage |= GPUBufferUsage.COPY_DST;
    if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
    return device.createBuffer({ size, usage });
  };

  const poolBuf = mkSb(poolU32.byteLength, true, false);
  device.queue.writeBuffer(poolBuf, 0, poolU32);
  let csrBuf: GPUBuffer | null = null;
  let chunkBuf: GPUBuffer | null = null;
  let tailPlanBuf: GPUBuffer | null = null;
  if (T > 0) {
    csrBuf = mkSb(csr.csrIndices.byteLength, true, false);
    device.queue.writeBuffer(csrBuf, 0, csr.csrIndices);
    chunkBuf = mkSb(chunkPlan.byteLength, true, false);
    device.queue.writeBuffer(chunkBuf, 0, chunkPlan);
  } else if (TT > 0) {
    csrBuf = mkSb(csr.csrIndices.byteLength, true, false);
    device.queue.writeBuffer(csrBuf, 0, csr.csrIndices);
  }
  if (TT > 0) {
    tailPlanBuf = mkSb(tailPlan.byteLength, true, false);
    device.queue.writeBuffer(tailPlanBuf, 0, tailPlan);
  }

  // Ping-pong buffers for the pair-tree. Each plane needs at most
  // 2*S*T_0 vec4 (level-0 input size). Output of level k is sized
  // S*T_k vec4 per plane, which is half. Use two buffers of the same
  // size and ping-pong.
  let bufA: GPUBuffer | null = null;
  let bufB: GPUBuffer | null = null;
  if (T > 0) {
    const planeBytes = 2 * PG * (2 * S * T) * 4 * 4; // 2 planes (P.x, P.y) * PG vec4 * (2*S*T elems) * 4 u32/vec4 * 4 B
    bufA = mkSb(planeBytes, false, true);
    bufB = mkSb(planeBytes, false, true);
  }

  // Bucket-sums buffer (tail output): 2 planes (P.x, P.y), PG vec4 per
  // bucket. Pre-zero implicitly (GPU buffers start zeroed in WebGPU).
  const bucketSumsBytes = 2 * PG * BUCKETS * 4 * 4;
  const bucketSumsBuf = mkSb(bucketSumsBytes, false, true);

  const paramsBytes = 16;
  const marshalParams = device.createBuffer({ size: paramsBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const levelParams: GPUBuffer[] = [];
  for (let i = 0; i < levels.length; i++) {
    levelParams.push(device.createBuffer({ size: paramsBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
  }
  const tailParams = device.createBuffer({ size: paramsBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  // Compile + bind.
  let marshalPipeline: GPUComputePipeline | null = null;
  let marshalBind: GPUBindGroup | null = null;
  let marshalWgs = 0;
  if (T > 0 && bufA !== null && csrBuf !== null && chunkBuf !== null) {
    const code = sm.gen_ba_marshal_tree_l0_bench_shader(WGI, S);
    log('info', `marshal-l0 shader: ${code.length} chars`);
    const mL = marshalLayout(device);
    marshalPipeline = await compile(device, code, `marshal-l0-W${WGI}-S${S}`, mL);
    marshalBind = device.createBindGroup({
      layout: mL,
      entries: [
        { binding: 0, resource: { buffer: csrBuf } },
        { binding: 1, resource: { buffer: chunkBuf } },
        { binding: 2, resource: { buffer: poolBuf } },
        { binding: 3, resource: { buffer: bufA } },
        { binding: 4, resource: { buffer: marshalParams } },
      ],
    });
    device.queue.writeBuffer(marshalParams, 0, new Uint32Array([T, poolSize, 0, 0]));
    marshalWgs = Math.ceil(T / WGI);
  }

  // Tree kernel: compile once, bind per-level with the appropriate
  // (input, output, params) trio.
  let treePipeline: GPUComputePipeline | null = null;
  const treeBinds: GPUBindGroup[] = [];
  const treeNumWgs: number[] = [];
  if (T > 0 && bufA !== null && bufB !== null) {
    const code = sm.gen_ba_pair_disjoint_tree_bench_shader(WGI, S);
    log('info', `tree-disjoint shader: ${code.length} chars`);
    const tL = treeKernelLayout(device);
    treePipeline = await compile(device, code, `tree-disjoint-W${WGI}-S${S}`, tL);
    const dummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
    let curIn = bufA;
    let curOut = bufB;
    for (let lv = 0; lv < levels.length; lv++) {
      const T_lv = levels[lv];
      const N_in_lv = 2 * S * T_lv;
      const isFinal = lv === levels.length - 1 ? 1 : 0;
      device.queue.writeBuffer(levelParams[lv], 0, new Uint32Array([N_in_lv, T_lv, isFinal, 0]));
      treeBinds.push(
        device.createBindGroup({
          layout: tL,
          entries: [
            { binding: 0, resource: { buffer: curIn } },
            { binding: 1, resource: { buffer: dummy } },
            { binding: 2, resource: { buffer: curOut } },
            { binding: 3, resource: { buffer: levelParams[lv] } },
          ],
        }),
      );
      treeNumWgs.push(Math.ceil(T_lv / WGI));
      const swap = curIn;
      curIn = curOut;
      curOut = swap;
    }
  }

  // Tail pipeline.
  let tailPipeline: GPUComputePipeline | null = null;
  let tailBind: GPUBindGroup | null = null;
  let tailWgs = 0;
  if (TT > 0 && csrBuf !== null && tailPlanBuf !== null) {
    const code = sm.gen_ba_tail_reduce_bench_shader(WGI, S);
    log('info', `tail shader: ${code.length} chars`);
    const tL = tailLayout(device);
    tailPipeline = await compile(device, code, `tail-W${WGI}-S${S}`, tL);
    tailBind = device.createBindGroup({
      layout: tL,
      entries: [
        { binding: 0, resource: { buffer: csrBuf } },
        { binding: 1, resource: { buffer: tailPlanBuf } },
        { binding: 2, resource: { buffer: poolBuf } },
        { binding: 3, resource: { buffer: bucketSumsBuf } },
        { binding: 4, resource: { buffer: tailParams } },
      ],
    });
    device.queue.writeBuffer(tailParams, 0, new Uint32Array([TT, poolSize, BUCKETS, 0]));
    tailWgs = Math.ceil(TT / WGI);
  }

  // Warmup once.
  if (marshalPipeline && marshalBind) {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(marshalPipeline);
    pass.setBindGroup(0, marshalBind);
    pass.dispatchWorkgroups(marshalWgs, 1, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  if (treePipeline) {
    for (let lv = 0; lv < treeBinds.length; lv++) {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(treePipeline);
      pass.setBindGroup(0, treeBinds[lv]);
      pass.dispatchWorkgroups(treeNumWgs[lv], 1, 1);
      pass.end();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    }
  }
  if (tailPipeline && tailBind) {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(tailPipeline);
    pass.setBindGroup(0, tailBind);
    pass.dispatchWorkgroups(tailWgs, 1, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }

  // Time each stage separately, DISP back-to-back per sample.
  let marshalTiming: KernelTiming | null = null;
  if (marshalPipeline && marshalBind) {
    marshalTiming = await timeDispatch(device, marshalPipeline, marshalBind, marshalWgs, reps, DISP);
  }
  const levelTimings: KernelTiming[] = [];
  if (treePipeline) {
    for (let lv = 0; lv < treeBinds.length; lv++) {
      const t = await timeDispatch(device, treePipeline, treeBinds[lv], treeNumWgs[lv], reps, DISP);
      levelTimings.push(t);
    }
  }
  let tailTiming: KernelTiming | null = null;
  if (tailPipeline && tailBind) {
    tailTiming = await timeDispatch(device, tailPipeline, tailBind, tailWgs, reps, DISP);
  }

  // Sanity: at least one of the output buffers must have nonzero data.
  let sanity = false;
  if (treePipeline && bufA && bufB) {
    const finalBuf = treeBinds.length % 2 === 0 ? bufA : bufB;
    sanity = sanity || (await readNonZero(device, finalBuf, 8));
  }
  if (tailPipeline) {
    sanity = sanity || (await readNonZero(device, bucketSumsBuf, 8));
  }

  // Compute per-stage ns/in-pt (normalised to total points fed to that
  // stage; DISP-amortised wall clock).
  const totalInPts = mainPoints + tailPoints;
  const marshalMed = marshalTiming?.median_ms ?? 0;
  const marshalNs = (marshalMed * 1e6) / (mainPoints * DISP);
  const treeTotalMed = levelTimings.reduce((acc, t) => acc + t.median_ms, 0);
  const treeNs = (treeTotalMed * 1e6) / (mainPoints * DISP);
  const tailMed = tailTiming?.median_ms ?? 0;
  const tailNs = TT > 0 ? (tailMed * 1e6) / (tailPoints * DISP) : 0;
  const combinedTotal = marshalMed + treeTotalMed + tailMed;
  const combinedNs = (combinedTotal * 1e6) / (totalInPts * DISP);

  log(
    sanity ? 'ok' : 'err',
    `marshal=${marshalNs.toFixed(2)}ns/pt pair_tree=${treeNs.toFixed(2)}ns/pt tail=${tailNs.toFixed(2)}ns/pt | combined=${combinedNs.toFixed(2)}ns/in-pt | sanity=${sanity ? 'OK' : 'FAIL'}`,
  );
  for (let lv = 0; lv < levelTimings.length; lv++) {
    log('info', `  level ${lv} T=${levels[lv]}: median=${levelTimings[lv].median_ms.toFixed(3)}ms min=${levelTimings[lv].min_ms.toFixed(3)}ms`);
  }

  // Cleanup
  poolBuf.destroy();
  csrBuf?.destroy();
  chunkBuf?.destroy();
  tailPlanBuf?.destroy();
  bufA?.destroy();
  bufB?.destroy();
  bucketSumsBuf.destroy();
  marshalParams.destroy();
  for (const b of levelParams) b.destroy();
  tailParams.destroy();

  return {
    s: S,
    wgi: WGI,
    disp: DISP,
    pairs: NPTS,
    buckets: BUCKETS,
    mode: MODE,
    T_main: T,
    T_tail: TT,
    main_points: mainPoints,
    tail_points: tailPoints,
    levels: levelTimings.length,
    marshal_ms: marshalMed,
    level_ms: levelTimings.map(t => t.median_ms),
    tail_ms: tailMed,
    total_ms: combinedTotal,
    marshal_ns_per_inpt: marshalNs,
    pair_tree_ns_per_inpt: treeNs,
    tail_ns_per_inpt: tailNs,
    combined_ns_per_inpt: combinedNs,
    sanity_ok: sanity,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  const reps = parseInt(qp.get('reps') ?? '5', 10);
  if (!Number.isFinite(reps) || reps <= 0 || reps > 50) throw new Error(`?reps must be in (0, 50]`);
  if (qp.get('n')) {
    const v = parseInt(qp.get('n')!, 10);
    if (!Number.isFinite(v) || v <= 0 || v > (1 << 20)) throw new Error(`?n must be in (0, 2^20]`);
    NPTS = v;
  }
  if (qp.get('buckets')) {
    const v = parseInt(qp.get('buckets')!, 10);
    if (!Number.isFinite(v) || v <= 0 || v > (1 << 18)) throw new Error(`?buckets must be in (0, 2^18]`);
    BUCKETS = v;
  }
  if (qp.get('s')) {
    const v = parseInt(qp.get('s')!, 10);
    if (!Number.isFinite(v) || v <= 0 || v > 256) throw new Error(`?s must be in (0, 256]`);
    S = v;
  }
  if (qp.get('wgi')) {
    const v = parseInt(qp.get('wgi')!, 10);
    if (!Number.isFinite(v) || v <= 0 || v > 1024) throw new Error(`?wgi must be in (0, 1024]`);
    WGI = v;
  }
  if (qp.get('disp')) {
    const v = parseInt(qp.get('disp')!, 10);
    if (!Number.isFinite(v) || v <= 0 || v > 64) throw new Error(`?disp must be in (0, 64]`);
    DISP = v;
  }
  if (qp.get('mode')) {
    const v = qp.get('mode')!;
    if (v !== 'uniform' && v !== 'skewed') throw new Error(`?mode must be uniform or skewed`);
    MODE = v;
  }
  return { reps, n: NPTS, buckets: BUCKETS, s: S, wgi: WGI, disp: DISP, mode: MODE };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing — WebGPU not available');
    const params = parseParams();
    benchState.params = params;
    log(
      'info',
      `params: reps=${params.reps} n=${params.n} buckets=${params.buckets} s=${params.s} wgi=${params.wgi} disp=${params.disp} mode=${params.mode}`,
    );

    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');

    const p = BN254_BASE_FIELD;
    const miscParams = compute_misc_params(p, 13);
    const R = miscParams.r;

    const sm = new ShaderManager(4, NPTS, BN254_CURVE_CONFIG, false);

    const r = await runPipeline(device, sm, params.reps, R, p);
    benchState.results.push(r);
    resultsClient.postProgress({
      kind: 'pipeline_done',
      mode: r.mode,
      combined_ns_per_inpt: r.combined_ns_per_inpt,
      sanity_ok: r.sanity_ok,
    });

    benchState.state = 'done';
    log('ok', 'pipeline complete');
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
