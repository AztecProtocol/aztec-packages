/// <reference types="@webgpu/types" />
// Standalone correctness + bench page for the smvp_tree_phase1 WGSL
// kernel. Generates a synthetic bucket-sorted schedule with random
// base points (non-on-curve — we diff against the same formula on
// CPU, not against the EC group law), runs Phase 1 on the GPU, and
// diffs every output BigInt against the reference computed in TS.
//
// CPU reference algorithm (mirrors the WGSL kernel exactly):
//   1. Walk each slice left-to-right; build (kind, idx_a, idx_b) pair_list
//      via the same paired/unpaired state machine the kernel uses.
//   2. For each PAIR, compute R = P + Q using the same Mont-form
//      affine-add formula:
//        slope = (Q.y - P.y) * inv(Q.x - P.x)
//        R.x   = slope^2 - P.x - Q.x
//        R.y   = slope * (P.x - R.x) - P.y
//      (Sign flip on Q.y when the schedule's high bit is set.)
//   3. For each UNPAIRED, copy P.x / (sign-flipped) P.y verbatim.
//
// The kernel uses Montgomery-form internally with the BY safegcd
// inverse; the CPU reference uses BigInt modular inverse on the same
// Mont-form representation, so the bit-for-bit output should match.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import {
  buildSliceLayout,
  compactBucketStart,
} from '../../src/msm_webgpu/cuzk/smvp_tree_partition.js';
import { makeResultsClient } from './results_post.js';

const NUM_LIMBS_U32 = 20;
const WORD_SIZE_U32 = 13;
const W_U32 = 1n << BigInt(WORD_SIZE_U32);
const MASK_U32 = W_U32 - 1n;

const TPB = 64;
const MAX_SLICE_ENTRIES = 128;

const SCHEDULE_SIGN_BIT = 0x80000000;
const SCHEDULE_IDX_MASK = 0x7fffffff;
const UNPAIRED_SENTINEL = 0xffffffff;

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { num_wgs: number; slice_entries: number; reps: number; seed: number } | null;
  results: {
    median_ms: number;
    samples_ms: number[];
    num_outputs: number;
    mismatches: number;
    first_mismatch: string | null;
  } | null;
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: null, error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;

const resultsClient = makeResultsClient({ page: 'bench-smvp-tree-phase1' });
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
  console.log(`[bench-smvp-tree-phase1] ${msg}`);
}

function bigintToLimbsU32(v: bigint): Uint32Array {
  const limbs = new Uint32Array(NUM_LIMBS_U32);
  let x = v;
  for (let i = 0; i < NUM_LIMBS_U32; i++) {
    limbs[i] = Number(x & MASK_U32);
    x >>= BigInt(WORD_SIZE_U32);
  }
  return limbs;
}

function limbsU32ToBigint(limbs: ArrayLike<number>, offset: number): bigint {
  let v = 0n;
  for (let i = NUM_LIMBS_U32 - 1; i >= 0; i--) {
    v = (v << BigInt(WORD_SIZE_U32)) | BigInt(limbs[offset + i] >>> 0);
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
  for (let attempt = 0; attempt < 64; attempt++) {
    let v = 0n;
    for (let i = 0; i < byteLen; i++) v = (v << 8n) | BigInt(rng() & 0xff);
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v < p) return v;
  }
  throw new Error('randomBelow: too many retries');
}

function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [((a % m) + m) % m, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  if (old_r !== 1n) throw new Error('modInverse: not invertible');
  return ((old_s % m) + m) % m;
}

interface Synth {
  num_wgs: number;
  schedule: Uint32Array;
  entry_bucket_id: Uint32Array;
  point_x: Uint32Array;
  point_y: Uint32Array;
  point_x_mont_bigint: bigint[];
  point_y_mont_bigint: bigint[];
  slice_bounds: Uint32Array;
  wg_output_offset: Uint32Array;
  total_outputs: number;
}

