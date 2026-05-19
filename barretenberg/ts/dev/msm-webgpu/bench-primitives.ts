/// <reference types="@webgpu/types" />
// Consolidated WebGPU micro-benchmark for BN254 base-field (Fq) arithmetic
// primitives. Reuses the EXISTING algorithm implementations in
// src/msm_webgpu/wgsl (no re-rolled math):
//
//   1. Montgomery multiplication  — production Karatsuba+Yuval montmul
//      (the fastest of the u32 variants; bench-field-mul `karat`).
//   2. Field addition             — fr_add  (field.template.wgsl).
//   3. Field subtraction          — fr_sub  (field.template.wgsl).
//   4. Field inversion            — fr_inv_by (BY safegcd; the
//      bench-fr-inv production default).
//   5. Batch-affine point add     — full batch-affine pipeline kernel
//      (prefix-scan + single inversion + back-walk + affine add), the
//      same shader bench-batch-affine drives.
//   6. Unconditional Jacobian add — add_points_no_collision (straight-line
//      add-2007-bl, NO x1==x2 / doubling / identity fallback).
//
// All inputs are random field elements in Montgomery form. For the point
// adds the two operands are independent random points (x1 != x2 with
// overwhelming probability). Thread counts are chosen well above any
// GPU's parallel ALU width so the device is fully saturated.
//
// Reported per op:
//   - ns_per_op            = wall_ns / total_ops            (throughput)
//   - ns_per_op_per_thread = ns_per_op * num_threads         (per-thread
//                            op latency: each of `num_threads` threads runs
//                            total_ops/num_threads ops sequentially).
//
// Single dispatch per measurement for ops 1-4 and 6 (k chained ops per
// thread); ops 5 runs NUM_DISPATCHES batch passes in one submit. No MSM
// production pipeline is touched.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device, probe_subgroup_support } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';

const WG = 64;
const NUM_LIMBS = 20;
const WORD_SIZE = 13;
const W = 1n << BigInt(WORD_SIZE);
const MASK = W - 1n;

// f32-22 limb layout (sos3uv3 Montgomery product): 12 limbs of 22 bits,
// stored as integer-valued f32. Used only by the mont_f32_22 probe.
const NUM_LIMBS_F32 = 12;
const WORD_SIZE_F32 = 22;
const MASK_F32 = (1n << BigInt(WORD_SIZE_F32)) - 1n;

function bigintToLimbsF32(v: bigint): number[] {
  const limbs = new Array<number>(NUM_LIMBS_F32);
  let x = v;
  for (let i = 0; i < NUM_LIMBS_F32; i++) {
    limbs[i] = Number(x & MASK_F32);
    x >>= BigInt(WORD_SIZE_F32);
  }
  return limbs;
}

function bigintToLimbs(v: bigint): number[] {
  const limbs = new Array<number>(NUM_LIMBS);
  let x = v;
  for (let i = 0; i < NUM_LIMBS; i++) {
    limbs[i] = Number(x & MASK);
    x >>= BigInt(WORD_SIZE);
  }
  return limbs;
}

function limbsToBigint(limbs: ArrayLike<number>): bigint {
  let v = 0n;
  for (let i = NUM_LIMBS - 1; i >= 0; i--) {
    v = (v << BigInt(WORD_SIZE)) | BigInt(limbs[i] >>> 0);
  }
  return v;
}

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
    if (v < p) return v;
  }
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface OpResult {
  name: string;
  algo: string;
  total_ops: number;
  num_threads: number;
  ops_per_thread: number;
  reps: number;
  median_ms: number;
  min_ms: number;
  max_ms: number;
  ns_per_op: number;
  ns_per_op_per_thread: number;
  samples_ms: number[];
  sanity_ok: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { reps: number; suite?: string } | null;
  results: OpResult[];
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

const resultsClient = makeResultsClient({ page: 'bench-primitives' });
(window as unknown as { __runId: string }).__runId = resultsClient.runId;

const $log = document.getElementById('log') as HTMLDivElement;
function log(level: 'info' | 'ok' | 'err' | 'warn', msg: string) {
  const cls = level === 'ok' ? 'ok' : level === 'err' ? 'err' : level === 'warn' ? 'warn' : '';
  const span = document.createElement('div');
  span.className = cls;
  span.textContent = msg;
  $log.appendChild(span);
  benchState.log.push(`[${level}] ${msg}`);
  console.log(`[bench-primitives] ${msg}`);
}

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

async function compile(
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
    const line = `[shader ${key}] ${m.type}: ${m.message} (line ${m.lineNum})`;
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

function ioLayout(device: GPUDevice, twoInputs: boolean): GPUBindGroupLayout {
  const entries: GPUBindGroupLayoutEntry[] = [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
  ];
  if (twoInputs) {
    entries.push({ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } });
    entries.push({ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } });
    entries.push({ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } });
  } else {
    entries.push({ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } });
    entries.push({ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } });
  }
  return device.createBindGroupLayout({ entries });
}

function randLimbBuf(count: number, R: bigint, p: bigint, rng: () => number): Uint32Array {
  const buf = new Uint32Array(count * NUM_LIMBS);
  for (let i = 0; i < count; i++) {
    const mont = (randomBelow(p, rng) * R) % p;
    const limbs = bigintToLimbs(mont);
    for (let j = 0; j < NUM_LIMBS; j++) buf[i * NUM_LIMBS + j] = limbs[j];
  }
  return buf;
}

function paramsBuf(device: GPUDevice, n: number, k: number, stride = 0): GPUBuffer {
  // 16 bytes so SoA kernels can read params.z (stride); vec2<u32> kernels
  // bound to a larger uniform buffer is legal in WebGPU.
  const b = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(b, 0, new Uint32Array([n, k, stride, 0]));
  return b;
}

