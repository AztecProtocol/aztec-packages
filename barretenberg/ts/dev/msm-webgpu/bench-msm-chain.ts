/// <reference types="@webgpu/types" />
// bench-msm-chain — Standalone WebGPU bench for the marshal + chain
// pair-tree level-0 pipeline that integrates the ba_rev_packed_carry
// chain kernel into MSM bucket accumulate.
//
// The harness:
//   1. Generates a point pool of N+1 random Montgomery points in the
//      SoA-packed layout (2 planes, PG=2 vec4/elem). Index 0 is a
//      universal decoy seed; indices 1..N are real points.
//   2. Generates a synthetic CSR: B buckets, each point assigned to a
//      uniformly random bucket. csr_indices = points sorted by bucket;
//      offset[] = CSR row pointers; count[b] = bucket b's point count.
//   3. Builds a chunk plan from the dense slices: for each bucket b
//      with count[b] >= S, splits it into floor(count[b]/S) chunks of
//      exactly S points. Total dense chunks T_dense.
//   4. Runs the marshal kernel: T_dense threads, each gathers S point
//      coords from the pool into the strided chain layout.
//   5. Runs the recovered ba_rev_packed_carry chain kernel on the
//      marshaled layout.
//   6. Times marshal and chain separately (DISP back-to-back dispatches
//      per timed sample, amortising submit + drain).
//
// Reported metrics, sweeping S in {16, 32, 64}:
//   marshal_ns_per_pt   — ns per input point processed by marshal
//   chain_ns_per_pt     — ns per input point processed by chain
//   combined_ns_per_pt  — marshal + chain
//   density             — fraction of N points covered by dense chunks
//
// Out of scope here (covered by follow-on passes):
//   - Reduction passes that fold pair-tree levels 1..log2(S)/2 into
//     per-bucket totals. These reuse the same chain kernel with
//     decreasing T; cost is ~25 ns/pt per level, ~3 levels for S=16.
//   - Tail handling for buckets with count < S. Will reuse the
//     workgroup-scan batch-affine path or a variable-length variant.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';

const PG = 2;
const DEFAULT_PAIRS = 1 << 17;       // 131072
const DEFAULT_BUCKETS = 1 << 13;     // 8192 -> avg bucket size = 16
const DEFAULT_WGI = 64;
const DEFAULT_DISP = 8;
const DEFAULT_S_SWEEP: readonly number[] = [16, 32, 64];

let PAIRS = DEFAULT_PAIRS;
let BUCKETS = DEFAULT_BUCKETS;
let WGI = DEFAULT_WGI;
let DISP = DEFAULT_DISP;
let S_SWEEP: readonly number[] = DEFAULT_S_SWEEP;

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

// Pack a pool of M (= N+1) random Montgomery points into the SoA layout
// the marshal kernel expects: 2 planes (P.x, P.y), PG vec4 per element.
// Pool index 0 is the decoy seed.
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

// Synthetic CSR: assigns each of the N points to a random bucket in
// [0, B). Returns csr_indices (point indices sorted by bucket, values in
// [1, N+1)) and offsets[b] giving the first csr_indices position for
// bucket b. Point indices are 1-based so index 0 in the pool is reserved
// for the decoy.
function buildSyntheticCSR(
  N: number,
  B: number,
  rng: () => number,
): { csrIndices: Uint32Array; offsets: Uint32Array; counts: Uint32Array } {
  const bucket = new Uint32Array(N);
  const counts = new Uint32Array(B);
  for (let i = 0; i < N; i++) {
    const b = rng() % B;
    bucket[i] = b;
    counts[b]++;
  }
  const offsets = new Uint32Array(B + 1);
  for (let b = 0; b < B; b++) offsets[b + 1] = offsets[b] + counts[b];
  const cursor = new Uint32Array(B);
  const csrIndices = new Uint32Array(N);
  for (let i = 0; i < N; i++) {
    const b = bucket[i];
    csrIndices[offsets[b] + cursor[b]++] = i + 1; // 1-based: 0 is decoy
  }
  return { csrIndices, offsets, counts };
}