function buildSynthetic(num_wgs: number, slice_entries: number, seed: number, p: bigint, R: bigint): Synth {
  const rng = makeRng(seed);
  const total_entries = num_wgs * slice_entries;
  // Each slice covers 3-5 distinct buckets uniformly.
  const buckets_per_slice = 3 + (rng() % 3);
  const total_buckets = num_wgs * buckets_per_slice;
  const pops: number[] = new Array(total_buckets);
  // Distribute slice_entries entries across buckets_per_slice buckets,
  // each at least 1. Force varied parity so we exercise the
  // PAIR/UNPAIRED state machine.
  for (let s = 0; s < num_wgs; s++) {
    let remaining = slice_entries;
    for (let b = 0; b < buckets_per_slice - 1; b++) {
      const maxPop = Math.max(1, remaining - (buckets_per_slice - 1 - b));
      const pop = 1 + (rng() % maxPop);
      pops[s * buckets_per_slice + b] = pop;
      remaining -= pop;
    }
    pops[s * buckets_per_slice + buckets_per_slice - 1] = remaining;
  }
  // Build a compact bucketStart (no empties by construction).
  const bucketStart = new Uint32Array(total_buckets + 1);
  let acc = 0;
  for (let b = 0; b < total_buckets; b++) {
    bucketStart[b] = acc;
    acc += pops[b];
  }
  bucketStart[total_buckets] = acc;
  // For Phase 1 v0 we force slice boundaries at bucket edges and at
  // every slice_entries entries — easier for v0 correctness. Use
  // buildSliceLayout to compute a layout, then override boundaries to
  // multiples of slice_entries to match the GPU's fixed-slice model.
  const layout = buildSliceLayout(bucketStart, num_wgs);
  // Force uniform slice_entries slices.
  const sliceBounds = new Uint32Array(num_wgs + 1);
  for (let k = 0; k <= num_wgs; k++) sliceBounds[k] = Math.min(k * slice_entries, total_entries);

  // entry_bucket_id: walk bucketStart, fill per-entry bucket id.
  const entry_bucket_id = new Uint32Array(total_entries);
  for (let b = 0; b < total_buckets; b++) {
    for (let i = bucketStart[b]; i < bucketStart[b + 1]; i++) entry_bucket_id[i] = b;
  }

  // schedule: each entry has a unique scalar_idx and a random sign bit.
  const schedule = new Uint32Array(total_entries);
  for (let i = 0; i < total_entries; i++) {
    schedule[i] = (i & SCHEDULE_IDX_MASK) | (rng() & 1 ? SCHEDULE_SIGN_BIT : 0);
  }

  // Base points: total_entries distinct random Mont-form values. Force
  // every pair within a bucket to have distinct .x so batch-inverse
  // doesn't hit a zero delta.
  const point_x_mont_bigint: bigint[] = new Array(total_entries);
  const point_y_mont_bigint: bigint[] = new Array(total_entries);
  const seenX = new Set<bigint>();
  for (let i = 0; i < total_entries; i++) {
    let xMont: bigint;
    do {
      xMont = (randomBelow(p, rng) * R) % p;
    } while (seenX.has(xMont));
    seenX.add(xMont);
    point_x_mont_bigint[i] = xMont;
    point_y_mont_bigint[i] = (randomBelow(p, rng) * R) % p;
  }
  const point_x = new Uint32Array(total_entries * NUM_LIMBS_U32);
  const point_y = new Uint32Array(total_entries * NUM_LIMBS_U32);
  for (let i = 0; i < total_entries; i++) {
    point_x.set(bigintToLimbsU32(point_x_mont_bigint[i]), i * NUM_LIMBS_U32);
    point_y.set(bigintToLimbsU32(point_y_mont_bigint[i]), i * NUM_LIMBS_U32);
  }

  // CPU pair-detection per slice to determine wg_output_offset.
  const wg_output_count = new Uint32Array(num_wgs);
  for (let s = 0; s < num_wgs; s++) {
    const lo = sliceBounds[s];
    const hi = sliceBounds[s + 1];
    let count = 0;
    let open = false;
    let openBucket = -1;
    for (let i = lo; i < hi; i++) {
      const b = entry_bucket_id[i];
      if (open && b === openBucket) {
        count++;
        open = false;
        openBucket = -1;
      } else {
        if (open) count++;
        open = true;
        openBucket = b;
      }
    }
    if (open) count++;
    wg_output_count[s] = count;
  }
  const wg_output_offset = new Uint32Array(num_wgs + 1);
  for (let s = 0; s < num_wgs; s++) wg_output_offset[s + 1] = wg_output_offset[s] + wg_output_count[s];
  const total_outputs = wg_output_offset[num_wgs];

  void layout; // partition for reference; v0 forces equal slices.
  return {
    num_wgs,
    schedule,
    entry_bucket_id,
    point_x,
    point_y,
    point_x_mont_bigint,
    point_y_mont_bigint,
    slice_bounds: sliceBounds,
    wg_output_offset,
    total_outputs,
  };
}