async function timeDispatch(
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

async function readNonZero(
  device: GPUDevice,
  out: GPUBuffer,
  limbCount: number,
): Promise<boolean> {
  const bytes = limbCount * 4;
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(out, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await staging.mapAsync(GPUMapMode.READ);
  const u32 = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  let nz = false;
  for (let i = 0; i < u32.length; i++) if (u32[i] !== 0) { nz = true; break; }
  return nz;
}

function finalize(
  name: string,
  algo: string,
  totalOps: number,
  threads: number,
  reps: number,
  samples: number[],
  sanityOk: boolean,
): OpResult {
  const med = median(samples);
  const opsPerThread = totalOps / threads;
  const nsPerOp = (med * 1e6) / totalOps;
  const r: OpResult = {
    name,
    algo,
    total_ops: totalOps,
    num_threads: threads,
    ops_per_thread: opsPerThread,
    reps,
    median_ms: med,
    min_ms: Math.min(...samples),
    max_ms: Math.max(...samples),
    ns_per_op: nsPerOp,
    ns_per_op_per_thread: nsPerOp * threads,
    samples_ms: samples,
    sanity_ok: sanityOk,
  };
  log(
    'ok',
    `${name}: total_ops=${totalOps.toLocaleString()} threads=${threads.toLocaleString()} ` +
      `ops/thread=${opsPerThread} median=${med.toFixed(3)}ms ` +
      `ns/op=${nsPerOp.toFixed(3)} ns/op/thread=${(nsPerOp * threads).toFixed(1)} sanity=${sanityOk ? 'OK' : 'FAIL'}`,
  );
  return r;
}

// ---- field/jac chained-op bench (ops 1,2,3,6: two inputs) ----
async function runChained2(
  device: GPUDevice,
  name: string,
  algo: string,
  code: string,
  n: number,
  k: number,
  limbsPerElem: number, // 1 for field, 3 for Jacobian point
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const xs = randLimbBuf(n * limbsPerElem, R, p, rng);
  const ys = randLimbBuf(n * limbsPerElem, R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(xs);
  const yb = mkIn(ys);
  const ob = device.createBuffer({
    size: n * limbsPerElem * NUM_LIMBS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const pb = paramsBuf(device, n, k);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: yb } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(n / WG);
  log('info', `${name}: n=${n} k=${k} numWgs=${numWgs} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, 1);
  const sanity = await readNonZero(device, ob, limbsPerElem * NUM_LIMBS);
  xb.destroy(); yb.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, algo, n * k, n, reps, samples, sanity);
}

// ---- f32-22 chained Montgomery-product probe ----
// Byte-for-byte the same methodology as runChained2 (same ioLayout(true)
// bind shape, compile path, paramsBuf, timeDispatch, finalize, n*k total
// op count, 1 pass), so the resulting ns/op is directly comparable to the
// Karat-u32 montmul probe. The ONLY differences are dictated by the
// f32-22 shader's data layout: inputs are Float32Array (12×22-bit limbs,
// Mont domain) instead of Uint32Array (20×13-bit), and the output buffer
// / sanity read uses NUM_LIMBS_F32. Mirrors the f32 packing in
// bench-field-mul.ts (separate xs/ys BigIntF32 arrays).
async function runChainedF32Mont(
  device: GPUDevice,
  name: string,
  algo: string,
  code: string,
  n: number,
  k: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const xs = new Float32Array(n * NUM_LIMBS_F32);
  const ys = new Float32Array(n * NUM_LIMBS_F32);
  for (let i = 0; i < n; i++) {
    const aMont = (randomBelow(p, rng) * R) % p;
    const bMont = (randomBelow(p, rng) * R) % p;
    const aLimbs = bigintToLimbsF32(aMont);
    const bLimbs = bigintToLimbsF32(bMont);
    const off = i * NUM_LIMBS_F32;
    for (let j = 0; j < NUM_LIMBS_F32; j++) xs[off + j] = aLimbs[j];
    for (let j = 0; j < NUM_LIMBS_F32; j++) ys[off + j] = bLimbs[j];
  }
  const mkIn = (src: Float32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(xs);
  const yb = mkIn(ys);
  const ob = device.createBuffer({
    size: n * NUM_LIMBS_F32 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const pb = paramsBuf(device, n, k);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: yb } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(n / WG);
  log('info', `${name}: n=${n} k=${k} numWgs=${numWgs} (f32-22, compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, 1);
  const sanity = await readNonZero(device, ob, NUM_LIMBS_F32);
  xb.destroy(); yb.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, algo, n * k, n, reps, samples, sanity);
}

// ---- inversion bench (op 4: single input, inv3 layout) ----
async function runInv(
  device: GPUDevice,
  code: string,
  n: number,
  k: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
  name = 'field_inversion',
  algo = 'fr_inv_by (BY safegcd)',
): Promise<OpResult> {
  const layout = ioLayout(device, false);
  const pipeline = await compile(device, code, 'inv', layout);
  const rng = makeRng(seed);
  const xs = randLimbBuf(n, R, p, rng);
  const xb = device.createBuffer({ size: xs.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(xb, 0, xs);
  const ob = device.createBuffer({ size: n * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const pb = paramsBuf(device, n, k);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: ob } },
      { binding: 2, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(n / WG);
  log('info', `inv: n=${n} k=${k} numWgs=${numWgs} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, 1);
  const sanity = await readNonZero(device, ob, NUM_LIMBS);
  xb.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, algo, n * k, n, reps, samples, sanity);
}

// ---- batch-affine bench (op 5: gen_bench_batch_affine_shader) ----
async function runBatchAffine(
  device: GPUDevice,
  sm: ShaderManager,
  totalPairs: number,
  batchSize: number,
  tpb: number,
  numDispatches: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const code = sm.gen_bench_batch_affine_shader(batchSize, tpb);
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipeline = await compile(device, code, 'batch-affine', layout);

  // Per pair: [P.x, P.y, Q.x, Q.y] random Mont, P.x != Q.x.
  const rng = makeRng(seed);
  const inBuf = new Uint32Array(totalPairs * 4 * NUM_LIMBS);
  for (let kk = 0; kk < totalPairs; kk++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R) % p;
      qxM = (randomBelow(p, rng) * R) % p;
    } while (pxM === qxM);
    const coords = [pxM, (randomBelow(p, rng) * R) % p, qxM, (randomBelow(p, rng) * R) % p];
    const base = kk * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const limbs = bigintToLimbs(coords[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inBuf[base + c * NUM_LIMBS + j] = limbs[j];
    }
  }
  const inputsBuf = device.createBuffer({
    size: inBuf.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputsBuf, 0, inBuf);
  const prefixBuf = device.createBuffer({ size: totalPairs * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const outputsBuf = device.createBuffer({
    size: totalPairs * 2 * NUM_LIMBS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: inputsBuf } },
      { binding: 1, resource: { buffer: prefixBuf } },
      { binding: 2, resource: { buffer: outputsBuf } },
    ],
  });
  const numWgs = totalPairs / batchSize;
  const threads = numWgs * tpb;
  log(
    'info',
    `batch_affine: pairs=${totalPairs} B=${batchSize} tpb=${tpb} numWgs=${numWgs} ` +
      `threads=${threads} dispatches=${numDispatches} (compiling+timing)`,
  );
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, numDispatches);
  const sanity = await readNonZero(device, outputsBuf, 2 * NUM_LIMBS);
  inputsBuf.destroy(); prefixBuf.destroy(); outputsBuf.destroy();
  return finalize(
    'batch_affine_add',
    'batch_affine pipeline (scan+inv+backwalk+add)',
    totalPairs * numDispatches,
    threads,
    reps,
    samples,
    sanity,
  );
}

// ---- generic 4-binding batch-affine-family runner (diagnostics) ----
// xs/ys/outputs are storage; params = (nThreads, kParam). Runs
// `numDispatches` passes per timed submit (so total_ops can hit ~1M with a
// bounded input buffer, same convention as runBatchAffine).
async function runBA4(
  device: GPUDevice,
  name: string,
  algo: string,
  code: string,
  nThreads: number,
  kParam: number,
  xsElems: number,
  ysElems: number,
  outElems: number,
  totalOps: number,
  threadsForReport: number,
  numDispatches: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const xs = randLimbBuf(xsElems, R, p, rng);
  const ys = randLimbBuf(Math.max(1, ysElems), R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(xs);
  const yb = mkIn(ys);
  const ob = device.createBuffer({
    size: outElems * NUM_LIMBS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const pb = paramsBuf(device, nThreads, kParam);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: yb } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(nThreads / WG);
  log('info', `${name}: nThreads=${nThreads} k=${kParam} numWgs=${numWgs} dispatches=${numDispatches} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, numDispatches);
  const sanity = await readNonZero(device, ob, NUM_LIMBS);
  xb.destroy(); yb.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, algo, totalOps, threadsForReport, reps, samples, sanity);
}

// ---- fully-coalesced SoA + vec4 batch-affine runners ----
// Layout: each BigInt = 20 u32 limbs = 5 vec4<u32> groups (VG=5). For
// coordinate plane c and vec4-group v in 0..4, pair e of N pairs:
//   vec4 index = (c*VG + v)*N + e
//   u32  index = ((c*VG + v)*N + e)*4 + lane   (lane 0..3)
// Consecutive pairs e,e+1 in the same (c,v) are adjacent vec4 slots =>
// fully coalesced GPU loads.
const VG_SOA = 5; // NUM_LIMBS(20) / 4

// Pack random Montgomery P.x,P.y,Q.x,Q.y (P.x != Q.x) for `pairs` pairs
// into the SoA/vec4 u32 layout (4 planes, each VG*pairs vec4).
function packAffineSoA(pairs: number, R: bigint, p: bigint, rng: () => number): Uint32Array {
  const N = pairs;
  const buf = new Uint32Array(4 * VG_SOA * N * 4);
  for (let e = 0; e < N; e++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R) % p;
      qxM = (randomBelow(p, rng) * R) % p;
    } while (pxM === qxM);
    const coords = [pxM, (randomBelow(p, rng) * R) % p, qxM, (randomBelow(p, rng) * R) % p];
    for (let c = 0; c < 4; c++) {
      const limbs = bigintToLimbs(coords[c]);
      for (let v = 0; v < VG_SOA; v++) {
        const base = ((c * VG_SOA + v) * N + e) * 4;
        buf[base + 0] = limbs[4 * v + 0];
        buf[base + 1] = limbs[4 * v + 1];
        buf[base + 2] = limbs[4 * v + 2];
        buf[base + 3] = limbs[4 * v + 3];
      }
    }
  }
  return buf;
}

// inv_dx plane in the same SoA/vec4 layout (single plane, VG*pairs vec4).
function packInvDxSoA(pairs: number, R: bigint, p: bigint, rng: () => number): Uint32Array {
  const N = pairs;
  const buf = new Uint32Array(VG_SOA * N * 4);
  for (let e = 0; e < N; e++) {
    const m = (randomBelow(p, rng) * R) % p;
    const limbs = bigintToLimbs(m);
    for (let v = 0; v < VG_SOA; v++) {
      const base = (v * N + e) * 4;
      buf[base + 0] = limbs[4 * v + 0];
      buf[base + 1] = limbs[4 * v + 1];
      buf[base + 2] = limbs[4 * v + 2];
      buf[base + 3] = limbs[4 * v + 3];
    }
  }
  return buf;
}

// SoA+vec4 lean-affine apply: n = pairs threads (1 thread/pair), supplied
// random inv_dx. Isolates coalesced+vec4 load/store cost on the apply.
async function runApplySoa(
  device: GPUDevice,
  name: string,
  code: string,
  pairs: number,
  wg: number,
  disp: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const inU32 = packAffineSoA(pairs, R, p, rng);
  const invU32 = packInvDxSoA(pairs, R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(inU32);
  const ib = mkIn(invU32);
  const ob = device.createBuffer({
    size: 2 * VG_SOA * pairs * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const pb = paramsBuf(device, pairs, 0);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: ib } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(pairs / wg);
  log('info', `${name}: pairs=${pairs} wg=${wg} numWgs=${numWgs} dispatches=${disp} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, disp);
  const sanity = await readNonZero(device, ob, NUM_LIMBS);
  xb.destroy(); ib.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, 'SoA+vec4 lean affine apply, 1 thread/pair', pairs * disp, pairs, reps, samples, sanity);
}

// SoA+vec4 software-pipelined lean-affine apply: each thread owns W
// INDEPENDENT pairs, the formula run stage-by-stage across the W lanes
// so the W montmuls of each montmul stage are mutually independent and
// pipeline (hides montmul latency vs the W=1 apply_precomputed_k1
// anchor). Reuses the apply_precomputed SoA inv_dx packers
// (packAffineSoA / packInvDxSoA); the buffer/thread count is padded up
// to a multiple of W so every lane does real work. realPairs fixes the
// reported op count; threads = padPairs/W.
async function runApplyIlpSoa(
  device: GPUDevice,
  name: string,
  code: string,
  realPairs: number,
  w: number,
  wg: number,
  disp: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const T = Math.ceil(realPairs / w);
  const padPairs = T * w;
  const inU32 = packAffineSoA(padPairs, R, p, rng);
  const invU32 = packInvDxSoA(padPairs, R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(inU32);
  const ib = mkIn(invU32);
  const ob = device.createBuffer({
    size: 2 * VG_SOA * padPairs * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const pb = paramsBuf(device, padPairs, T);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: ib } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(T / wg);
  log('info', `${name}: realPairs=${realPairs} W=${w} padPairs=${padPairs} T=${T} wg=${wg} numWgs=${numWgs} dispatches=${disp} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, disp);
  const sanity = await readNonZero(device, ob, NUM_LIMBS);
  xb.destroy(); ib.destroy(); ob.destroy(); pb.destroy();
  return finalize(
    name,
    `SoA+vec4 software-pipelined lean affine apply, W=${w} independent pairs/thread`,
    realPairs * disp, T, reps, samples, sanity,
  );
}

// SoA+vec4 single-kernel batched-inverse fused batch-affine. T = pairs/chunk
// threads, strided chunk assignment (thread t -> pairs {t + i*T}).
async function runFusedSoa(
  device: GPUDevice,
  name: string,
  code: string,
  pairs: number,
  chunk: number,
  wg: number,
  disp: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const inU32 = packAffineSoA(pairs, R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(inU32);
  const dummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const ob = device.createBuffer({
    size: 2 * VG_SOA * pairs * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const T = pairs / chunk;
  const pb = paramsBuf(device, pairs, T);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: dummy } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(T / wg);
  log('info', `${name}: pairs=${pairs} chunk=${chunk} T=${T} wg=${wg} numWgs=${numWgs} dispatches=${disp} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, disp);
  const sanity = await readNonZero(device, ob, NUM_LIMBS);
  xb.destroy(); dummy.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, `SoA+vec4 fused batched-inverse, chunk=${chunk}`, pairs * disp, T, reps, samples, sanity);
}

// ---- packed 8x u32 SoA runner for ba_rev_packed_carry_bench ----
// Layout: each 254-bit Montgomery field element is stored as the packed
// 8x u32 little-endian integer (32 bytes = 2x vec4<u32>, PG=2). For
// coordinate plane c (0=A.x, 1=A.y, 2=P.x, 3=P.y) and pair e of N,
//   vec4 index = c * 2 * N + 2 * e + {0, 1}
//   u32  index = (c * 2 * N + 2 * e + {0, 1}) * 4 + lane
// Consecutive pairs e,e+1 in the same (c,sub) are adjacent vec4 slots.
const PG_SOA = 2; // 8 packed u32 / 4 = 2 vec4 groups

// Convert a Montgomery-form bigint to 8 u32 little-endian words.
function bigintToPackedU32x8(v: bigint): Uint32Array {
  const w = new Uint32Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    w[i] = Number(x & 0xffffffffn);
    x >>= 32n;
  }
  return w;
}

// Pack random Montgomery P.x,P.y,Q.x,Q.y (P.x != Q.x) for `pairs` pairs
// into the packed-8xu32 SoA layout (4 planes, each PG*pairs vec4).
function packAffineSoAPacked(pairs: number, R: bigint, p: bigint, rng: () => number): Uint32Array {
  const N = pairs;
  const buf = new Uint32Array(4 * PG_SOA * N * 4);
  for (let e = 0; e < N; e++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R) % p;
      qxM = (randomBelow(p, rng) * R) % p;
    } while (pxM === qxM);
    const coords = [pxM, (randomBelow(p, rng) * R) % p, qxM, (randomBelow(p, rng) * R) % p];
    for (let c = 0; c < 4; c++) {
      const words = bigintToPackedU32x8(coords[c]);
      for (let v = 0; v < PG_SOA; v++) {
        const base = ((c * PG_SOA + v) * N + e) * 4;
        buf[base + 0] = words[4 * v + 0];
        buf[base + 1] = words[4 * v + 1];
        buf[base + 2] = words[4 * v + 2];
        buf[base + 3] = words[4 * v + 3];
      }
    }
  }
  return buf;
}

// SoA+packed8xu32 single-kernel batched-inverse fused batch-affine.
// Mirror of runFusedSoa but with the packed (PG=2 vec4/elem) input and
// output layout that ba_rev_packed_carry_bench consumes.
async function runFusedSoaPacked(
  device: GPUDevice,
  name: string,
  code: string,
  pairs: number,
  chunk: number,
  wg: number,
  disp: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const inU32 = packAffineSoAPacked(pairs, R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(inU32);
  const dummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const ob = device.createBuffer({
    size: 2 * PG_SOA * pairs * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const T = pairs / chunk;
  const pb = paramsBuf(device, pairs, T);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: dummy } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(T / wg);
  log('info', `${name}: pairs=${pairs} chunk=${chunk} T=${T} wg=${wg} numWgs=${numWgs} dispatches=${disp} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, disp);
  // sanity: read 8 u32 (one packed elem) from the first output plane.
  const sanity = await readNonZero(device, ob, 8);
  xb.destroy(); dummy.destroy(); ob.destroy(); pb.destroy();
  return finalize(
    name,
    `SoA+packed-8xu32 fused batched-inverse (ba_rev_packed_carry), chunk=${chunk}`,
    pairs * disp, T, reps, samples, sanity,
  );
}

// AoS inputs for the affine apply/fused family: `pairs` pairs, each
// [P.x, P.y, Q.x, Q.y] random Montgomery, P.x != Q.x.
function packAffineAoS(pairs: number, R: bigint, p: bigint, rng: () => number): Uint32Array {
  const buf = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R) % p;
      qxM = (randomBelow(p, rng) * R) % p;
    } while (pxM === qxM);
    const coords = [pxM, (randomBelow(p, rng) * R) % p, qxM, (randomBelow(p, rng) * R) % p];
    const base = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const limbs = bigintToLimbs(coords[c]);
      for (let j = 0; j < NUM_LIMBS; j++) buf[base + c * NUM_LIMBS + j] = limbs[j];
    }
  }
  return buf;
}

// AoS software-pipelined (stage-interleaved) affine apply: each thread
// owns m INDEPENDENT pairs, supplied random inv_dx. T = pairs/m threads,
// strided pair assignment (thread t -> pairs {t + s*T}). Isolates the
// stage-interleaved apply cost (montmul latency hiding at modest T).
async function runApplyIl(
  device: GPUDevice,
  name: string,
  code: string,
  pairs: number,
  m: number,
  wg: number,
  disp: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const inU32 = packAffineAoS(pairs, R, p, rng);
  const invU32 = randLimbBuf(pairs, R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(inU32);
  const ib = mkIn(invU32);
  const ob = device.createBuffer({
    size: pairs * 2 * NUM_LIMBS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const T = pairs / m;
  const pb = paramsBuf(device, T, m);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: ib } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(T / wg);
  log('info', `${name}: pairs=${pairs} m=${m} T=${T} wg=${wg} numWgs=${numWgs} dispatches=${disp} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, disp);
  const sanity = await readNonZero(device, ob, NUM_LIMBS);
  xb.destroy(); ib.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, `AoS stage-interleaved affine apply, m=${m}`, pairs * disp, T, reps, samples, sanity);
}

// AoS interleave-free M-serial affine apply: each thread owns m
// INDEPENDENT pairs and processes them STRICTLY SERIALLY (no
// array<BigInt,m>, no state carried across the m iterations). Peak live
// = one pair's working set regardless of m. T = pairs/m threads,
// strided pair assignment (thread t -> pairs {t + s*T}), supplied
// random inv_dx. ns/op = wall/(pairs*disp) so it is directly comparable
// to the 1-pair/thread apply anchor (per affine pair).
async function runApplySerial(
  device: GPUDevice,
  name: string,
  code: string,
  pairs: number,
  m: number,
  wg: number,
  disp: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const inU32 = packAffineAoS(pairs, R, p, rng);
  const invU32 = randLimbBuf(pairs, R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(inU32);
  const ib = mkIn(invU32);
  const ob = device.createBuffer({
    size: pairs * 2 * NUM_LIMBS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const T = pairs / m;
  const pb = paramsBuf(device, T, m);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: ib } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(T / wg);
  log('info', `${name}: pairs=${pairs} m=${m} T=${T} wg=${wg} numWgs=${numWgs} dispatches=${disp} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, disp);
  const sanity = await readNonZero(device, ob, NUM_LIMBS);
  xb.destroy(); ib.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, `AoS interleave-free M-serial affine apply, m=${m}`, pairs * disp, T, reps, samples, sanity);
}

// AoS software-pipelined single-kernel BATCHED-inverse fused batch-affine.
// T = pairs/chunk threads, strided chunk assignment (thread t -> pairs
// {t + i*T}). One fr_inv_by_a per chunk; formula stage-interleaved.
async function runFusedIl(
  device: GPUDevice,
  name: string,
  code: string,
  pairs: number,
  chunk: number,
  wg: number,
  disp: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const pipeline = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const inU32 = packAffineAoS(pairs, R, p, rng);
  const mkIn = (src: Uint32Array) => {
    const b = device.createBuffer({ size: src.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, src);
    return b;
  };
  const xb = mkIn(inU32);
  const dummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const ob = device.createBuffer({
    size: pairs * 2 * NUM_LIMBS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const T = pairs / chunk;
  const pb = paramsBuf(device, T, 0);
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: dummy } },
      { binding: 2, resource: { buffer: ob } },
      { binding: 3, resource: { buffer: pb } },
    ],
  });
  const numWgs = Math.ceil(T / wg);
  log('info', `${name}: pairs=${pairs} chunk=${chunk} T=${T} wg=${wg} numWgs=${numWgs} dispatches=${disp} (compiling+timing)`);
  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, disp);
  const sanity = await readNonZero(device, ob, NUM_LIMBS);
  xb.destroy(); dummy.destroy(); ob.destroy(); pb.destroy();
  return finalize(name, `AoS stage-interleaved fused batched-inverse, chunk=${chunk}`, pairs * disp, T, reps, samples, sanity);
}

// ---- two-kernel pipeline runner: stage1 inv-only -> inv_dx buffer,
// stage2 affine apply reads it. Times stage1+stage2 together (apply
// depends on inv_dx). total_ops = pairs * numDispatches. ----
async function runTwoKernel(
  device: GPUDevice,
  name: string,
  algo: string,
  invCode: string,
  applyCode: string,
  pairs: number,
  ch: number,
  numDispatches: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
  applyM = 1,
  wg: number = WG,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const invPipe = await compile(device, invCode, `${name}-inv`, layout);
  const applyPipe = await compile(device, applyCode, `${name}-apply`, layout);
  const rng = makeRng(seed);
  // inputs: 4 BigInt/pair, P.x != Q.x.
  const inBuf = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R) % p;
      qxM = (randomBelow(p, rng) * R) % p;
    } while (pxM === qxM);
    const coords = [pxM, (randomBelow(p, rng) * R) % p, qxM, (randomBelow(p, rng) * R) % p];
    const base = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const limbs = bigintToLimbs(coords[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inBuf[base + c * NUM_LIMBS + j] = limbs[j];
    }
  }
  const xb = device.createBuffer({ size: inBuf.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(xb, 0, inBuf);
  const invDx = device.createBuffer({ size: pairs * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const outBuf = device.createBuffer({ size: pairs * 2 * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const dummy = device.createBuffer({ size: NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const invThreads = pairs / ch;
  const invParams = paramsBuf(device, invThreads, ch);
  const applyThreads = pairs / applyM;
  const applyParams = paramsBuf(device, applyThreads, applyM);
  // inv stage: xs=inputs, ys=dummy, outputs=invDx
  const invBind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: dummy } },
      { binding: 2, resource: { buffer: invDx } },
      { binding: 3, resource: { buffer: invParams } },
    ],
  });
  // apply stage: xs=inputs, ys=invDx, outputs=outBuf
  const applyBind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: invDx } },
      { binding: 2, resource: { buffer: outBuf } },
      { binding: 3, resource: { buffer: applyParams } },
    ],
  });
  const invWgs = Math.ceil(invThreads / wg);
  const applyWgs = Math.ceil(applyThreads / wg);
  const runPasses = (enc: GPUCommandEncoder) => {
    for (let d = 0; d < numDispatches; d++) {
      const p1 = enc.beginComputePass();
      p1.setPipeline(invPipe); p1.setBindGroup(0, invBind);
      p1.dispatchWorkgroups(invWgs, 1, 1); p1.end();
      const p2 = enc.beginComputePass();
      p2.setPipeline(applyPipe); p2.setBindGroup(0, applyBind);
      p2.dispatchWorkgroups(applyWgs, 1, 1); p2.end();
    }
  };
  { const e = device.createCommandEncoder(); runPasses(e); device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); }
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const e = device.createCommandEncoder();
    runPasses(e);
    const t0 = performance.now();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  const sanity = await readNonZero(device, outBuf, 2 * NUM_LIMBS);
  xb.destroy(); invDx.destroy(); outBuf.destroy(); dummy.destroy(); invParams.destroy(); applyParams.destroy();
  log('info', `${name}: pairs=${pairs} ch=${ch} invThreads=${invThreads} dispatches=${numDispatches}`);
  return finalize(name, algo, pairs * numDispatches, pairs, reps, samples, sanity);
}

