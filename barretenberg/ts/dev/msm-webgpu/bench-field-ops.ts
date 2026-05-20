/// <reference types="@webgpu/types" />
// Standalone WebGPU microbenchmarks for the isolated throughput of a
// single base-field MULTIPLY vs a single base-field INVERSION.
//
// WHY: the full MSM bucket-accumulate super-kernel amortises one field
// inversion across S affine adds via the batched-inverse trick. Knowing
// the raw cost RATIO — how many field multiplies one inversion buys —
// tells us how aggressively that amortisation has to work, and is the
// number to watch when a new inverse variant is swapped in. Measuring
// each op alone (not inside the super-kernel) removes the register-
// pressure compounding that distorts a per-op figure taken from the
// fused kernel.
//
// THREE BENCHMARKS, run back to back:
//   BM1  field-multiply: 10,000,000 independent montgomery_product ops
//        (Karatsuba+Yuval body, 20 x 13-bit limbs).
//   BM2  field-inversion: 1,000,000 independent fr_inv_by_a ops
//        (Bernstein-Yang safegcd, Option A, BATCH=26).
//   BM3  field-inversion: 1,000,000 independent fr_inv_by_loop ops
//        (register-minimal BY safegcd, BATCH=12) — same op count as BM2
//        so the two inverse variants compare directly.
//
// Each is a THROUGHPUT measurement, not a latency chain: many threads,
// each looping over mutually-independent ops (operands perturbed per
// iteration, results XOR-folded into a sink — see the WGSL headers).
// total ops = threads * iters_per_thread.
//
// 10M elements are NEVER materialised — a packed field element is 32 B,
// so 10M would be 320 MB, far past WebGPU's ~128 MiB binding limit.
// Only `threads` field elements live in the seed + sink buffers; each
// thread loops `iters` times.
//
// TIMING: one timestamped compute pass per rep; the GPU has a cold-
// start DVFS ramp, so several reps run and a warm (last) rep is
// reported. Headline output per benchmark: total GPU wall time and
// ns-per-operation. The final line prints the inv/mul ratio.
//
// Query params (all optional):
//   ?mul_threads=100000&mul_iters=100   (BM1; product must be 1e7)
//   ?inv_threads=10000&inv_iters=100    (BM2; product must be 1e6)
//   ?wg=64        workgroup size for both kernels
//   ?reps=6       timed reps per benchmark (first is the cold rep)
//   ?validate=1   CPU cross-check of one thread's sink
//
// The browser run is the verification gate — this file only renders +
// typechecks offline.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD, modInverse } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';

// BM1 (multiply) total ops fixed at 10M, BM2 (inversion) at 1M.
const MUL_TOTAL_OPS = 10_000_000;
const INV_TOTAL_OPS = 1_000_000;

// Default thread/iter splits. threads * iters must equal the totals
// above. Enough threads to saturate the GPU and amortise dispatch
// overhead; iters large enough that per-thread loop body dominates the
// thread's prologue/epilogue.
let MUL_THREADS = 100_000; // x 100 iters = 10,000,000
let MUL_ITERS = 100;
let INV_THREADS = 10_000; // x 100 iters = 1,000,000
let INV_ITERS = 100;
let WG = 64; // workgroup size for both kernels
let REPS = 6; // timed reps; rep 0 is the cold (DVFS-ramp) rep
let VALIDATE = false;

const FP = BN254_BASE_FIELD;

// Each packed field element is 8 u32 words = 2 vec4<u32> = 32 bytes,
// matching the seed/sink layout the bench WGSL expects.
const U32_PER_ELEM = 8;
const BYTES_PER_ELEM = U32_PER_ELEM * 4;

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

// A random field element in [1, p), taking the HIGH byte of the LCG
// each step (its low bits cycle with a tiny period).
function randomFieldElem(rng: () => number): bigint {
  const bitlen = FP.toString(2).length;
  const byteLen = Math.ceil(bitlen / 8);
  for (;;) {
    let v = 0n;
    for (let i = 0; i < byteLen; i++) v = (v << 8n) | BigInt((rng() >>> 24) & 0xff);
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v > 0n && v < FP) return v;
  }
}