interface RefOutput {
  bucket_id: number[];
  x: bigint[];
  y: bigint[];
}

function cpuReference(s: Synth, p: bigint): RefOutput {
  const out: RefOutput = { bucket_id: [], x: [], y: [] };
  for (let wg = 0; wg < s.num_wgs; wg++) {
    const lo = s.slice_bounds[wg];
    const hi = s.slice_bounds[wg + 1];
    interface Item { kind: 'pair' | 'unpaired'; idx_a: number; idx_b: number; bucket: number }
    const list: Item[] = [];
    let open: number | null = null;
    let openBucket = -1;
    for (let i = lo; i < hi; i++) {
      const b = s.entry_bucket_id[i];
      if (open !== null && b === openBucket) {
        list.push({ kind: 'pair', idx_a: open, idx_b: i, bucket: openBucket });
        open = null;
        openBucket = -1;
      } else {
        if (open !== null) list.push({ kind: 'unpaired', idx_a: open, idx_b: UNPAIRED_SENTINEL, bucket: openBucket });
        open = i;
        openBucket = b;
      }
    }
    if (open !== null) list.push({ kind: 'unpaired', idx_a: open, idx_b: UNPAIRED_SENTINEL, bucket: openBucket });

    for (const item of list) {
      const aRaw = s.schedule[item.idx_a];
      const a_neg = (aRaw & SCHEDULE_SIGN_BIT) !== 0;
      const a_idx = aRaw & SCHEDULE_IDX_MASK;
      const pXm = s.point_x_mont_bigint[a_idx];
      const pYmRaw = s.point_y_mont_bigint[a_idx];
      const pYm = a_neg ? (p - pYmRaw) % p : pYmRaw;
      if (item.kind === 'unpaired') {
        out.bucket_id.push(item.bucket);
        out.x.push(pXm);
        out.y.push(pYm);
        continue;
      }
      const bRaw = s.schedule[item.idx_b];
      const b_neg = (bRaw & SCHEDULE_SIGN_BIT) !== 0;
      const b_idx = bRaw & SCHEDULE_IDX_MASK;
      const qXm = s.point_x_mont_bigint[b_idx];
      const qYmRaw = s.point_y_mont_bigint[b_idx];
      const qYm = b_neg ? (p - qYmRaw) % p : qYmRaw;
      // Mont-form affine add: same as WGSL fr_sub/montgomery_product.
      // For Mont-form a, b the field op `a + b` is just (a+b) mod p,
      // `a - b` is (a - b + p) mod p, and `mont(a, b)` is a * b * R^-1 mod p.
      const R = (1n << BigInt(NUM_LIMBS_U32 * WORD_SIZE_U32)) % p;
      const Rinv = modInverse(R, p);
      const mont = (a: bigint, b: bigint) => (((a * b) % p) * Rinv) % p;
      const sub = (a: bigint, b: bigint) => ((a - b) % p + p) % p;
      const dx = sub(qXm, pXm);
      const dy = sub(qYm, pYm);
      if (dx === 0n) throw new Error(`zero delta_x at item ${JSON.stringify(item)}`);
      const dx_inv = mont(modInverse(dx, p), R); // inv in Mont form requires extra R multiply
      const slope = mont(dy, dx_inv);
      const slope_sq = mont(slope, slope);
      const t1 = sub(slope_sq, pXm);
      const r_x = sub(t1, qXm);
      const dx_back = sub(pXm, r_x);
      const ldx = mont(slope, dx_back);
      const r_y = sub(ldx, pYm);
      out.bucket_id.push(item.bucket);
      out.x.push(r_x);
      out.y.push(r_y);
    }
  }
  return out;
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const qp = new URLSearchParams(window.location.search);
    const params = {
      num_wgs: Math.max(1, Math.min(64, parseInt(qp.get('num_wgs') ?? '4', 10))),
      slice_entries: Math.max(2, Math.min(MAX_SLICE_ENTRIES, parseInt(qp.get('slice_entries') ?? '24', 10))),
      reps: Math.max(1, Math.min(20, parseInt(qp.get('reps') ?? '3', 10))),
      seed: parseInt(qp.get('seed') ?? '12345', 10),
    };
    benchState.params = params;
    benchState.state = 'running';
    log('info', `params: num_wgs=${params.num_wgs} slice_entries=${params.slice_entries} reps=${params.reps} seed=${params.seed}`);

    const device = await get_device();
    log('info', 'WebGPU device acquired');
    const p = BN254_BASE_FIELD;
    const misc = compute_misc_params(p, WORD_SIZE_U32);
    if (misc.num_words !== NUM_LIMBS_U32) throw new Error(`expected num_words=${NUM_LIMBS_U32}, got ${misc.num_words}`);
    const R = misc.r;

    const synth = buildSynthetic(params.num_wgs, params.slice_entries, params.seed, p, R);
    log('info', `synthetic schedule: entries=${synth.schedule.length} total_outputs=${synth.total_outputs}`);

    const sm = new ShaderManager(4, params.slice_entries, BN254_CURVE_CONFIG, false);
    const code = sm.gen_smvp_tree_phase1_shader(TPB, MAX_SLICE_ENTRIES);
    (window as unknown as Record<string, unknown>)['__shader_phase1'] = code;
    log('info', `compiling shader (${code.length} chars)`);

    const module = device.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    let hasError = false;
    for (const m of info.messages) {
      const line = `[shader] ${m.type}: ${m.message} (line ${m.lineNum}, col ${m.linePos})`;
      if (m.type === 'error') { console.error(line); log('err', line); hasError = true; }
      else { console.warn(line); }
    }
    if (hasError) throw new Error('WGSL compile failed');

    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    const pipeline = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module, entryPoint: 'main' },
    });

    function mkBuf(data: BufferSource | number, usage: number): GPUBuffer {
      const size = typeof data === 'number' ? data : (data as ArrayBufferView).byteLength;
      const buf = device.createBuffer({ size, usage });
      if (typeof data !== 'number') device.queue.writeBuffer(buf, 0, data as BufferSource);
      return buf;
    }

    const scheduleBuf = mkBuf(synth.schedule, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const bucketBuf = mkBuf(synth.entry_bucket_id, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const pxBuf = mkBuf(synth.point_x, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const pyBuf = mkBuf(synth.point_y, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const sliceBoundsBuf = mkBuf(synth.slice_bounds, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const outputOffsetBuf = mkBuf(synth.wg_output_offset, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const prefixScratchBytes = synth.num_wgs * MAX_SLICE_ENTRIES * NUM_LIMBS_U32 * 4;
    const prefixScratchBuf = mkBuf(prefixScratchBytes, GPUBufferUsage.STORAGE);
    const outBucketBuf = mkBuf(synth.total_outputs * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const outXBuf = mkBuf(synth.total_outputs * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const outYBuf = mkBuf(synth.total_outputs * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);

    const bindGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: scheduleBuf } },
        { binding: 1, resource: { buffer: bucketBuf } },
        { binding: 2, resource: { buffer: pxBuf } },
        { binding: 3, resource: { buffer: pyBuf } },
        { binding: 4, resource: { buffer: sliceBoundsBuf } },
        { binding: 5, resource: { buffer: outputOffsetBuf } },
        { binding: 6, resource: { buffer: prefixScratchBuf } },
        { binding: 7, resource: { buffer: outBucketBuf } },
        { binding: 8, resource: { buffer: outXBuf } },
        { binding: 9, resource: { buffer: outYBuf } },
      ],
    });

    // Warmup dispatch.
    {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(synth.num_wgs, 1, 1);
      pass.end();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    }
    log('info', 'warmup dispatch returned');

    // Readback.
    const stagingBucket = device.createBuffer({ size: synth.total_outputs * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const stagingX = device.createBuffer({ size: synth.total_outputs * NUM_LIMBS_U32 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const stagingY = device.createBuffer({ size: synth.total_outputs * NUM_LIMBS_U32 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    {
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(outBucketBuf, 0, stagingBucket, 0, stagingBucket.size);
      enc.copyBufferToBuffer(outXBuf, 0, stagingX, 0, stagingX.size);
      enc.copyBufferToBuffer(outYBuf, 0, stagingY, 0, stagingY.size);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      await Promise.all([stagingBucket.mapAsync(GPUMapMode.READ), stagingX.mapAsync(GPUMapMode.READ), stagingY.mapAsync(GPUMapMode.READ)]);
    }
    const gpuBucket = new Uint32Array(stagingBucket.getMappedRange().slice(0));
    const gpuX = new Uint32Array(stagingX.getMappedRange().slice(0));
    const gpuY = new Uint32Array(stagingY.getMappedRange().slice(0));
    stagingBucket.unmap(); stagingX.unmap(); stagingY.unmap();
    stagingBucket.destroy(); stagingX.destroy(); stagingY.destroy();

    // CPU reference + diff.
    log('info', 'running CPU reference');
    const ref = cpuReference(synth, p);
    if (ref.bucket_id.length !== synth.total_outputs) {
      throw new Error(`CPU reference output count ${ref.bucket_id.length} != GPU total_outputs ${synth.total_outputs}`);
    }
    let mismatches = 0;
    let first_mismatch: string | null = null;
    for (let i = 0; i < ref.bucket_id.length; i++) {
      const gpuX_i = limbsU32ToBigint(gpuX, i * NUM_LIMBS_U32);
      const gpuY_i = limbsU32ToBigint(gpuY, i * NUM_LIMBS_U32);
      if (gpuBucket[i] !== ref.bucket_id[i] || gpuX_i !== ref.x[i] || gpuY_i !== ref.y[i]) {
        mismatches++;
        if (first_mismatch === null) {
          first_mismatch = `i=${i} gpu_bucket=${gpuBucket[i]} ref_bucket=${ref.bucket_id[i]} gpu_x=0x${gpuX_i.toString(16).slice(0, 16)} ref_x=0x${ref.x[i].toString(16).slice(0, 16)} gpu_y=0x${gpuY_i.toString(16).slice(0, 16)} ref_y=0x${ref.y[i].toString(16).slice(0, 16)}`;
        }
      }
    }
    if (mismatches === 0) log('ok', `correctness OK: ${synth.total_outputs} outputs match CPU reference bit-for-bit`);
    else log('err', `MISMATCH on ${mismatches}/${synth.total_outputs} outputs. first: ${first_mismatch}`);

    // Bench reps.
    const samples_ms: number[] = [];
    for (let r = 0; r < params.reps; r++) {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(synth.num_wgs, 1, 1);
      pass.end();
      const t0 = performance.now();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      samples_ms.push(performance.now() - t0);
    }
    const median_ms = samples_ms.slice().sort((a, b) => a - b)[Math.floor(samples_ms.length / 2)];
    benchState.results = { median_ms, samples_ms, num_outputs: synth.total_outputs, mismatches, first_mismatch };
    log('ok', `bench: median=${median_ms.toFixed(3)}ms reps=${samples_ms.length} samples=${samples_ms.map(x => x.toFixed(2)).join(',')}`);
    benchState.state = mismatches === 0 ? 'done' : 'error';
    if (mismatches !== 0) benchState.error = `${mismatches} mismatches; first: ${first_mismatch}`;
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `FATAL: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  }
}

main()
  .catch(e => {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `unhandled: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  })
  .finally(() => {
    postFinal().catch(() => {});
  });