// SoA two-kernel pipeline. xs limb-major: 4 coord planes, each
// [limb*S + pair]; inv_dx 1 plane; outputs 2 planes. params=(n,k,S,0).
async function runTwoKernelSoA(
  device: GPUDevice,
  name: string,
  algo: string,
  invCode: string,
  applyCode: string,
  pairs: number,
  ch: number,
  numDispatches: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const layout = ioLayout(device, true);
  const invPipe = await compile(device, invCode, `${name}-inv`, layout);
  const applyPipe = await compile(device, applyCode, `${name}-apply`, layout);
  const rng = makeRng(seed);
  const S = pairs;
  const plane = S * NUM_LIMBS;
  const xsArr = new Uint32Array(4 * plane);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R) % p;
      qxM = (randomBelow(p, rng) * R) % p;
    } while (pxM === qxM);
    const coords = [pxM, (randomBelow(p, rng) * R) % p, qxM, (randomBelow(p, rng) * R) % p];
    for (let c = 0; c < 4; c++) {
      const limbs = bigintToLimbs(coords[c]);
      for (let j = 0; j < NUM_LIMBS; j++) xsArr[c * plane + j * S + g] = limbs[j];
    }
  }
  const xb = device.createBuffer({ size: xsArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(xb, 0, xsArr);
  const invDx = device.createBuffer({ size: plane * 4, usage: GPUBufferUsage.STORAGE });
  const outBuf = device.createBuffer({ size: 2 * plane * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const dummy = device.createBuffer({ size: NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const invThreads = pairs / ch;
  const invParams = paramsBuf(device, invThreads, ch, S);
  const applyParams = paramsBuf(device, pairs, 1, S);
  const invBind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: dummy } },
      { binding: 2, resource: { buffer: invDx } },
      { binding: 3, resource: { buffer: invParams } },
    ],
  });
  const applyBind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: xb } },
      { binding: 1, resource: { buffer: invDx } },
      { binding: 2, resource: { buffer: outBuf } },
      { binding: 3, resource: { buffer: applyParams } },
    ],
  });
  const invWgs = Math.ceil(invThreads / WG);
  const applyWgs = Math.ceil(pairs / WG);
  const runPasses = (enc: GPUCommandEncoder) => {
    for (let d = 0; d < numDispatches; d++) {
      const p1 = enc.beginComputePass();
      p1.setPipeline(invPipe); p1.setBindGroup(0, invBind);
      p1.dispatchWorkgroups(invWgs, 1, 1); p1.end();
      const p2 = enc.beginComputePass();
      p2.setPipeline(applyPipe); p2.setBindGroup(0, applyBind);
      p2.dispatchWorkgroups(applyWgs, 1, 1); p2.end();
    }
  };
  { const e = device.createCommandEncoder(); runPasses(e); device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); }
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const e = device.createCommandEncoder();
    runPasses(e);
    const t0 = performance.now();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  const sanity = await readNonZero(device, outBuf, NUM_LIMBS);
  xb.destroy(); invDx.destroy(); outBuf.destroy(); dummy.destroy(); invParams.destroy(); applyParams.destroy();
  log('info', `${name}: pairs=${pairs} ch=${ch} invThreads=${invThreads} dispatches=${numDispatches}`);
  return finalize(name, algo, pairs * numDispatches, pairs, reps, samples, sanity);
}