// Walk the CSR row pointers and produce the dense chunk plan. For each
// bucket b with count[b] >= S, emit floor(count[b]/S) chunks each
// pointing at S consecutive csr_indices entries. tail = sum of leftover
// points (count[b] mod S) that this v1 bench skips.
function buildChunkPlan(
  offsets: Uint32Array,
  counts: Uint32Array,
  S: number,
): { chunkPlan: Uint32Array; T: number; tailPoints: number } {
  const B = counts.length;
  let T = 0;
  let tail = 0;
  for (let b = 0; b < B; b++) {
    const c = counts[b];
    T += Math.floor(c / S);
    tail += c % S;
  }
  const chunkPlan = new Uint32Array(2 * T);
  let t = 0;
  for (let b = 0; b < B; b++) {
    const c = counts[b];
    const nChunks = Math.floor(c / S);
    for (let k = 0; k < nChunks; k++) {
      chunkPlan[2 * t + 0] = b;
      chunkPlan[2 * t + 1] = offsets[b] + k * S;
      t++;
    }
  }
  return { chunkPlan, T, tailPoints: tail };
}

interface PerSizeResult {
  s: number;
  wgi: number;
  pairs: number;
  buckets: number;
  T: number;
  tail_points: number;
  density: number;
  disp: number;
  marshal_median_ms: number;
  marshal_min_ms: number;
  marshal_max_ms: number;
  marshal_ns_per_pt: number;
  chain_median_ms: number;
  chain_min_ms: number;
  chain_max_ms: number;
  chain_ns_per_pt: number;
  combined_ns_per_pt: number;
  marshal_samples_ms: number[];
  chain_samples_ms: number[];
  sanity_ok: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { reps: number; pairs: number; buckets: number; wgi: number; disp: number; s_sweep: readonly number[] } | null;
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

const resultsClient = makeResultsClient({ page: 'bench-msm-chain' });
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
  console.log(`[bench-msm-chain] ${msg}`);
}

interface PipelineInfo {
  pipeline: GPUComputePipeline;
  layout: GPUBindGroupLayout;
}

async function compile(
  device: GPUDevice,
  code: string,
  cacheKey: string,
  bindLayout: GPUBindGroupLayout,
): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  let hasError = false;
  const errLines: string[] = [];
  for (const msg of info.messages) {
    const line = `[shader ${cacheKey}] ${msg.type}: ${msg.message} (line ${msg.lineNum}, col ${msg.linePos})`;
    if (msg.type === 'error') {
      console.error(line);
      log('err', line);
      errLines.push(line);
      hasError = true;
    } else {
      console.warn(line);
      log('warn', line);
    }
  }
  if (hasError) {
    throw new Error(`WGSL compile failed for ${cacheKey}: ${errLines.join(' | ')}`);
  }
  return device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindLayout] }),
    compute: { module, entryPoint: 'main' },
  });
}

function chainLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
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