// Little-endian 8 x u32 split of a 256-bit integer. pack_limbs_to_256
// in the WGSL produces the bit-identical integer (sum w[j]*2^(32j)), so
// the host packs by plain LE word extraction.
function bigintToU32x8(v: bigint): Uint32Array {
  const w = new Uint32Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    w[i] = Number(x & 0xffffffffn);
    x >>= 32n;
  }
  return w;
}

function u32x8ToBigint(w: Uint32Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 32n) | BigInt(w[off + i] >>> 0);
  return v;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface OpBenchResult {
  name: 'field-multiply' | 'field-inversion' | 'field-inversion-loop';
  threads: number;
  iters_per_thread: number;
  total_ops: number;
  workgroup_size: number;
  reps: number;
  // GPU-timestamp pass duration, milliseconds, per rep (rep 0 = cold).
  gpu_pass_ms: number[];
  // CPU submit->done wall, milliseconds, per rep.
  wall_ms: number[];
  // Warm (best of reps>=1) GPU pass time and derived ns/op.
  warm_gpu_ms: number;
  ns_per_op: number;
  validated: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: Record<string, unknown> | null;
  results: OpBenchResult[];
  ratio: number | null;
  ratioLoop: number | null;
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: [], ratio: null, ratioLoop: null, error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;
const resultsClient = makeResultsClient({ page: 'bench-field-ops' });
(window as unknown as { __runId: string }).__runId = resultsClient.runId;

async function postFinal(): Promise<void> {
  await resultsClient.postResults({
    state: benchState.state,
    params: benchState.params,
    results: benchState.results,
    ratio: benchState.ratio,
    ratioLoop: benchState.ratioLoop,
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
  console.log(`[bench-field-ops] ${msg}`);
}

async function compileOne(
  device: GPUDevice,
  code: string,
  key: string,
  layout: GPUBindGroupLayout,
): Promise<GPUComputePipeline> {
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

// Build the seed buffer: `threads` random field elements in Montgomery
// form, each packed as 8 LE u32 words. The kernels keep operands in
// Montgomery form throughout, so the seeds are pre-multiplied by R.
function buildSeeds(threads: number, R: bigint, seed: number): { words: Uint32Array; values: bigint[] } {
  const rng = makeRng(seed);
  const u32 = new Uint32Array(threads * U32_PER_ELEM);
  const values: bigint[] = new Array(threads);
  for (let t = 0; t < threads; t++) {
    const v = randomFieldElem(rng);
    values[t] = v;
    const mont = (v * R) % FP;
    const w = bigintToU32x8(mont);
    for (let k = 0; k < U32_PER_ELEM; k++) u32[t * U32_PER_ELEM + k] = w[k];
  }
  return { words: u32, values };
}

// One timestamped run of a single-pass kernel. Returns
// { gpuMs, wallMs }: GPU-timestamp pass duration and CPU submit->done
// wall. A query set is supplied so the GPU brackets the pass; if the
// device lacks timestamp-query, gpuMs falls back to the CPU wall.
async function timedDispatch(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bind: GPUBindGroup,
  numWorkgroups: number,
  querySet: GPUQuerySet | null,
  tsResolve: GPUBuffer | null,
  tsStaging: GPUBuffer | null,
): Promise<{ gpuMs: number; wallMs: number }> {
  const enc = device.createCommandEncoder();
  const desc: GPUComputePassDescriptor = {};
  if (querySet) {
    desc.timestampWrites = { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 };
  }
  const pass = enc.beginComputePass(desc);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.dispatchWorkgroups(numWorkgroups, 1, 1);
  pass.end();
  if (querySet && tsResolve && tsStaging) {
    enc.resolveQuerySet(querySet, 0, 2, tsResolve, 0);
    enc.copyBufferToBuffer(tsResolve, 0, tsStaging, 0, 16);
  }
  const t0 = performance.now();
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  const wallMs = performance.now() - t0;

  let gpuMs = wallMs;
  if (querySet && tsStaging) {
    await tsStaging.mapAsync(GPUMapMode.READ);
    const ts = new BigUint64Array(tsStaging.getMappedRange().slice(0));
    tsStaging.unmap();
    gpuMs = Number(ts[1] - ts[0]) / 1e6;
  }
  return { gpuMs, wallMs };
}

// Run one op-benchmark: build buffers, compile, warm + timed reps,
// optional CPU cross-check, report ns/op.
async function runOpBench(
  device: GPUDevice,
  sm: ShaderManager,
  R: bigint,
  cfg: {
    name: OpBenchResult['name'];
    threads: number;
    iters: number;
    workgroupSize: number;
    code: string;
    key: string;
    // Host reference for one thread's sink — null skips validation.
    hostSink: ((seedValues: bigint[], threadIdx: number) => bigint) | null;
  },
): Promise<OpBenchResult> {
  const { name, threads, iters, workgroupSize, code, key } = cfg;
  const totalOps = threads * iters;
  log(
    'info',
    `=== ${name}: threads=${threads} iters/thread=${iters} total_ops=${totalOps} ` +
      `wg=${workgroupSize} reps=${REPS} ===`,
  );

  const { words: seedWords, values: seedValues } = buildSeeds(threads, R, 0xf1e1d0 ^ threads);
  const seedBuf = device.createBuffer({
    size: seedWords.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(seedBuf, 0, seedWords as BufferSource);

  const sinkBytes = threads * BYTES_PER_ELEM;
  const sinkBuf = device.createBuffer({
    size: sinkBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const paramsBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  // params.x = THREADS, params.y = ITERS (ITERS is also baked into the
  // shader as a compile-time const; the uniform copy is for symmetry
  // and to keep the binding layout uniform across kernels).
  device.queue.writeBuffer(paramsBuf, 0, new Uint32Array([threads, iters, 0, 0]));

  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const pipeline = await compileOne(device, code, key, layout);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: seedBuf } },
      { binding: 1, resource: { buffer: sinkBuf } },
      { binding: 2, resource: { buffer: paramsBuf } },
    ],
  });

  const numWorkgroups = Math.ceil(threads / workgroupSize);

  // Timestamp query set: brackets a single compute pass per rep.
  const tsEnabled = device.features.has('timestamp-query');
  if (!tsEnabled) log('warn', 'timestamp-query unavailable — falling back to CPU submit->done wall');
  const querySet = tsEnabled ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
  const tsResolve = tsEnabled
    ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
    : null;
  const tsStaging = tsEnabled
    ? device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    : null;

  // Warmup dispatch (not timed): primes the pipeline and lets the GPU
  // begin its DVFS ramp before the first timed rep.
  {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(numWorkgroups, 1, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }

  const gpuPassMs: number[] = [];
  const wallMs: number[] = [];
  for (let r = 0; r < Math.max(1, REPS); r++) {
    const { gpuMs, wallMs: w } = await timedDispatch(
      device,
      pipeline,
      bind,
      numWorkgroups,
      querySet,
      tsResolve,
      tsStaging,
    );
    gpuPassMs.push(gpuMs);
    wallMs.push(w);
    const nsThis = (gpuMs * 1e6) / totalOps;
    log(
      'info',
      `  rep ${r} (${r === 0 ? 'cold' : 'warm'}): gpu_pass=${gpuMs.toFixed(3)}ms wall=${w.toFixed(3)}ms ` +
        `→ ${nsThis.toFixed(3)} ns/op`,
    );
  }

  // Warm = fastest of reps >= 1 (rep 0 is the cold DVFS-ramp rep). If
  // only 1 rep was requested, fall back to that.
  const warmPool = gpuPassMs.length > 1 ? gpuPassMs.slice(1) : gpuPassMs;
  const warmGpuMs = Math.min(...warmPool);
  const nsPerOp = (warmGpuMs * 1e6) / totalOps;
  log(
    'ok',
    `${name}: warm GPU wall=${warmGpuMs.toFixed(3)}ms over ${totalOps} ops → ${nsPerOp.toFixed(3)} ns/op ` +
      `(median warm ${(median(warmPool)).toFixed(3)}ms)`,
  );

  // Optional CPU cross-check: recompute one thread's XOR-folded sink.
  let validated = false;
  if (VALIDATE && cfg.hostSink) {
    const gpuSink = await readbackU32(device, sinkBuf, sinkBytes);
    const checkThreads = Math.min(threads, 4);
    let allOk = true;
    for (let t = 0; t < checkThreads; t++) {
      const gpu = u32x8ToBigint(gpuSink, t * U32_PER_ELEM);
      const expect = cfg.hostSink(seedValues, t);
      if (gpu !== expect) {
        allOk = false;
        log('err', `  validation FAIL thread ${t}: gpu=0x${gpu.toString(16)} ref=0x${expect.toString(16)}`);
      }
    }
    validated = allOk;
    if (allOk) log('ok', `  validation PASS — ${checkThreads} thread sinks match CPU reference`);
  } else if (VALIDATE) {
    log('info', '  validation skipped (no host reference for this kernel)');
  }

  seedBuf.destroy();
  sinkBuf.destroy();
  paramsBuf.destroy();
  querySet?.destroy();
  tsResolve?.destroy();
  tsStaging?.destroy();

  return {
    name,
    threads,
    iters_per_thread: iters,
    total_ops: totalOps,
    workgroup_size: workgroupSize,
    reps: Math.max(1, REPS),
    gpu_pass_ms: gpuPassMs,
    wall_ms: wallMs,
    warm_gpu_ms: warmGpuMs,
    ns_per_op: nsPerOp,
    validated,
  };
}

// CPU model of BM1's per-thread sink: the kernel XOR-folds the 256-bit
// packed representation of every product. Each product is
// montgomery_product of a/b, both perturbed (+1 on limb 0) each
// iteration. To mirror the GPU bit-for-bit we model the perturbation in
// the same 20 x 13-bit limb domain the WGSL unpacks into.
function hostMulSink(R: bigint, Rinv: bigint, threads: number) {
  return (seedValues: bigint[], t: number): bigint => {
    // Operands in Montgomery form, exactly as the seed buffer holds.
    let aLimbs = to13BitLimbs((seedValues[t] * R) % FP);
    let bLimbs = to13BitLimbs((seedValues[(t + 1) % threads] * R) % FP);
    let sink = 0n;
    for (let i = 0; i < MUL_ITERS_FOR_HOST; i++) {
      aLimbs = incLimb0(aLimbs);
      bLimbs = incLimb0(bLimbs);
      const a = from13BitLimbs(aLimbs);
      const b = from13BitLimbs(bLimbs);
      // montgomery_product(a,b) = a*b*Rinv mod p  (a,b already in Mont
      // form, so this equals (av*bv)*R mod p).
      const prod = (((a * b) % FP) * Rinv) % FP;
      sink ^= prod;
    }
    return sink;
  };
}

// CPU model of BM2's per-thread sink: XOR-fold of fr_inv_by_a over a
// per-iteration-perturbed operand. fr_inv_by_a(opMont) returns the
// Montgomery-form inverse of the underlying value.
function hostInvSink(R: bigint, Rinv: bigint) {
  return (seedValues: bigint[], t: number): bigint => {
    let opLimbs = to13BitLimbs((seedValues[t] * R) % FP);
    let sink = 0n;
    for (let i = 0; i < INV_ITERS_FOR_HOST; i++) {
      opLimbs = incLimb0(opLimbs);
      const opMont = from13BitLimbs(opLimbs);
      // Underlying value of the Montgomery-form operand, then its
      // inverse, then back to Montgomery form (fr_inv_by_a folds in
      // r^3, yielding a Mont-form result).
      const opVal = (opMont * Rinv) % FP;
      const invVal = modInverse(opVal, FP);
      const invMont = (invVal * R) % FP;
      sink ^= invMont;
    }
    return sink;
  };
}

// 20 x 13-bit limb helpers — the representation the bench WGSL unpacks
// the packed 256-bit seed into, and the domain in which it perturbs
// limb 0. Modelling the perturbation here keeps the CPU cross-check
// bit-exact with the GPU.
const LIMB_BITS = 13;
const NUM_LIMBS = 20;
const LIMB_MASK = (1 << LIMB_BITS) - 1;

function to13BitLimbs(v: bigint): number[] {
  const out: number[] = new Array(NUM_LIMBS);
  let x = v;
  for (let i = 0; i < NUM_LIMBS; i++) {
    out[i] = Number(x & BigInt(LIMB_MASK));
    x >>= BigInt(LIMB_BITS);
  }
  return out;
}

function from13BitLimbs(limbs: number[]): bigint {
  let v = 0n;
  for (let i = NUM_LIMBS - 1; i >= 0; i--) v = (v << BigInt(LIMB_BITS)) | BigInt(limbs[i] >>> 0);
  return v;
}

// limb0 += 1, no carry propagation — exactly what the WGSL does
// (`b.limbs[0] = b.limbs[0] + 1u`). Safe because iters << 2^13.
function incLimb0(limbs: number[]): number[] {
  const out = limbs.slice();
  out[0] = out[0] + 1;
  return out;
}

// Iteration counts the host models — bound to the actual configured
// values just before validation runs.
let MUL_ITERS_FOR_HOST = MUL_ITERS;
let INV_ITERS_FOR_HOST = INV_ITERS;

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('mul_threads')) MUL_THREADS = parseInt(qp.get('mul_threads')!, 10);
  if (qp.get('mul_iters')) MUL_ITERS = parseInt(qp.get('mul_iters')!, 10);
  if (qp.get('inv_threads')) INV_THREADS = parseInt(qp.get('inv_threads')!, 10);
  if (qp.get('inv_iters')) INV_ITERS = parseInt(qp.get('inv_iters')!, 10);
  if (qp.get('wg')) WG = parseInt(qp.get('wg')!, 10);
  if (qp.get('reps')) REPS = parseInt(qp.get('reps')!, 10);
  if (qp.get('validate') === '1') VALIDATE = true;

  // Keep the totals honest: threads * iters must equal the fixed op
  // counts (10M for multiply, 1M for inversion). If a caller overrides
  // only one factor, derive the other so the headline ns/op stays
  // comparable across runs.
  if (qp.get('mul_threads') && !qp.get('mul_iters')) MUL_ITERS = Math.round(MUL_TOTAL_OPS / MUL_THREADS);
  else if (qp.get('mul_iters') && !qp.get('mul_threads')) MUL_THREADS = Math.round(MUL_TOTAL_OPS / MUL_ITERS);
  if (qp.get('inv_threads') && !qp.get('inv_iters')) INV_ITERS = Math.round(INV_TOTAL_OPS / INV_THREADS);
  else if (qp.get('inv_iters') && !qp.get('inv_threads')) INV_THREADS = Math.round(INV_TOTAL_OPS / INV_ITERS);

  MUL_ITERS_FOR_HOST = MUL_ITERS;
  INV_ITERS_FOR_HOST = INV_ITERS;
  return {
    mul_threads: MUL_THREADS,
    mul_iters: MUL_ITERS,
    mul_total_ops: MUL_THREADS * MUL_ITERS,
    inv_threads: INV_THREADS,
    inv_iters: INV_ITERS,
    inv_total_ops: INV_THREADS * INV_ITERS,
    wg: WG,
    reps: REPS,
    validate: VALIDATE,
  };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const params = parseParams();
    benchState.params = params;
    log('info', `params: ${JSON.stringify(params)}`);
    if (params.mul_total_ops !== MUL_TOTAL_OPS) {
      log('warn', `multiply total_ops=${params.mul_total_ops} != target ${MUL_TOTAL_OPS} (ns/op still reported)`);
    }
    if (params.inv_total_ops !== INV_TOTAL_OPS) {
      log('warn', `inversion total_ops=${params.inv_total_ops} != target ${INV_TOTAL_OPS} (ns/op still reported)`);
    }
    benchState.state = 'running';

    const device = await get_device();
    log('info', 'WebGPU device acquired');

    // Montgomery radix R for the 20 x 13-bit BN254 base-field layout.
    const misc = compute_misc_params(FP, LIMB_BITS);
    const R = misc.r;
    const Rinv = misc.rinv;
    if ((R * Rinv) % FP !== 1n) throw new Error('R * Rinv mod p != 1 — Montgomery params inconsistent');

    // chunk_size / input_size only affect MSM-specific shaders; the
    // field-op kernels read just num_words / word_size / constants, so
    // any sane values work here.
    const sm = new ShaderManager(16, 1 << 16, BN254_CURVE_CONFIG, false);

    // BM1 — field multiply, 10M ops.
    const mulCode = sm.gen_bench_field_mul_shader(WG, MUL_ITERS);
    const mulResult = await runOpBench(device, sm, R, {
      name: 'field-multiply',
      threads: MUL_THREADS,
      iters: MUL_ITERS,
      workgroupSize: WG,
      code: mulCode,
      key: `bench-field-mul-wg${WG}-it${MUL_ITERS}`,
      hostSink: VALIDATE ? hostMulSink(R, Rinv, MUL_THREADS) : null,
    });
    benchState.results.push(mulResult);
    resultsClient.postProgress({ kind: 'mul_done', ns_per_op: mulResult.ns_per_op });

    // BM2 — field inversion via by_inverse_a (Option A), 1M ops.
    const invCode = sm.gen_bench_field_inv_shader(WG, INV_ITERS, 'a');
    const invResult = await runOpBench(device, sm, R, {
      name: 'field-inversion',
      threads: INV_THREADS,
      iters: INV_ITERS,
      workgroupSize: WG,
      code: invCode,
      key: `bench-field-inv-a-wg${WG}-it${INV_ITERS}`,
      hostSink: VALIDATE ? hostInvSink(R, Rinv) : null,
    });
    benchState.results.push(invResult);
    resultsClient.postProgress({ kind: 'inv_done', ns_per_op: invResult.ns_per_op });

    // BM3 — field inversion via by_inverse_loop (register-minimal), 1M ops.
    // Same op count as BM2 — the two variants compare directly — and both
    // compute the same field inverse, so the CPU cross-check is identical.
    const invLoopCode = sm.gen_bench_field_inv_shader(WG, INV_ITERS, 'loop');
    const invLoopResult = await runOpBench(device, sm, R, {
      name: 'field-inversion-loop',
      threads: INV_THREADS,
      iters: INV_ITERS,
      workgroupSize: WG,
      code: invLoopCode,
      key: `bench-field-inv-loop-wg${WG}-it${INV_ITERS}`,
      hostSink: VALIDATE ? hostInvSink(R, Rinv) : null,
    });
    benchState.results.push(invLoopResult);
    resultsClient.postProgress({ kind: 'inv_loop_done', ns_per_op: invLoopResult.ns_per_op });

    const ratio = invResult.ns_per_op / mulResult.ns_per_op;
    const ratioLoop = invLoopResult.ns_per_op / mulResult.ns_per_op;
    benchState.ratio = ratio;
    benchState.ratioLoop = ratioLoop;
    log('ok', `field-multiply:           ${mulResult.ns_per_op.toFixed(2)} ns/op`);
    log(
      'ok',
      `RATIO by_inverse_a:    1 inversion = ${ratio.toFixed(1)} field-multiplies ` +
        `(${invResult.ns_per_op.toFixed(2)} ns/op)`,
    );
    log(
      'ok',
      `RATIO by_inverse_loop: 1 inversion = ${ratioLoop.toFixed(1)} field-multiplies ` +
        `(${invLoopResult.ns_per_op.toFixed(2)} ns/op)`,
    );
    const loopSpeedup = invResult.ns_per_op / invLoopResult.ns_per_op;
    log(
      'ok',
      `by_inverse_loop vs by_inverse_a: ${loopSpeedup.toFixed(2)}x ` +
        `${loopSpeedup >= 1 ? 'faster' : 'slower'}`,
    );

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