// 3-kernel segmented batch-inverse pipeline: fwd (prefix→global) ->
// inv (1 inversion, single thread) -> bwd (peel + lean formula). Per
// thread register state is O(1) in fwd/bwd; prefix products live in
// global memory; chunk = segment size S amortises the single inversion
// across all pairs.
async function runSegmented(
  device: GPUDevice,
  name: string,
  algo: string,
  fwdCode: string,
  invCode: string,
  bwdCode: string,
  pairs: number,
  S: number,
  numDispatches: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const T = pairs / S;
  const ro = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } });
  const st = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } });
  const un = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } });
  const fwdL = device.createBindGroupLayout({ entries: [ro(0), st(1), st(2), un(3)] });
  const invL = device.createBindGroupLayout({ entries: [ro(0), st(1), st(2), un(3)] });
  const bwdL = device.createBindGroupLayout({ entries: [ro(0), ro(1), ro(2), st(3), un(4)] });
  const fwdPipe = await compile(device, fwdCode, `${name}-fwd`, fwdL);
  const invPipe = await compile(device, invCode, `${name}-inv`, invL);
  const bwdPipe = await compile(device, bwdCode, `${name}-bwd`, bwdL);

  const rng = makeRng(seed);
  const inArr = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R) % p;
      qxM = (randomBelow(p, rng) * R) % p;
    } while (pxM === qxM);
    const co = [pxM, (randomBelow(p, rng) * R) % p, qxM, (randomBelow(p, rng) * R) % p];
    const b0 = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const L = bigintToLimbs(co[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inArr[b0 + c * NUM_LIMBS + j] = L[j];
    }
  }
  const inp = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inp, 0, inArr);
  const prefixb = device.createBuffer({ size: pairs * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const segtot = device.createBuffer({ size: T * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const segseed = device.createBuffer({ size: T * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const scratch = device.createBuffer({ size: NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const outp = device.createBuffer({ size: pairs * 2 * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const fwdParams = paramsBuf(device, T, S);
  const invParams = paramsBuf(device, T, 0);
  const bwdParams = paramsBuf(device, T, S);

  const fwdBind = device.createBindGroup({ layout: fwdL, entries: [
    { binding: 0, resource: { buffer: inp } }, { binding: 1, resource: { buffer: prefixb } },
    { binding: 2, resource: { buffer: segtot } }, { binding: 3, resource: { buffer: fwdParams } } ] });
  const invBind = device.createBindGroup({ layout: invL, entries: [
    { binding: 0, resource: { buffer: segtot } }, { binding: 1, resource: { buffer: segseed } },
    { binding: 2, resource: { buffer: scratch } }, { binding: 3, resource: { buffer: invParams } } ] });
  const bwdBind = device.createBindGroup({ layout: bwdL, entries: [
    { binding: 0, resource: { buffer: inp } }, { binding: 1, resource: { buffer: prefixb } },
    { binding: 2, resource: { buffer: segseed } }, { binding: 3, resource: { buffer: outp } },
    { binding: 4, resource: { buffer: bwdParams } } ] });

  const segWgs = Math.ceil(T / WG);
  const runPasses = (enc: GPUCommandEncoder) => {
    for (let d = 0; d < numDispatches; d++) {
      let pp = enc.beginComputePass();
      pp.setPipeline(fwdPipe); pp.setBindGroup(0, fwdBind); pp.dispatchWorkgroups(segWgs, 1, 1); pp.end();
      pp = enc.beginComputePass();
      pp.setPipeline(invPipe); pp.setBindGroup(0, invBind); pp.dispatchWorkgroups(1, 1, 1); pp.end();
      pp = enc.beginComputePass();
      pp.setPipeline(bwdPipe); pp.setBindGroup(0, bwdBind); pp.dispatchWorkgroups(segWgs, 1, 1); pp.end();
    }
  };
  { const e = device.createCommandEncoder(); runPasses(e); device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); }
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const e = device.createCommandEncoder();
    runPasses(e);
    const t0 = performance.now();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  const sanity = await readNonZero(device, outp, 2 * NUM_LIMBS);
  inp.destroy(); prefixb.destroy(); segtot.destroy(); segseed.destroy(); scratch.destroy(); outp.destroy();
  fwdParams.destroy(); invParams.destroy(); bwdParams.destroy();
  log('info', `${name}: pairs=${pairs} S=${S} T=${T} dispatches=${numDispatches}`);
  return finalize(name, algo, pairs * numDispatches, pairs, reps, samples, sanity);
}

// Isolated block Blelloch parallel prefix-product throughput.
async function runScanPrim(
  device: GPUDevice,
  name: string,
  algo: string,
  code: string,
  pairs: number,
  blk: number,
  numDispatches: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const ro = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } });
  const st = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } });
  const un = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } });
  const layout = device.createBindGroupLayout({ entries: [ro(0), st(1), st(2), un(3)] });
  const pipe = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const inArr = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R) % p;
      qxM = (randomBelow(p, rng) * R) % p;
    } while (pxM === qxM);
    const co = [pxM, (randomBelow(p, rng) * R) % p, qxM, (randomBelow(p, rng) * R) % p];
    const b0 = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const L = bigintToLimbs(co[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inArr[b0 + c * NUM_LIMBS + j] = L[j];
    }
  }
  const inp = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inp, 0, inArr);
  const nblk = Math.ceil(pairs / blk);
  const prefixb = device.createBuffer({ size: pairs * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const blocktot = device.createBuffer({ size: nblk * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const pp = paramsBuf(device, pairs, 0);
  const bind = device.createBindGroup({ layout, entries: [
    { binding: 0, resource: { buffer: inp } }, { binding: 1, resource: { buffer: prefixb } },
    { binding: 2, resource: { buffer: blocktot } }, { binding: 3, resource: { buffer: pp } } ] });
  const samples = await timeDispatch(device, pipe, bind, nblk, reps, numDispatches);
  const sanity = await readNonZero(device, prefixb, NUM_LIMBS);
  inp.destroy(); prefixb.destroy(); blocktot.destroy(); pp.destroy();
  log('info', `${name}: pairs=${pairs} blk=${blk} nblk=${nblk}`);
  return finalize(name, algo, pairs * numDispatches, pairs, reps, samples, sanity);
}

// Isolated register-blocked work-efficient scan primitive throughput
// (K1 only: 5 bindings, extra per-thread-total buffer).
async function runRbsScan(
  device: GPUDevice,
  name: string,
  algo: string,
  code: string,
  pairs: number,
  R: number,
  tpb: number,
  numDispatches: number,
  reps: number,
  R_: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const ro = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } });
  const st = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } });
  const un = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } });
  const layout = device.createBindGroupLayout({ entries: [ro(0), st(1), st(2), un(3), st(4)] });
  const pipe = await compile(device, code, name, layout);
  const rng = makeRng(seed);
  const inArr = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R_) % p;
      qxM = (randomBelow(p, rng) * R_) % p;
    } while (pxM === qxM);
    const co = [pxM, (randomBelow(p, rng) * R_) % p, qxM, (randomBelow(p, rng) * R_) % p];
    const b0 = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const L = bigintToLimbs(co[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inArr[b0 + c * NUM_LIMBS + j] = L[j];
    }
  }
  const inp = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inp, 0, inArr);
  const blkPairs = tpb * R;
  const nblk = Math.ceil(pairs / blkPairs);
  const nthreads = nblk * tpb;
  const prefixb = device.createBuffer({ size: pairs * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const blocktot = device.createBuffer({ size: nblk * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const thtot = device.createBuffer({ size: nthreads * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const pp = paramsBuf(device, pairs, 0);
  const bind = device.createBindGroup({ layout, entries: [
    { binding: 0, resource: { buffer: inp } }, { binding: 1, resource: { buffer: prefixb } },
    { binding: 2, resource: { buffer: blocktot } }, { binding: 3, resource: { buffer: pp } },
    { binding: 4, resource: { buffer: thtot } } ] });
  const samples = await timeDispatch(device, pipe, bind, nblk, reps, numDispatches);
  const sanity = await readNonZero(device, prefixb, NUM_LIMBS);
  inp.destroy(); prefixb.destroy(); blocktot.destroy(); thtot.destroy(); pp.destroy();
  log('info', `${name}: pairs=${pairs} R=${R} tpb=${tpb} nblk=${nblk} nthreads=${nthreads}`);
  return finalize(name, algo, pairs * numDispatches, pairs, reps, samples, sanity);
}

// Full register-blocked batch-affine pipeline: K1 RBS scan (writes
// per-thread totals), K2 single-thread seed (one inversion, two-pass
// exclusive scan ⇒ 1/threadTotal), K3 fully-local backward peel + lean
// formula. Threads counted as the K1/K3 grid (pairs/R).
async function runRbs(
  device: GPUDevice,
  name: string,
  algo: string,
  scanCode: string,
  seedCode: string,
  bwdCode: string,
  pairs: number,
  R: number,
  tpb: number,
  numDispatches: number,
  reps: number,
  R_: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const blkPairs = tpb * R;
  const nblk = Math.ceil(pairs / blkPairs);
  const nthreads = nblk * tpb;
  const ro = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } });
  const stB = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } });
  const un = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } });
  // fwd: 0 inp(ro) 1 thpre(st) 2 thsuf(st) 3 params(un) 4 blocktot(st) 5 prefixb(st)
  const scanL = device.createBindGroupLayout({ entries: [ro(0), stB(1), stB(2), un(3), stB(4), stB(5)] });
  // seed: 0 blocktot(ro) 1 blkseed(st) 2 scratch(st) 3 params(un)
  const seedL = device.createBindGroupLayout({ entries: [ro(0), stB(1), stB(2), un(3)] });
  // bwd: 0 inp(ro) 1 thpre(ro) 2 outp(st) 3 params(un) 4 thsuf(ro) 5 blkseed(ro) 6 prefixb(ro)
  const bwdL = device.createBindGroupLayout({ entries: [ro(0), ro(1), stB(2), un(3), ro(4), ro(5), ro(6)] });
  const scanPipe = await compile(device, scanCode, `${name}-scan`, scanL);
  const seedPipe = await compile(device, seedCode, `${name}-seed`, seedL);
  const bwdPipe = await compile(device, bwdCode, `${name}-bwd`, bwdL);

  const rng = makeRng(seed);
  const inArr = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R_) % p;
      qxM = (randomBelow(p, rng) * R_) % p;
    } while (pxM === qxM);
    const co = [pxM, (randomBelow(p, rng) * R_) % p, qxM, (randomBelow(p, rng) * R_) % p];
    const b0 = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const L = bigintToLimbs(co[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inArr[b0 + c * NUM_LIMBS + j] = L[j];
    }
  }
  const inp = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inp, 0, inArr);
  const thpre = device.createBuffer({ size: nthreads * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const thsuf = device.createBuffer({ size: nthreads * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const prefixb = device.createBuffer({ size: pairs * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const blocktot = device.createBuffer({ size: nblk * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const blkseed = device.createBuffer({ size: nblk * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const scratch = device.createBuffer({ size: NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const outp = device.createBuffer({ size: pairs * 2 * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const scanParams = paramsBuf(device, pairs, 0);
  const seedParams = paramsBuf(device, nblk, 0);
  const bwdParams = paramsBuf(device, pairs, 0);

  const scanBind = device.createBindGroup({ layout: scanL, entries: [
    { binding: 0, resource: { buffer: inp } }, { binding: 1, resource: { buffer: thpre } },
    { binding: 2, resource: { buffer: thsuf } }, { binding: 3, resource: { buffer: scanParams } },
    { binding: 4, resource: { buffer: blocktot } }, { binding: 5, resource: { buffer: prefixb } } ] });
  const seedBind = device.createBindGroup({ layout: seedL, entries: [
    { binding: 0, resource: { buffer: blocktot } }, { binding: 1, resource: { buffer: blkseed } },
    { binding: 2, resource: { buffer: scratch } }, { binding: 3, resource: { buffer: seedParams } } ] });
  const bwdBind = device.createBindGroup({ layout: bwdL, entries: [
    { binding: 0, resource: { buffer: inp } }, { binding: 1, resource: { buffer: thpre } },
    { binding: 2, resource: { buffer: outp } }, { binding: 3, resource: { buffer: bwdParams } },
    { binding: 4, resource: { buffer: thsuf } }, { binding: 5, resource: { buffer: blkseed } },
    { binding: 6, resource: { buffer: prefixb } } ] });

  const runPasses = (enc: GPUCommandEncoder) => {
    for (let d = 0; d < numDispatches; d++) {
      let pp = enc.beginComputePass();
      pp.setPipeline(scanPipe); pp.setBindGroup(0, scanBind); pp.dispatchWorkgroups(nblk, 1, 1); pp.end();
      pp = enc.beginComputePass();
      pp.setPipeline(seedPipe); pp.setBindGroup(0, seedBind); pp.dispatchWorkgroups(1, 1, 1); pp.end();
      pp = enc.beginComputePass();
      pp.setPipeline(bwdPipe); pp.setBindGroup(0, bwdBind); pp.dispatchWorkgroups(nblk, 1, 1); pp.end();
    }
  };
  { const e = device.createCommandEncoder(); runPasses(e); device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); }
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const e = device.createCommandEncoder();
    runPasses(e);
    const t0 = performance.now();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  const sanity = await readNonZero(device, outp, 2 * NUM_LIMBS);
  inp.destroy(); thpre.destroy(); thsuf.destroy(); prefixb.destroy(); blocktot.destroy(); blkseed.destroy();
  scratch.destroy(); outp.destroy(); scanParams.destroy(); seedParams.destroy(); bwdParams.destroy();
  log('info', `${name}: pairs=${pairs} R=${R} tpb=${tpb} nblk=${nblk} nthreads=${nthreads} disp=${numDispatches}`);
  return finalize(name, algo, pairs * numDispatches, pairs, reps, samples, sanity);
}

// Fully-parallel "tile" batch-affine pipeline: K1 tile scan (1
// thread/pair, Hillis-Steele inclusive prefix+suffix dx over a TPB tile,
// emits per-tile total), K2 single-thread seed (one inversion, two-pass
// exclusive scan over the tiletot array ⇒ tileseed[T]=1/tiletot[T]), K3
// tile apply (1 thread/pair, inv_dx = tileseed·exclPrefix·exclSuffix +
// lean formula). Threads = pairs in K1 and K3 (full occupancy).
// Single fused workgroup-tile batch-affine: ONE kernel, ONE global pass,
// zero global intermediate buffers (the batch-inverse lives in workgroup
// shared memory). 1 thread = 1 pair, 1 workgroup = TPB pairs (a tile).
// Times numDispatches passes of the single pipeline in one submit.
async function runWgTile(
  device: GPUDevice,
  name: string,
  algo: string,
  code: string,
  pairs: number,
  tpb: number,
  numDispatches: number,
  reps: number,
  R_: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const ntiles = Math.ceil(pairs / tpb);
  const ro = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } });
  const stB = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } });
  const un = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } });
  // 0 inp(ro AoS 4/pair) 1 outp(st 2/pair) 2 params(un)
  const layout = device.createBindGroupLayout({ entries: [ro(0), stB(1), un(2)] });
  const pipeline = await compile(device, code, name, layout);

  const rng = makeRng(seed);
  const inArr = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R_) % p;
      qxM = (randomBelow(p, rng) * R_) % p;
    } while (pxM === qxM);
    const co = [pxM, (randomBelow(p, rng) * R_) % p, qxM, (randomBelow(p, rng) * R_) % p];
    const b0 = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const L = bigintToLimbs(co[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inArr[b0 + c * NUM_LIMBS + j] = L[j];
    }
  }
  const inp = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inp, 0, inArr);
  const outp = device.createBuffer({ size: pairs * 2 * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const prm = paramsBuf(device, pairs, 0);
  const bind = device.createBindGroup({ layout, entries: [
    { binding: 0, resource: { buffer: inp } },
    { binding: 1, resource: { buffer: outp } },
    { binding: 2, resource: { buffer: prm } } ] });

  const runPasses = (enc: GPUCommandEncoder) => {
    for (let d = 0; d < numDispatches; d++) {
      const pp = enc.beginComputePass();
      pp.setPipeline(pipeline); pp.setBindGroup(0, bind);
      pp.dispatchWorkgroups(ntiles, 1, 1); pp.end();
    }
  };
  { const e = device.createCommandEncoder(); runPasses(e); device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); }
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const e = device.createCommandEncoder();
    runPasses(e);
    const t0 = performance.now();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  const sanity = await readNonZero(device, outp, 2 * NUM_LIMBS);
  inp.destroy(); outp.destroy(); prm.destroy();
  log('info', `${name}: pairs=${pairs} tpb=${tpb} ntiles=${ntiles} disp=${numDispatches}`);
  return finalize(name, algo, pairs * numDispatches, pairs, reps, samples, sanity);
}

// Single-kernel two-level workgroup-amortised batch-affine. The grid
// runs PAIRS/chunk threads (one per per-thread chunk of `chunk` pairs);
// a workgroup of `tpb` threads owns a contiguous block of tpb*chunk
// pairs and performs exactly ONE field inversion shared across all of
// them. dispatches ceil((PAIRS/chunk)/tpb) workgroups of tpb threads.
// Reports total_ops = PAIRS*disp, threads = PAIRS/chunk.
async function runWgAmort(
  device: GPUDevice,
  name: string,
  code: string,
  pairs: number,
  tpb: number,
  chunk: number,
  wg: number,
  numDispatches: number,
  reps: number,
  R_: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  void wg;
  const nThreads = pairs / chunk;
  const nWgs = Math.ceil(nThreads / tpb);
  const algo =
    `single-kernel two-level wg-amortised batch-affine ` +
    `(1 fr_inv per workgroup over tpb*chunk=${tpb * chunk} pairs) tpb=${tpb} chunk=${chunk}`;
  const ro = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } });
  const stB = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } });
  const un = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } });
  // 0 inp(ro AoS 4/pair) 1 outp(st 2/pair) 2 params(un, x=n_threads)
  const layout = device.createBindGroupLayout({ entries: [ro(0), stB(1), un(2)] });
  const pipeline = await compile(device, code, name, layout);

  const rng = makeRng(seed);
  const inArr = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R_) % p;
      qxM = (randomBelow(p, rng) * R_) % p;
    } while (pxM === qxM);
    const co = [pxM, (randomBelow(p, rng) * R_) % p, qxM, (randomBelow(p, rng) * R_) % p];
    const b0 = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const L = bigintToLimbs(co[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inArr[b0 + c * NUM_LIMBS + j] = L[j];
    }
  }
  const inp = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inp, 0, inArr);
  const outp = device.createBuffer({ size: pairs * 2 * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const prm = paramsBuf(device, nThreads, 0);
  const bind = device.createBindGroup({ layout, entries: [
    { binding: 0, resource: { buffer: inp } },
    { binding: 1, resource: { buffer: outp } },
    { binding: 2, resource: { buffer: prm } } ] });

  const runPasses = (enc: GPUCommandEncoder) => {
    for (let d = 0; d < numDispatches; d++) {
      const pp = enc.beginComputePass();
      pp.setPipeline(pipeline); pp.setBindGroup(0, bind);
      pp.dispatchWorkgroups(nWgs, 1, 1); pp.end();
    }
  };
  { const e = device.createCommandEncoder(); runPasses(e); device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); }
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const e = device.createCommandEncoder();
    runPasses(e);
    const t0 = performance.now();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  const sanity = await readNonZero(device, outp, 2 * NUM_LIMBS);
  inp.destroy(); outp.destroy(); prm.destroy();
  log('info', `${name}: pairs=${pairs} tpb=${tpb} chunk=${chunk} threads=${nThreads} nWgs=${nWgs} disp=${numDispatches}`);
  return finalize(name, algo, pairs * numDispatches, nThreads, reps, samples, sanity);
}