async function timeDispatchPasses(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bind: GPUBindGroup,
  numWgs: number,
  reps: number,
  passes: number,
): Promise<number[]> {
  // warmup
  {
    const enc = device.createCommandEncoder();
    for (let pIdx = 0; pIdx < passes; pIdx++) {
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
    for (let pIdx = 0; pIdx < passes; pIdx++) {
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
  return samples;
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

async function runOne(
  device: GPUDevice,
  sm: ShaderManager,
  s: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<PerSizeResult> {
  log('info', `=== S=${s}: PAIRS=${PAIRS} BUCKETS=${BUCKETS} WGI=${WGI} DISP=${DISP}`);

  const rng = makeRng(seed);
  const poolSize = PAIRS + 1; // index 0 reserved as decoy
  const poolU32 = buildPointPool(poolSize, R, p, rng);
  const { csrIndices, counts } = buildSyntheticCSR(PAIRS, BUCKETS, rng);
  // Recompute offsets locally (buildSyntheticCSR returns them too, but
  // we only need it inside buildChunkPlan).
  const offsets = new Uint32Array(BUCKETS + 1);
  for (let b = 0; b < BUCKETS; b++) offsets[b + 1] = offsets[b] + counts[b];

  const { chunkPlan, T, tailPoints } = buildChunkPlan(offsets, counts, s);
  const density = (T * s) / PAIRS;
  const numWgs = Math.ceil(T / WGI);
  log(
    'info',
    `chunk plan: T=${T} chunks (S=${s} each) -> ${T * s} pts (${(density * 100).toFixed(1)}% of ${PAIRS}); tail=${tailPoints} pts skipped`,
  );

  if (T === 0) {
    throw new Error(`S=${s}: no dense chunks (every bucket has count<${s}). Try smaller S or fewer buckets.`);
  }

  // GPU buffers.
  const mkSb = (size: number, copyDst: boolean, copySrc: boolean): GPUBuffer => {
    let usage = GPUBufferUsage.STORAGE;
    if (copyDst) usage |= GPUBufferUsage.COPY_DST;
    if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
    return device.createBuffer({ size, usage });
  };

  const poolBuf = mkSb(poolU32.byteLength, true, false);
  const csrBuf = mkSb(csrIndices.byteLength, true, false);
  const chunkBuf = mkSb(chunkPlan.byteLength, true, false);
  const chainBytes = 4 * PG * (T * s) * 4 * 4; // 4 planes * PG vec4/elem * (T*S) elems * 4 u32/vec4 * 4 B/u32
  const chainBuf = mkSb(chainBytes, false, true);
  const marshalParams = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const chainParams = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(poolBuf, 0, poolU32);
  device.queue.writeBuffer(csrBuf, 0, csrIndices);
  device.queue.writeBuffer(chunkBuf, 0, chunkPlan);
  // marshal: params = [T, poolSize, _, _]
  device.queue.writeBuffer(marshalParams, 0, new Uint32Array([T, poolSize, 0, 0]));
  // chain: params = [N_chain, T, _, _]  with N_chain = T*S
  device.queue.writeBuffer(chainParams, 0, new Uint32Array([T * s, T, 0, 0]));

  // Compile marshal pipeline.
  const marshalCode = sm.gen_ba_marshal_chain_shader(WGI, s);
  log('info', `marshal shader ${marshalCode.length} chars`);
  const mLayout = marshalLayout(device);
  const marshalPipeline = await compile(device, marshalCode, `marshal-W${WGI}-S${s}`, mLayout);
  const marshalBind = device.createBindGroup({
    layout: mLayout,
    entries: [
      { binding: 0, resource: { buffer: csrBuf } },
      { binding: 1, resource: { buffer: chunkBuf } },
      { binding: 2, resource: { buffer: poolBuf } },
      { binding: 3, resource: { buffer: chainBuf } },
      { binding: 4, resource: { buffer: marshalParams } },
    ],
  });

  // Compile chain pipeline.
  const chainCode = sm.gen_ba_rev_packed_carry_bench_shader(WGI, s);
  log('info', `chain shader ${chainCode.length} chars`);
  const cLayout = chainLayout(device);
  const chainPipeline = await compile(device, chainCode, `chain-W${WGI}-S${s}`, cLayout);
  const dummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  // Chain output buffer (separate from input chain_buf since the kernel
  // writes its R outputs to a 2-plane output buffer).
  const chainOutBytes = 2 * PG * (T * s) * 4 * 4;
  const chainOutBuf = mkSb(chainOutBytes, false, true);
  const chainBind = device.createBindGroup({
    layout: cLayout,
    entries: [
      { binding: 0, resource: { buffer: chainBuf } },
      { binding: 1, resource: { buffer: dummy } },
      { binding: 2, resource: { buffer: chainOutBuf } },
      { binding: 3, resource: { buffer: chainParams } },
    ],
  });

  log('info', `marshal: numWgs=${numWgs}, ${T} threads, ${T * s} pts gathered/dispatch`);
  log('info', `chain  : numWgs=${numWgs}, ${T} threads, S=${s} adds/thread = ${T * s} pts processed/dispatch`);

  // Marshal must run at least once before chain (chain reads chain_buf).
  // Warmup is built into timeDispatchPasses.
  const marshalSamples = await timeDispatchPasses(device, marshalPipeline, marshalBind, numWgs, reps, DISP);
  const chainSamples = await timeDispatchPasses(device, chainPipeline, chainBind, numWgs, reps, DISP);

  const sanityOk = await readNonZero(device, chainOutBuf, 8);

  const marshalMed = median(marshalSamples);
  const chainMed = median(chainSamples);
  const ptsPerSample = T * s * DISP;
  const marshalNsPerPt = (marshalMed * 1e6) / ptsPerSample;
  const chainNsPerPt = (chainMed * 1e6) / ptsPerSample;
  const combinedNsPerPt = marshalNsPerPt + chainNsPerPt;

  log(
    sanityOk ? 'ok' : 'err',
    `S=${s}: marshal=${marshalNsPerPt.toFixed(2)}ns/pt chain=${chainNsPerPt.toFixed(2)}ns/pt combined=${combinedNsPerPt.toFixed(2)}ns/pt density=${(density * 100).toFixed(1)}% sanity=${sanityOk ? 'OK' : 'FAIL'}`,
  );

  poolBuf.destroy();
  csrBuf.destroy();
  chunkBuf.destroy();
  chainBuf.destroy();
  chainOutBuf.destroy();
  dummy.destroy();
  marshalParams.destroy();
  chainParams.destroy();

  return {
    s,
    wgi: WGI,
    pairs: PAIRS,
    buckets: BUCKETS,
    T,
    tail_points: tailPoints,
    density,
    disp: DISP,
    marshal_median_ms: marshalMed,
    marshal_min_ms: Math.min(...marshalSamples),
    marshal_max_ms: Math.max(...marshalSamples),
    marshal_ns_per_pt: marshalNsPerPt,
    chain_median_ms: chainMed,
    chain_min_ms: Math.min(...chainSamples),
    chain_max_ms: Math.max(...chainSamples),
    chain_ns_per_pt: chainNsPerPt,
    combined_ns_per_pt: combinedNsPerPt,
    marshal_samples_ms: marshalSamples,
    chain_samples_ms: chainSamples,
    sanity_ok: sanityOk,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  const reps = parseInt(qp.get('reps') ?? '5', 10);
  if (!Number.isFinite(reps) || reps <= 0 || reps > 50) {
    throw new Error(`?reps must be in (0, 50], got ${qp.get('reps')}`);
  }
  const pairsStr = qp.get('pairs');
  if (pairsStr !== null) {
    const v = parseInt(pairsStr, 10);
    if (!Number.isFinite(v) || v <= 0 || v > (1 << 20)) {
      throw new Error(`?pairs must be in (0, 2^20], got ${pairsStr}`);
    }
    PAIRS = v;
  }
  const bucketsStr = qp.get('buckets');
  if (bucketsStr !== null) {
    const v = parseInt(bucketsStr, 10);
    if (!Number.isFinite(v) || v <= 0 || v > (1 << 18)) {
      throw new Error(`?buckets must be in (0, 2^18], got ${bucketsStr}`);
    }
    BUCKETS = v;
  }
  const wgiStr = qp.get('wgi');
  if (wgiStr !== null) {
    const v = parseInt(wgiStr, 10);
    if (!Number.isFinite(v) || v <= 0 || v > 1024) {
      throw new Error(`?wgi must be in (0, 1024], got ${wgiStr}`);
    }
    WGI = v;
  }
  const dispStr = qp.get('disp');
  if (dispStr !== null) {
    const v = parseInt(dispStr, 10);
    if (!Number.isFinite(v) || v <= 0 || v > 64) {
      throw new Error(`?disp must be in (0, 64], got ${dispStr}`);
    }
    DISP = v;
  }
  const sStr = qp.get('s');
  if (sStr !== null) {
    const list = sStr.split(',').map(v => parseInt(v, 10));
    for (const v of list) {
      if (!Number.isFinite(v) || v <= 0 || v > 256) {
        throw new Error(`?s entries must be in (0, 256], got ${v}`);
      }
    }
    S_SWEEP = list;
  }
  return { reps, pairs: PAIRS, buckets: BUCKETS, wgi: WGI, disp: DISP, s_sweep: S_SWEEP };
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
      `params: reps=${params.reps} pairs=${params.pairs} buckets=${params.buckets} wgi=${params.wgi} disp=${params.disp} s=[${params.s_sweep.join(',')}]`,
    );

    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');

    const p = BN254_BASE_FIELD;
    const miscParams = compute_misc_params(p, 13);
    const R = miscParams.r;

    const sm = new ShaderManager(4, PAIRS, BN254_CURVE_CONFIG, false);

    let seed = 0xc511;
    for (const s of S_SWEEP) {
      try {
        const r = await runOne(device, sm, s, params.reps, R, p, seed);
        benchState.results.push(r);
        resultsClient.postProgress({
          kind: 'batch_done',
          s,
          marshal_ns_per_pt: r.marshal_ns_per_pt,
          chain_ns_per_pt: r.chain_ns_per_pt,
          combined_ns_per_pt: r.combined_ns_per_pt,
          density: r.density,
          sanity_ok: r.sanity_ok,
        });
        seed += 0x10;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('err', `S=${s} failed: ${msg} — STOPPING sweep at first failure`);
        benchState.state = 'error';
        benchState.error = msg;
        return;
      }
    }

    benchState.state = 'done';
    log('ok', 'all sizes done');
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