async function runTile(
  device: GPUDevice,
  name: string,
  algo: string,
  scanCode: string,
  seedCode: string,
  applyCode: string,
  pairs: number,
  tpb: number,
  numDispatches: number,
  reps: number,
  R_: bigint,
  p: bigint,
  seed: number,
): Promise<OpResult> {
  const ntiles = Math.ceil(pairs / tpb);
  const ro = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } });
  const stB = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as const } });
  const un = (b: number) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } });
  // scan: 0 inp(ro) 1 prefixb(st) 2 suffixb(st) 3 params(un) 4 tiletot(st)
  const scanL = device.createBindGroupLayout({ entries: [ro(0), stB(1), stB(2), un(3), stB(4)] });
  // seed: 0 tiletot(ro) 1 tileseed(st) 2 scratch(st) 3 params(un)
  const seedL = device.createBindGroupLayout({ entries: [ro(0), stB(1), stB(2), un(3)] });
  // apply: 0 inp(ro) 1 prefixb(ro) 2 outp(st) 3 params(un) 4 suffixb(ro) 5 tileseed(ro)
  const applyL = device.createBindGroupLayout({ entries: [ro(0), ro(1), stB(2), un(3), ro(4), ro(5)] });
  const scanPipe = await compile(device, scanCode, `${name}-scan`, scanL);
  const seedPipe = await compile(device, seedCode, `${name}-seed`, seedL);
  const applyPipe = await compile(device, applyCode, `${name}-apply`, applyL);

  const rng = makeRng(seed);
  const inArr = new Uint32Array(pairs * 4 * NUM_LIMBS);
  for (let g = 0; g < pairs; g++) {
    let pxM: bigint, qxM: bigint;
    do {
      pxM = (randomBelow(p, rng) * R_) % p;
      qxM = (randomBelow(p, rng) * R_) % p;
    } while (pxM === qxM);
    const co = [pxM, (randomBelow(p, rng) * R_) % p, qxM, (randomBelow(p, rng) * R_) % p];
    const b0 = g * 4 * NUM_LIMBS;
    for (let c = 0; c < 4; c++) {
      const L = bigintToLimbs(co[c]);
      for (let j = 0; j < NUM_LIMBS; j++) inArr[b0 + c * NUM_LIMBS + j] = L[j];
    }
  }
  const inp = device.createBuffer({ size: inArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inp, 0, inArr);
  const prefixb = device.createBuffer({ size: pairs * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const suffixb = device.createBuffer({ size: pairs * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const tiletot = device.createBuffer({ size: ntiles * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const tileseed = device.createBuffer({ size: ntiles * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const scratch = device.createBuffer({ size: NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE });
  const outp = device.createBuffer({ size: pairs * 2 * NUM_LIMBS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const scanParams = paramsBuf(device, pairs, 0);
  const seedParams = paramsBuf(device, ntiles, 0);
  const applyParams = paramsBuf(device, pairs, 0);

  const scanBind = device.createBindGroup({ layout: scanL, entries: [
    { binding: 0, resource: { buffer: inp } }, { binding: 1, resource: { buffer: prefixb } },
    { binding: 2, resource: { buffer: suffixb } }, { binding: 3, resource: { buffer: scanParams } },
    { binding: 4, resource: { buffer: tiletot } } ] });
  const seedBind = device.createBindGroup({ layout: seedL, entries: [
    { binding: 0, resource: { buffer: tiletot } }, { binding: 1, resource: { buffer: tileseed } },
    { binding: 2, resource: { buffer: scratch } }, { binding: 3, resource: { buffer: seedParams } } ] });
  const applyBind = device.createBindGroup({ layout: applyL, entries: [
    { binding: 0, resource: { buffer: inp } }, { binding: 1, resource: { buffer: prefixb } },
    { binding: 2, resource: { buffer: outp } }, { binding: 3, resource: { buffer: applyParams } },
    { binding: 4, resource: { buffer: suffixb } }, { binding: 5, resource: { buffer: tileseed } } ] });

  const runPasses = (enc: GPUCommandEncoder) => {
    for (let d = 0; d < numDispatches; d++) {
      let pp = enc.beginComputePass();
      pp.setPipeline(scanPipe); pp.setBindGroup(0, scanBind); pp.dispatchWorkgroups(ntiles, 1, 1); pp.end();
      pp = enc.beginComputePass();
      pp.setPipeline(seedPipe); pp.setBindGroup(0, seedBind); pp.dispatchWorkgroups(1, 1, 1); pp.end();
      pp = enc.beginComputePass();
      pp.setPipeline(applyPipe); pp.setBindGroup(0, applyBind); pp.dispatchWorkgroups(ntiles, 1, 1); pp.end();
    }
  };
  { const e = device.createCommandEncoder(); runPasses(e); device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); }
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const e = device.createCommandEncoder();
    runPasses(e);
    const t0 = performance.now();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    samples.push(performance.now() - t0);
  }
  const sanity = await readNonZero(device, outp, 2 * NUM_LIMBS);
  inp.destroy(); prefixb.destroy(); suffixb.destroy(); tiletot.destroy(); tileseed.destroy();
  scratch.destroy(); outp.destroy(); scanParams.destroy(); seedParams.destroy(); applyParams.destroy();
  log('info', `${name}: pairs=${pairs} tpb=${tpb} ntiles=${ntiles} disp=${numDispatches}`);
  return finalize(name, algo, pairs * numDispatches, pairs, reps, samples, sanity);
}

function parseParams(): { reps: number; suite: string } {
  const qp = new URLSearchParams(window.location.search);
  const reps = parseInt(qp.get('reps') ?? '7', 10);
  if (!Number.isFinite(reps) || reps <= 0 || reps > 50) {
    throw new Error(`?reps must be in (0,50], got ${qp.get('reps')}`);
  }
  const suite = qp.get('suite') ?? 'all';
  return { reps, suite };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing — WebGPU not available');
    const params = parseParams();
    benchState.params = params;
    benchState.state = 'running';
    log('info', `params: reps=${params.reps}`);

    const device = await get_device();
    log('info', `WebGPU device acquired (HC=${navigator.hardwareConcurrency})`);
    try {
      const lim = device.limits;
      log(
        'info',
        `limits: maxComputeInvocationsPerWorkgroup=${lim.maxComputeInvocationsPerWorkgroup} ` +
          `maxComputeWorkgroupSizeX=${lim.maxComputeWorkgroupSizeX} ` +
          `maxComputeWorkgroupsPerDim=${lim.maxComputeWorkgroupsPerDimension} ` +
          `maxComputeWorkgroupStorageSize=${lim.maxComputeWorkgroupStorageSize} ` +
          `maxStorageBufferBindingSize=${lim.maxStorageBufferBindingSize} ` +
          `maxBufferSize=${lim.maxBufferSize}`,
      );
      const ad = await navigator.gpu.requestAdapter();
      const info = ad ? ((await (ad as unknown as { requestAdapterInfo?: () => Promise<unknown> }).requestAdapterInfo?.()) ?? (ad as unknown as { info?: unknown }).info) : null;
      log('info', `adapter: ${JSON.stringify(info ?? 'n/a')}`);
    } catch (e) {
      log('warn', `limits/adapter introspection failed: ${(e as Error).message}`);
    }

    let sg = { adapterHasSubgroups: false, deviceHasSubgroups: false, minSubgroupSize: null as number | null, maxSubgroupSize: null as number | null };
    try {
      sg = await probe_subgroup_support(device);
      log(
        'info',
        `subgroups: adapter.features.has('subgroups')=${sg.adapterHasSubgroups} ` +
          `device.features.has('subgroups')=${sg.deviceHasSubgroups} ` +
          `minSubgroupSize=${sg.minSubgroupSize ?? 'n/a'} maxSubgroupSize=${sg.maxSubgroupSize ?? 'n/a'}`,
      );
    } catch (e) {
      log('warn', `subgroup probe failed: ${(e as Error).message}`);
    }

    const p = BN254_BASE_FIELD;
    const misc = compute_misc_params(p, WORD_SIZE);
    if (misc.num_words !== NUM_LIMBS) throw new Error(`expected num_words=${NUM_LIMBS}, got ${misc.num_words}`);
    const R = misc.r;
    const sm = new ShaderManager(4, 1 << 16, BN254_CURVE_CONFIG, false);

    // Thread/op sizing: thread counts are far above any GPU's parallel ALU
    // width, so the device is fully saturated; chained k gives the target
    // total op counts without huge buffers.
    const N_FIELD = 1 << 18; // 262144 threads
    const N_JAC = 1 << 16; // 65536 threads (3 BigInt/point => bigger per-elem)

    let steps: Array<() => Promise<OpResult>> = [
      () =>
        runChained2(
          device, 'montgomery_mul', 'montgomery_product (Karatsuba+Yuval, fastest u32)',
          sm.gen_field_mul_bench_u32_shader(WG, 'karat'),
          N_FIELD, 40, 1, params.reps, R, p, 0x1001,
        ),
      () =>
        runChained2(
          device, 'field_add', 'fr_add (field.template.wgsl)',
          sm.gen_field_binop_bench_shader(WG, 'fr_add'),
          N_FIELD, 40, 1, params.reps, R, p, 0x1002,
        ),
      () =>
        runChained2(
          device, 'field_sub', 'fr_sub (field.template.wgsl)',
          sm.gen_field_binop_bench_shader(WG, 'fr_sub'),
          N_FIELD, 40, 1, params.reps, R, p, 0x1003,
        ),
      () => runInv(device, sm.gen_fr_inv_bench_shader(WG, 'fr_inv_by'), N_FIELD, 4, params.reps, R, p, 0x1004),
      () => runBatchAffine(device, sm, 1 << 17, 256, 64, 8, params.reps, R, p, 0x1005),

      // --- batch-affine diagnostics (PAIRS=131072, 8 dispatches => same
      // 1,048,576 total ops as the control above, direct comparison) ---
      () =>
        runBA4(
          device, 'ba_diag_affine_only', 'affine formula only (3 mul + 5 sub) chained k=40 in registers — throughput',
          sm.gen_ba_affine_only_bench_shader(WG),
          1 << 17, 40, (1 << 17) * 4, 1 << 17, (1 << 17) * 2,
          (1 << 17) * 40, 1 << 17, 1, params.reps, R, p, 0x1007,
        ),
      () =>
        runBA4(
          device, 'ba_diag_serial_CH16_inv', 'per-thread serial batch-inv, prefix in registers, CH=16, +inversion',
          sm.gen_ba_serial_bench_shader(WG, 16, true),
          (1 << 17) / 16, 16, (1 << 17) * 4, 1, (1 << 17) * 2,
          (1 << 17) * 8, (1 << 17) / 16, 8, params.reps, R, p, 0x1008,
        ),
      () =>
        runBA4(
          device, 'ba_diag_serial_CH16_noinv', 'serial batch-inv minus the single fr_inv_by_a (isolates non-inversion overhead)',
          sm.gen_ba_serial_bench_shader(WG, 16, false),
          (1 << 17) / 16, 16, (1 << 17) * 4, 1, (1 << 17) * 2,
          (1 << 17) * 8, (1 << 17) / 16, 8, params.reps, R, p, 0x1009,
        ),
      () =>
        runBA4(
          device, 'ba_diag_serial_CH64_inv', 'per-thread serial batch-inv, prefix in registers, CH=64, +inversion',
          sm.gen_ba_serial_bench_shader(WG, 64, true),
          (1 << 17) / 64, 64, (1 << 17) * 4, 1, (1 << 17) * 2,
          (1 << 17) * 8, (1 << 17) / 64, 8, params.reps, R, p, 0x100a,
        ),

      // --- karat_lean (array-backed 2N accumulator => lower register
      // footprint => higher occupancy) variants of the same kernels. ---
      () =>
        runBA4(
          device, 'ba_diag_affine_only_lean', 'affine formula only chained k=40, karat_lean montmul',
          sm.gen_ba_affine_only_bench_shader(WG, 'karat_lean'),
          1 << 17, 40, (1 << 17) * 4, 1 << 17, (1 << 17) * 2,
          (1 << 17) * 40, 1 << 17, 1, params.reps, R, p, 0x100b,
        ),
      () =>
        runBA4(
          device, 'ba_diag_serial_CH16_lean_inv', 'serial batch-inv CH=16 +inversion, karat_lean montmul',
          sm.gen_ba_serial_bench_shader(WG, 16, true, 'karat_lean'),
          (1 << 17) / 16, 16, (1 << 17) * 4, 1, (1 << 17) * 2,
          (1 << 17) * 8, (1 << 17) / 16, 8, params.reps, R, p, 0x100c,
        ),

      // --- two-kernel pipeline: stage1 inv-only (writes inv_dx) +
      // stage2 register-light affine apply. CH=16, ~1M pairs. ---
      () =>
        runTwoKernel(
          device, 'ba_two_kernel_karat', 'two-kernel pipeline (inv-only + affine apply), Karat montmul',
          sm.gen_ba_invonly_bench_shader(WG, 16, 'karat'),
          sm.gen_ba_affine_only_bench_shader(WG, 'karat'),
          1 << 17, 16, 8, params.reps, R, p, 0x1011,
        ),
      () =>
        runTwoKernel(
          device, 'ba_two_kernel_lean', 'two-kernel pipeline (inv-only + affine apply), karat_lean montmul',
          sm.gen_ba_invonly_bench_shader(WG, 16, 'karat_lean'),
          sm.gen_ba_affine_only_bench_shader(WG, 'karat_lean'),
          1 << 17, 16, 8, params.reps, R, p, 0x1012,
        ),

      // --- montmul under register pressure: keep L independent (a,b)
      // pairs live per thread, chained k times. Shows that the standalone
      // 1.55 ns montmul number does NOT compose additively. ---
      () =>
        runBA4(
          device, 'montmul_pressure_L1_karat', 'chained montmul, 1 live pair/thread, Karat+Yuval (baseline ≈ standalone)',
          sm.gen_montmul_pressure_bench_shader(WG, 1, 'karat'),
          1 << 18, 40, (1 << 18) * 1, (1 << 18) * 1, (1 << 18) * 1,
          (1 << 18) * 40, 1 << 18, 1, params.reps, R, p, 0x100d,
        ),
      () =>
        runBA4(
          device, 'montmul_pressure_L8_karat', 'chained montmul, 8 live pairs/thread, Karat+Yuval',
          sm.gen_montmul_pressure_bench_shader(WG, 8, 'karat'),
          1 << 15, 40, (1 << 15) * 8, (1 << 15) * 8, (1 << 15) * 8,
          (1 << 15) * 40 * 8, 1 << 15, 1, params.reps, R, p, 0x100e,
        ),
      () =>
        runBA4(
          device, 'montmul_pressure_L16_karat', 'chained montmul, 16 live pairs/thread, Karat+Yuval',
          sm.gen_montmul_pressure_bench_shader(WG, 16, 'karat'),
          1 << 14, 40, (1 << 14) * 16, (1 << 14) * 16, (1 << 14) * 16,
          (1 << 14) * 40 * 16, 1 << 14, 1, params.reps, R, p, 0x100f,
        ),
      () =>
        runBA4(
          device, 'montmul_pressure_L8_lean', 'chained montmul, 8 live pairs/thread, karat_lean',
          sm.gen_montmul_pressure_bench_shader(WG, 8, 'karat_lean'),
          1 << 15, 40, (1 << 15) * 8, (1 << 15) * 8, (1 << 15) * 8,
          (1 << 15) * 40 * 8, 1 << 15, 1, params.reps, R, p, 0x1010,
        ),
      () =>
        runBA4(
          device, 'montmul_pressure_L16_lean', 'chained montmul, 16 live pairs/thread, karat_lean',
          sm.gen_montmul_pressure_bench_shader(WG, 16, 'karat_lean'),
          1 << 14, 40, (1 << 14) * 16, (1 << 14) * 16, (1 << 14) * 16,
          (1 << 14) * 40 * 16, 1 << 14, 1, params.reps, R, p, 0x1013,
        ),
      () =>
        runBA4(
          device, 'montmul_standalone_lean', 'chained montmul, 1 live pair/thread, karat_lean (standalone cost)',
          sm.gen_montmul_pressure_bench_shader(WG, 1, 'karat_lean'),
          1 << 18, 40, (1 << 18) * 1, (1 << 18) * 1, (1 << 18) * 1,
          (1 << 18) * 40, 1 << 18, 1, params.reps, R, p, 0x1014,
        ),

      () =>
        runChained2(
          device, 'jacobian_add_unconditional', 'add_points_no_collision (add-2007-bl, no fallback)',
          sm.gen_jac_add_bench_shader(WG),
          N_JAC, 16, 3, params.reps, R, p, 0x1006,
        ),
    ];

    if (params.suite === 'opt') {
      const PAIRS = 1 << 17;
      const DISP = 8;
      const WGI = 64;
      const NF = 1 << 18;
      const KMM = 40;
      void NF;
      void KMM;
      // Saturation sweep: fixed total montmul work, varying thread count.
      // ns/op should fall as threads rise, then flatten at the GPU's true
      // parallel width. TOT chosen so buffers (n BigInt) stay <=42MB.
      const sat = (n: number, sd: number) => () => {
        const TOT = 524288 * 40;
        const k = Math.max(1, Math.round(TOT / n));
        return runBA4(
          device, `sat_n${n}`, `montmul saturation, threads=${n}, k=${k}`,
          sm.gen_montmul_resident_bench_shader(WGI, 0),
          n, k, n, n, n, n * k, n, 1, params.reps, R, p, sd,
        );
      };
      const rbsScanStep = (tpb: number, Rb: number, sd: number) => () =>
        runRbsScan(
          device, `rbs_scan_t${tpb}r${Rb}`,
          `register-blocked work-efficient scan tpb=${tpb} R=${Rb}`,
          sm.gen_ba_rbs_scan_bench_shader(tpb, Rb), PAIRS, Rb, tpb, DISP, params.reps, R, p, sd,
        );
      const rbsPipeStep = (tpb: number, Rb: number, sd: number) => () =>
        runRbs(
          device, `rbs_pipe_t${tpb}r${Rb}`,
          `register-blocked full pipeline tpb=${tpb} R=${Rb}`,
          sm.gen_ba_rbs_fwd_bench_shader(tpb, Rb),
          sm.gen_ba_rbs_seed_bench_shader(),
          sm.gen_ba_rbs_bwd_bench_shader(tpb, Rb),
          PAIRS, Rb, tpb, DISP, params.reps, R, p, sd,
        );
      const tileStep = (tpb: number, sd: number) => () =>
        runTile(
          device, `tile_t${tpb}`,
          `fully-parallel tile pipeline (1 thread/pair) tpb=${tpb}`,
          sm.gen_ba_tile_scan_bench_shader(tpb),
          sm.gen_ba_rbs_seed_bench_shader(),
          sm.gen_ba_tile_apply_bench_shader(tpb),
          PAIRS, tpb, DISP, params.reps, R, p, sd,
        );
      void sat;
      void rbsScanStep;
      void rbsPipeStep;
      void tileStep;
      const wgTileStep = (tpb: number, sd: number) => () =>
        runWgTile(
          device, `wgtile_t${tpb}`,
          `single fused workgroup-tile batch-affine (1 kernel, 1 global pass, shared-mem batch-inverse) tpb=${tpb}`,
          sm.gen_ba_wgtile_bench_shader(tpb),
          PAIRS, tpb, DISP, params.reps, R, p, sd,
        );
      // Subgroup-shuffle fused batch-affine. Same bindings/dispatch as
      // wgtile (0 inp AoS, 1 outp, 2 params; ntiles workgroups of tpb
      // threads), so it reuses runWgTile. The subgroup size is fixed by
      // hardware (typically 32 on Apple); tpb only sets the workgroup
      // size. Gracefully degrades to ns_per_op = -1 / sane=false if
      // subgroups are unsupported (compile/link failure) so the suite
      // never aborts on a BS Chrome without the feature.
      const sgSupported = sg.adapterHasSubgroups && sg.deviceHasSubgroups;
      const skippedResult = (nm: string, algo: string): OpResult => ({
        name: nm, algo,
        total_ops: 0, num_threads: PAIRS, ops_per_thread: 0, reps: 0,
        median_ms: -1, min_ms: -1, max_ms: -1,
        ns_per_op: -1, ns_per_op_per_thread: -1, samples_ms: [], sanity_ok: false,
      });
      const sgStep = (tpb: number, sd: number) => async (): Promise<OpResult> => {
        if (!sgSupported) {
          log('warn', `sg_t${tpb}: subgroups unsupported, skipped`);
          return skippedResult(`sg_t${tpb}`, 'subgroup-shuffle fused batch-affine (unsupported, skipped)');
        }
        try {
          return await runWgTile(
            device, `sg_t${tpb}`,
            `single fused subgroup-shuffle batch-affine (1 kernel, 1 global pass, subgroup-shuffle batch-inverse, 1 thread/pair) wg=${tpb}`,
            sm.gen_ba_sg_bench_shader(tpb),
            PAIRS, tpb, DISP, params.reps, R, p, sd,
          );
        } catch (e) {
          log('warn', `sg_t${tpb}: subgroup kernel failed (${(e as Error).message}), skipped`);
          return skippedResult(`sg_t${tpb}`, `subgroup-shuffle fused batch-affine (failed: ${(e as Error).message})`);
        }
      };
      // Orthogonal fallback lever: refine the known-best fused_tight
      // structure around its ch16=31 optimum. PAIRS=131072=2^17 so the
      // chunk must be a power of two that divides it: 8, 32, 64.
      const ftStep = (ch: number, sd: number) => () =>
        runBA4(
          device, `ft_ch${ch}`, `fused-tight ch${ch} (karat)`,
          sm.gen_ba_fused_tight_bench_shader(WGI, ch, 'karat'),
          PAIRS / ch, 0, PAIRS * 4, 1, PAIRS * 2, PAIRS * DISP, PAIRS, DISP, params.reps, R, p, sd,
        );
      // Montmul-realism probe scale: same thread count & k as the
      // existing standalone montmul bench so ns/op (normalized per
      // single montmul) is directly comparable. xs/ys hold 3 BigInt
      // per thread (a,b,c / d,e,f). totalOps = MMN*MMK*mpi where mpi is
      // the montmuls-per-iter for the mode (1 invariant, 3 distinct/
      // indep), so finalize's ns_per_op is per single montmul.
      // Single-kernel two-level workgroup-amortised batch-affine sweep.
      // (tpb, chunk): ONE fr_inv per workgroup amortised over tpb*chunk
      // pairs while PAIRS/chunk threads keep the GPU saturated. PAIRS=
      // 2^17 so PAIRS/chunk is divisible by tpb for every pair below.
      const wgAmortStep = (tpb: number, chunk: number, sd: number) => () =>
        runWgAmort(
          device, `wgamort_t${tpb}c${chunk}`,
          sm.gen_ba_wgamort_bench_shader(tpb, chunk, 'karat'),
          PAIRS, tpb, chunk, tpb, DISP, params.reps, R, p, sd,
        );
      const MMN = 262144;
      const MMK = 40;
      const mmStep = (
        nm: string,
        algo: string,
        mode:
          | 'chain_invariant'
          | 'chain_distinct'
          | 'chain_indep'
          | 'chain_distinct_hard'
          | 'chain_sq_hard',
        mpi: number,
        sd: number,
      ) => () =>
        runBA4(
          device, nm, algo,
          sm.gen_montmul_realism_bench_shader(WGI, mode),
          MMN, MMK, MMN * 3, MMN * 3, MMN, MMN * MMK * mpi, MMN, 1, params.reps, R, p, sd,
        );
      // DELIVERABLE A: fused-tight per-thread chunk sweep. 1M-pair total
      // is fixed (totalOps = PAIRS*DISP); threads = ceil(PAIRS/ch) so
      // larger chunks => fewer threads (intermediate amortisation).
      // Buffers sized to ceil(PAIRS/ch)*ch so the strided chunk reads
      // never run past the end. wg=64, lean formula + accumulator
      // structure unchanged (only `ch` and the private prefix array
      // length vary).
      const ftSweepStep = (ch: number, sd: number) => () => {
        const nThreads = Math.ceil(PAIRS / ch);
        const padPairs = nThreads * ch;
        return runBA4(
          device, `fused_tight_ch${ch}`, `fused-tight per-thread chunk sweep ch${ch} (karat, lean formula)`,
          sm.gen_ba_fused_tight_bench_shader(WGI, ch, 'karat'),
          nThreads, 0, padPairs * 4, 1, padPairs * 2, PAIRS * DISP, nThreads, DISP, params.reps, R, p, sd,
        );
      };
      // DELIVERABLE B: MSM-integrated bucket-accumulate. Each thread
      // owns ONE resident accumulator and folds a streamed coalesced
      // SoA chunk of S independent points (P.x != A.x) into it via the
      // unconditional lean affine add, ONE fr_inv_by_a per S. Reuses
      // runFusedSoa (same SoA+vec4 strided layout, params=(N,T),
      // T=N/S). Total point-adds = PAIRS*DISP (~1M).
      const msmBucketStep = (s: number, sd: number) => () =>
        runFusedSoa(
          device, `msm_bucket_s${s}`,
          sm.gen_ba_msm_bucket_bench_shader(WGI, s, 'karat'),
          PAIRS, s, WGI, DISP, params.reps, R, p, sd,
        );
      // f32-22 variant of msm_bucket: identical S-chunk batched-inverse
      // structure and SoA+vec4 layout, but the resident BigInt and all
      // montmuls use the 12x22-bit f32 representation (occupancy probe).
      // Same runner/packer/params as msmBucketStep (input packed u32,
      // domain-corrected to f32-22 on load inside the kernel).
      const msmBucketF32Step = (s: number, sd: number) => () =>
        runFusedSoa(
          device, `msm_bucket_f32_s${s}`,
          sm.gen_ba_msm_bucket_f32_shader(WGI, s),
          PAIRS, s, WGI, DISP, params.reps, R, p, sd,
        );
      // ba_rev_packed_carry: msm_bucket arithmetic + packed 8x u32 SoA
      // storage + decoupled (full-ILP) in-register pack/unpack. Driven
      // by runFusedSoaPacked (PG=2 vec4/elem packed layout). The
      // canonical recovered kernel that hit ~22 ns/pair on M2 Chrome 148.
      const revPackedCarryStep = (s: number, sd: number) => () =>
        runFusedSoaPacked(
          device, `ba_rev_packed_carry_s${s}`,
          sm.gen_ba_rev_packed_carry_bench_shader(WGI, s),
          PAIRS, s, WGI, DISP, params.reps, R, p, sd,
        );
      // TWO-LEVEL COOPERATIVE batch-inversion batch-affine. A workgroup
      // of W threads does EXACTLY ONE fr_inv_by_a amortised over W*c
      // pairs (Phase B is O(log W) Hillis-Steele scans, not the O(W)
      // serial lane-0 combine of wgamort) while threads = ceil(1M/c)
      // keep the GPU saturated. Reuses runFusedSoa (same SoA+vec4
      // strided layout, params=(N,T), T=N/c) like msm_bucket. PAIRS is
      // padded up to a multiple of W*c so every workgroup owns a full
      // W*c block and numWgs is exact; total work fixed at ~1M*DISP.
      const coopStep = (w: number, c: number, doInv: boolean, sd: number) => () => {
        const blk = w * c;
        const padPairs = Math.ceil(PAIRS / blk) * blk;
        const nm = doInv ? `coop_w${w}_c${c}` : `coop_w${w}_c${c}_noinv`;
        return runFusedSoa(
          device, nm,
          sm.gen_ba_coop_inv_bench_shader(w, c, doInv, 'karat'),
          padPairs, c, w, DISP, params.reps, R, p, sd,
        );
      };
      // msm_bucket_s16 micro-ablation variants: same SoA+vec4 layout,
      // 8192-thread launch and S=16 as msm_bucket_s16 (held constant),
      // each with exactly one component removed so (full - variant)
      // isolates that component's additive ns cost. Reuse runFusedSoa.
      const ABL_S = 16;
      const mbAblStep = (nm: string, algo: string, code: string, sd: number) => () =>
        runFusedSoa(device, nm, code, PAIRS, ABL_S, WGI, DISP, params.reps, R, p, sd);
      // Per-thread software-pipelined double-buffered batch-affine: each
      // thread owns TWO independent sub-chunks of g pairs (chunk=2*g),
      // overlapping the two operand-independent fr_inv_by_a latencies
      // with each other + the surrounding montmul work. NO workgroup
      // barrier (pure per-thread, like msm_bucket). Reuses runFusedSoa
      // (same SoA+vec4 strided layout, params=(N,T), T=N/(2*g)). PAIRS
      // padded up to a 2*g multiple so every thread owns a full block;
      // total work fixed at PAIRS*DISP (~1M pairs). do_invert=false swaps
      // both fr_inv_by_a(...) for their argument for the modinv twin.
      const pipeInvStep = (g: number, doInv: boolean, sd: number) => () => {
        const blk = 2 * g;
        const padPairs = Math.ceil(PAIRS / blk) * blk;
        const nm = doInv ? `pipe_inv_g${g}` : `pipe_inv_g${g}_noinv`;
        const code = doInv
          ? sm.gen_ba_pipe_inv_bench_shader(WGI, g)
          : sm.gen_ba_pipe_inv_noinv_bench_shader(WGI, g);
        return runFusedSoa(device, nm, code, padPairs, blk, WGI, DISP, params.reps, R, p, sd);
      };
      // DELIVERABLE: software-pipelined SoA+vec4 lean apply, W independent
      // pairs/thread. apply_precomputed_k1 (AoS, W=1) is the latency-bound
      // baseline for the delta. Total pairs fixed at PAIRS; threads =
      // ceil(PAIRS/W). inv_dx precomputed in the input (packInvDxSoA),
      // points independent (packAffineSoA enforces P.x != Q.x).
      const applyIlpStep = (w: number, sd: number) => () =>
        runApplyIlpSoa(
          device, `apply_ilp_w${w}`,
          sm.gen_ba_apply_ilp_bench_shader(WGI, w, 'karat'),
          PAIRS, w, WGI, DISP, params.reps, R, p, sd,
        );
      steps = [
        () => runBatchAffine(device, sm, PAIRS, 256, 64, DISP, params.reps, R, p, 0x2001),
        // AoS anchor: lean affine apply only, one pair per thread (max
        // occupancy), precomputed random inv_dx. M=1 case of the
        // M-serial kernel == apply-tight; ~18 ns/pair reference.
        () =>
          runBA4(
            device, 'apply_precomputed_k1', 'lean affine apply only, precomputed inv_dx, 1 pair/thread (AoS anchor)',
            sm.gen_ba_apply_tight_bench_shader(WGI, 1, 'karat'),
            PAIRS, 1, PAIRS * 4, PAIRS, PAIRS * 2, PAIRS * DISP, PAIRS, DISP, params.reps, R, p, 0x3008,
          ),
        // DELIVERABLE: software-pipelined SoA+vec4 apply, W indep
        // pairs/thread (W=1 latency-bound anchor is apply_precomputed_k1).
        applyIlpStep(2, 0x3b02),
        applyIlpStep(3, 0x3b03),
        applyIlpStep(4, 0x3b04),
        // Deliverable A: fused-tight per-thread chunk sweep.
        ftSweepStep(16, 0x3007),
        ftSweepStep(24, 0x3a18),
        ftSweepStep(32, 0x3a20),
        ftSweepStep(48, 0x3a30),
        ftSweepStep(64, 0x3a40),
        // Deliverable B: MSM-integrated bucket-accumulate sweep.
        // msm_bucket_s16 is the full-cost anchor for the ablation deltas.
        msmBucketStep(16, 0x6b10),
        msmBucketStep(32, 0x6b20),
        msmBucketStep(64, 0x6b40),
        // ba_rev_packed_carry: msm_bucket + packed 8x u32 SoA storage +
        // decoupled ILP pack/unpack. The fastest standalone batch-affine
        // kernel measured (~22 ns/pair on M2 / Chrome 148, -55% vs prod).
        revPackedCarryStep(16, 0x7b10),
        revPackedCarryStep(32, 0x7b20),
        revPackedCarryStep(64, 0x7b40),
        // f32-22 batch-affine occupancy probe (S-chunk sweep).
        msmBucketF32Step(8, 0x6f08),
        msmBucketF32Step(16, 0x6f10),
        msmBucketF32Step(32, 0x6f20),
        // msm_bucket_s16 micro-ablation set (S=16 held constant).
        mbAblStep(
          'mb_abl_loadonly', 'msm_bucket_s16 ablation: loads+store only, zero field arithmetic (memory floor)',
          sm.gen_mb_abl_loadonly_shader(WGI, 16), 0x6c10,
        ),
        mbAblStep(
          'mb_abl_fwdonly', 'msm_bucket_s16 ablation: loads + forward acc*=dx montmul chain + store (no inv/peel/apply)',
          sm.gen_mb_abl_fwdonly_shader(WGI, 16), 0x6c20,
        ),
        mbAblStep(
          'mb_abl_noinv', 'msm_bucket_s16 ablation: full kernel, fr_inv_by_a replaced by cheap copy (amortised inversion removed)',
          sm.gen_mb_abl_noinv_shader(WGI, 16), 0x6c30,
        ),
        mbAblStep(
          'mb_abl_nopeel', 'msm_bucket_s16 ablation: loads + forward product + real fr_inv_by_a + store inv (no backward peel/lean apply)',
          sm.gen_mb_abl_nopeel_shader(WGI, 16), 0x6c40,
        ),
        // LADDER A: strictly-monotone progressive ablation of
        // apply_precomputed_k1. Identical AoS layout / 1-pair-per-thread
        // launch geometry / runBA4 packer / params as the
        // apply_precomputed_k1 anchor above (only the entry shader, one
        // added op group per rung, differs). Deltas: apA1-apA0=montmul#1,
        // apA2-apA1=square, apA3-apA2=montmul#3, apA4-apA3=5 subs,
        // apA5-apA4=real-wiring dependency overhead, apA0=memory floor.
        () =>
          runBA4(
            device, 'apA0_loadstore', 'LADDER A0: apply_precomputed memory floor (loads+store, zero field arith)',
            sm.gen_ap_ladder_a0_shader(WGI),
            PAIRS, 1, PAIRS * 4, PAIRS, PAIRS * 2, PAIRS * DISP, PAIRS, DISP, params.reps, R, p, 0x3a00,
          ),
        () =>
          runBA4(
            device, 'apA1_mul1', 'LADDER A1: A0 + ONE montmul (lambda=dy*inv_dx)',
            sm.gen_ap_ladder_a1_shader(WGI),
            PAIRS, 1, PAIRS * 4, PAIRS, PAIRS * 2, PAIRS * DISP, PAIRS, DISP, params.reps, R, p, 0x3a01,
          ),
        () =>
          runBA4(
            device, 'apA2_mul2', 'LADDER A2: A1 + 2nd montmul (l2=lambda^2, the square)',
            sm.gen_ap_ladder_a2_shader(WGI),
            PAIRS, 1, PAIRS * 4, PAIRS, PAIRS * 2, PAIRS * DISP, PAIRS, DISP, params.reps, R, p, 0x3a02,
          ),
        () =>
          runBA4(
            device, 'apA3_mul3', 'LADDER A3: A2 + 3rd distinct montmul',
            sm.gen_ap_ladder_a3_shader(WGI),
            PAIRS, 1, PAIRS * 4, PAIRS, PAIRS * 2, PAIRS * DISP, PAIRS, DISP, params.reps, R, p, 0x3a03,
          ),
        () =>
          runBA4(
            device, 'apA4_subs', 'LADDER A4: A3 + the 5 fr_sub of the real formula (loose)',
            sm.gen_ap_ladder_a4_shader(WGI),
            PAIRS, 1, PAIRS * 4, PAIRS, PAIRS * 2, PAIRS * DISP, PAIRS, DISP, params.reps, R, p, 0x3a04,
          ),
        () =>
          runBA4(
            device, 'apA5_full', 'LADDER A5: the REAL apply_precomputed_k1 formula (reproduces ~18.9 anchor)',
            sm.gen_ap_ladder_a5_shader(WGI),
            PAIRS, 1, PAIRS * 4, PAIRS, PAIRS * 2, PAIRS * DISP, PAIRS, DISP, params.reps, R, p, 0x3a05,
          ),
        // LADDER B: strictly-monotone progressive ablation of
        // msm_bucket_s16. Identical SoA+vec4 layout / S=16 chunk /
        // 8192-thread launch / runFusedSoa packer as the msm_bucket_s16
        // anchor (mbAblStep, ABL_S=16). Deltas: mbB1-mbB0=forward
        // accumulator-montmul chain, mbB2-mbB1=single amortised
        // inversion/S, mbB3-mbB2=backward montmuls/pair,
        // mbB4-mbB3=backward subs/pair, mbB5-mbB4=real-wiring dependency
        // overhead, mbB0=memory floor.
        mbAblStep(
          'mbB0_loadstore', 'LADDER B0: msm_bucket_s16 memory floor (loads+store, zero field arith)',
          sm.gen_mb_ladder_b0_shader(WGI, 16), 0x6d00,
        ),
        mbAblStep(
          'mbB1_fwd', 'LADDER B1: B0 + forward prefix-product montmul chain (S/chunk)',
          sm.gen_mb_ladder_b1_shader(WGI, 16), 0x6d01,
        ),
        mbAblStep(
          'mbB2_inv', 'LADDER B2: B1 + the ONE fr_inv_by_a per S-chunk',
          sm.gen_mb_ladder_b2_shader(WGI, 16), 0x6d02,
        ),
        mbAblStep(
          'mbB3_bwd_muls', 'LADDER B3: B2 + backward per-pair montmuls only (no subs)',
          sm.gen_mb_ladder_b3_shader(WGI, 16), 0x6d03,
        ),
        mbAblStep(
          'mbB4_bwd_subs', 'LADDER B4: B3 + backward per-pair fr_sub (5 subs + dx recompute)',
          sm.gen_mb_ladder_b4_shader(WGI, 16), 0x6d04,
        ),
        mbAblStep(
          'mbB5_full', 'LADDER B5: the REAL ba_msm_bucket (reproduces ~27 anchor)',
          sm.gen_mb_ladder_b5_shader(WGI, 16), 0x6d05,
        ),
        wgAmortStep(64, 4, 0x5a01),
        wgAmortStep(64, 8, 0x5a02),
        wgAmortStep(64, 16, 0x5a03),
        wgAmortStep(128, 8, 0x5a04),
        wgAmortStep(32, 16, 0x5a05),
        // TWO-LEVEL COOPERATIVE batch-inversion sweep: 1 fr_inv_by_a per
        // workgroup amortised over W*c pairs, threads = ceil(1M/c) at the
        // saturation knee. modinv amortisation = W*c (w256_c8=1/2048,
        // w128_c16=1/2048, w128_c4=1/512).
        coopStep(64, 8, true, 0x7a01),
        coopStep(128, 8, true, 0x7a02),
        coopStep(256, 8, true, 0x7a03),
        coopStep(128, 4, true, 0x7a04),
        coopStep(128, 16, true, 0x7a05),
        // CLEAN modinv-isolation twin: identical kernel/shared-mem/
        // barrier/scan structure, ONLY the single fr_inv_by_a(grand)
        // replaced by `grand`. coop_w128_c8 (full, above) - this =
        // confound-free per-pair modinv cost.
        coopStep(128, 8, false, 0x7a06),
        // PER-THREAD SOFTWARE-PIPELINED double-buffered batch-affine.
        // Two operand-independent fr_inv_by_a per thread, issued
        // back-to-back so their long data-dependent latencies overlap
        // with each other and the surrounding inverse-independent
        // montmuls. NO workgroup barrier => no coop-barrier regression;
        // adds intra-thread latency hiding on top of cross-thread.
        pipeInvStep(8, true, 0x8a01),
        pipeInvStep(16, true, 0x8a02),
        pipeInvStep(4, true, 0x8a03),
        // CLEAN modinv-isolation twin: identical pipelined kernel, ONLY
        // both fr_inv_by_a(...) replaced by their argument. pipe_inv_g8
        // (full, above) - this = confound-free pipelined-layout modinv
        // cost, directly comparable to coop and msm_bucket numbers.
        pipeInvStep(8, false, 0x8a04),
        // Degenerate baseline: 1 montmul/iter, b invariant, single
        // feedback accumulator. Should reproduce the ~1.55 ns/op
        // standalone montmul number. mpi=1.
        mmStep(
          'mm_chain_invariant',
          'montmul, 1/iter, b invariant, single accumulator (degenerate baseline ~1.55)',
          'chain_invariant', 1, 0x4d01,
        ),
        // Realistic formula-like cost: 3-montmul DAG with DISTINCT
        // operands (lambda -> lambda^2 / lambda*t0), 3 sub/iter. mpi=3.
        mmStep(
          'mm_chain_distinct',
          'montmul, 3/iter distinct-operand DAG mirroring affine formula (+3 sub/iter)',
          'chain_distinct', 3, 0x4d03,
        ),
        // Distinct-operand throughput ceiling: 3 INDEPENDENT montmuls/
        // iter, no intra-iter dependency, 3 sub/iter. mpi=3.
        mmStep(
          'mm_chain_indep',
          'montmul, 3/iter INDEPENDENT distinct operands, throughput ceiling (+3 sub/iter)',
          'chain_indep', 3, 0x4d07,
        ),
        // PROBE 1: DCE/CSE/hoist-proof distinct-operand montmul. Operand
        // B reloaded from storage at a loop-carried index derived from
        // the running product; 1 montmul/iter, MMK=40 dependent links.
        // Bulletproof per-single-distinct-montmul ns/op.
        mmStep(
          'mm_distinct_hard',
          'montmul, DCE-proof distinct-operand chain (storage-reloaded B, loop-carried index)',
          'chain_distinct_hard', 1, 0x4d11,
        ),
        // f32-22 sibling of mm_distinct_hard: per-single-f32-22-montmul
        // ns/op (DCE-proof storage-reload chain), directly comparable to
        // the u32 mm_distinct_hard number above. Same MMN/MMK and 1
        // montmul/iter; runChainedF32Mont packs proper f32-22 Mont-domain
        // limbs (separate xs/ys BigIntF32, methodology identical to the
        // Karat-u32 probe so ns/op is comparable).
        () =>
          runChainedF32Mont(
            device, 'mm_distinct_f32',
            'f32-22 montmul, DCE-proof distinct-operand chain (vs mm_distinct_hard)',
            sm.gen_mm_distinct_f32_shader(WGI),
            MMN, MMK, params.reps, R, p, 0x4d21,
          ),
        // PROBE 2 (branch B: no dedicated Montgomery square in this
        // stack). DCE-proof SQUARING-form chain montgomery_product(a,a)
        // with the same storage-reload anti-DCE skeleton, head-to-head
        // with mm_distinct_hard to see if squaring is any cheaper here.
        mmStep(
          'mm_chain_sq',
          'montmul SQUARING form (a*a), DCE-proof chain (storage-reload anti-DCE), vs mm_distinct_hard',
          'chain_sq_hard', 1, 0x4d13,
        ),
        // ~18 ns/pair affine-apply anchor for cross-reference (8 ops/pair:
        // 3 montmul + 5 sub, interleave-free M-serial, m=8).
        () =>
          runApplySerial(
            device, 'apply_ser_m8', sm.gen_ba_apply_serial_bench_shader(WGI, 8, 'karat'),
            PAIRS, 8, WGI, DISP, params.reps, R, p, 0x3c08,
          ),
      ];
      void runApplySoa;
      void runApplyIl;
      void runFusedSoa;
      void runFusedIl;
      void sgStep;
      void ftStep;
      void wgTileStep;
    }

    for (const step of steps) {
      try {
        const r = await step();
        benchState.results.push(r);
        resultsClient.postProgress({ kind: 'op_done', name: r.name, ns_per_op: r.ns_per_op });
      } catch (e) {
        const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
        log('err', `step failed: ${msg}`);
        benchState.state = 'error';
        benchState.error = msg;
        return;
      }
    }

    benchState.state = 'done';
    log('ok', 'all primitives done');
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
