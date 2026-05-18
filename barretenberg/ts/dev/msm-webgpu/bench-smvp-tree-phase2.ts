/// <reference types="@webgpu/types" />
// Standalone correctness + bench page for the smvp_tree_phase2 WGSL
// kernel. Generates a synthetic bucket-sorted partials input —
// `(bucket_id, AffinePoint)` tuples uniformly distributed across a
// few buckets — runs Phase 2 on the GPU, and diffs every output
// against a CPU reference built from the same pair-detection +
// affine-add formulas.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';

const NUM_LIMBS_U32 = 20;
const WORD_SIZE_U32 = 13;
const W_U32 = 1n << BigInt(WORD_SIZE_U32);
const MASK_U32 = W_U32 - 1n;

const TPB = 64;
const MAX_SLICE_ENTRIES = 1024;
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

const resultsClient = makeResultsClient({ page: 'bench-smvp-tree-phase2' });
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
  console.log(`[bench-smvp-tree-phase2] ${msg}`);
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
  const wordLen = Math.ceil(bitlen / 32);
  for (let attempt = 0; attempt < 64; attempt++) {
    let v = 0n;
    for (let i = 0; i < wordLen; i++) v = (v << 32n) | BigInt(rng() >>> 0);
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
  input_bucket_id: Uint32Array;
  input_x: Uint32Array;
  input_y: Uint32Array;
  input_x_mont: bigint[];
  input_y_mont: bigint[];
  slice_bounds: Uint32Array;
  wg_output_offset: Uint32Array;
  total_outputs: number;
  total_entries: number;
}

function buildSynthetic(num_wgs: number, slice_entries: number, seed: number, p: bigint, R: bigint): Synth {
  const rng = makeRng(seed);
  const total_entries = num_wgs * slice_entries;
  const buckets_per_slice = 3 + (rng() % 3);
  const pops_per_wg: number[][] = [];
  for (let s = 0; s < num_wgs; s++) {
    const pops: number[] = [];
    let remaining = slice_entries;
    for (let b = 0; b < buckets_per_slice - 1; b++) {
      const maxPop = Math.max(1, remaining - (buckets_per_slice - 1 - b));
      const pop = 1 + (rng() % maxPop);
      pops.push(pop);
      remaining -= pop;
    }
    pops.push(remaining);
    pops_per_wg.push(pops);
  }

  // Bucket ids: globally sorted by ascending bucket id across all WGs.
  // Each WG has buckets_per_slice consecutive bucket ids starting at
  // `wg * buckets_per_slice`.
  const input_bucket_id = new Uint32Array(total_entries);
  let cursor = 0;
  for (let s = 0; s < num_wgs; s++) {
    const pops = pops_per_wg[s];
    for (let b = 0; b < pops.length; b++) {
      const bucketId = s * buckets_per_slice + b;
      for (let k = 0; k < pops[b]; k++) {
        input_bucket_id[cursor++] = bucketId;
      }
    }
  }

  const input_x_mont: bigint[] = new Array(total_entries);
  const input_y_mont: bigint[] = new Array(total_entries);
  const seenX = new Set<bigint>();
  for (let i = 0; i < total_entries; i++) {
    let xMont: bigint;
    do {
      xMont = (randomBelow(p, rng) * R) % p;
    } while (seenX.has(xMont));
    seenX.add(xMont);
    input_x_mont[i] = xMont;
    input_y_mont[i] = (randomBelow(p, rng) * R) % p;
  }
  const input_x = new Uint32Array(total_entries * NUM_LIMBS_U32);
  const input_y = new Uint32Array(total_entries * NUM_LIMBS_U32);
  for (let i = 0; i < total_entries; i++) {
    input_x.set(bigintToLimbsU32(input_x_mont[i]), i * NUM_LIMBS_U32);
    input_y.set(bigintToLimbsU32(input_y_mont[i]), i * NUM_LIMBS_U32);
  }

  const slice_bounds = new Uint32Array(num_wgs + 1);
  for (let k = 0; k <= num_wgs; k++) slice_bounds[k] = Math.min(k * slice_entries, total_entries);

  // CPU pair-detection per slice to determine wg_output_offset.
  const wg_output_count = new Uint32Array(num_wgs);
  for (let s = 0; s < num_wgs; s++) {
    const lo = slice_bounds[s];
    const hi = slice_bounds[s + 1];
    let count = 0;
    let open = false;
    let openBucket = -1;
    for (let i = lo; i < hi; i++) {
      const b = input_bucket_id[i];
      if (open && b === openBucket) { count++; open = false; openBucket = -1; }
      else { if (open) count++; open = true; openBucket = b; }
    }
    if (open) count++;
    wg_output_count[s] = count;
  }
  const wg_output_offset = new Uint32Array(num_wgs + 1);
  for (let s = 0; s < num_wgs; s++) wg_output_offset[s + 1] = wg_output_offset[s] + wg_output_count[s];
  const total_outputs = wg_output_offset[num_wgs];

  return {
    num_wgs,
    input_bucket_id,
    input_x,
    input_y,
    input_x_mont,
    input_y_mont,
    slice_bounds,
    wg_output_offset,
    total_outputs,
    total_entries,
  };
}

interface RefOutput { bucket_id: number[]; x: bigint[]; y: bigint[] }

function cpuReference(s: Synth, p: bigint, R: bigint): RefOutput {
  const out: RefOutput = { bucket_id: [], x: [], y: [] };
  const Rinv = modInverse(R, p);
  const toCanon = (m: bigint) => (m * Rinv) % p;
  const toMont = (c: bigint) => (c * R) % p;
  const sub = (a: bigint, b: bigint) => ((a - b) % p + p) % p;

  for (let wg = 0; wg < s.num_wgs; wg++) {
    const lo = s.slice_bounds[wg];
    const hi = s.slice_bounds[wg + 1];
    interface Item { kind: 'pair' | 'unpaired'; idx_a: number; idx_b: number; bucket: number }
    const list: Item[] = [];
    let open: number | null = null;
    let openBucket = -1;
    for (let i = lo; i < hi; i++) {
      const b = s.input_bucket_id[i];
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
      const pXm = s.input_x_mont[item.idx_a];
      const pYm = s.input_y_mont[item.idx_a];
      if (item.kind === 'unpaired') {
        out.bucket_id.push(item.bucket);
        out.x.push(pXm);
        out.y.push(pYm);
        continue;
      }
      const qXm = s.input_x_mont[item.idx_b];
      const qYm = s.input_y_mont[item.idx_b];
      const pX = toCanon(pXm), pY = toCanon(pYm), qX = toCanon(qXm), qY = toCanon(qYm);
      const dx = sub(qX, pX);
      const dy = sub(qY, pY);
      if (dx === 0n) throw new Error(`zero delta_x at item ${JSON.stringify(item)}`);
      const slope = (dy * modInverse(dx, p)) % p;
      const slope_sq = (slope * slope) % p;
      const r_x_canon = sub(sub(slope_sq, pX), qX);
      const r_y_canon = sub((slope * sub(pX, r_x_canon)) % p, pY);
      out.bucket_id.push(item.bucket);
      out.x.push(toMont(r_x_canon));
      out.y.push(toMont(r_y_canon));
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
    if (misc.num_words !== NUM_LIMBS_U32) throw new Error(`num_words mismatch`);
    const R = misc.r;

    const synth = buildSynthetic(params.num_wgs, params.slice_entries, params.seed, p, R);
    log('info', `synthetic: entries=${synth.total_entries} total_outputs=${synth.total_outputs}`);

    const sm = new ShaderManager(4, params.slice_entries, BN254_CURVE_CONFIG, false);
    const code = sm.gen_smvp_tree_phase2_shader(TPB, MAX_SLICE_ENTRIES, MAX_SLICE_ENTRIES);
    (window as unknown as Record<string, unknown>)['__shader_phase2'] = code;
    log('info', `compiling shader (${code.length} chars)`);

    const module = device.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    for (const m of info.messages) {
      const line = `[shader] ${m.type}: ${m.message} (line ${m.lineNum}, col ${m.linePos})`;
      if (m.type === 'error') { log('err', line); throw new Error('WGSL compile failed'); }
    }

    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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

    const bucketBuf = mkBuf(synth.input_bucket_id, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const xBuf = mkBuf(synth.input_x, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const yBuf = mkBuf(synth.input_y, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const sliceBoundsBuf = mkBuf(synth.slice_bounds, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const outputOffsetBuf = mkBuf(synth.wg_output_offset, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const prefixBytes = synth.num_wgs * MAX_SLICE_ENTRIES * NUM_LIMBS_U32 * 4;
    const prefixBuf = mkBuf(prefixBytes, GPUBufferUsage.STORAGE);
    const outBucketBuf = mkBuf(synth.total_outputs * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const outXBuf = mkBuf(synth.total_outputs * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const outYBuf = mkBuf(synth.total_outputs * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);

    const bindGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: bucketBuf } },
        { binding: 1, resource: { buffer: xBuf } },
        { binding: 2, resource: { buffer: yBuf } },
        { binding: 3, resource: { buffer: sliceBoundsBuf } },
        { binding: 4, resource: { buffer: outputOffsetBuf } },
        { binding: 5, resource: { buffer: prefixBuf } },
        { binding: 6, resource: { buffer: outBucketBuf } },
        { binding: 7, resource: { buffer: outXBuf } },
        { binding: 8, resource: { buffer: outYBuf } },
      ],
    });

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

    log('info', 'running CPU reference');
    const ref = cpuReference(synth, p, R);
    if (ref.bucket_id.length !== synth.total_outputs) throw new Error(`ref count ${ref.bucket_id.length} != gpu ${synth.total_outputs}`);
    let mismatches = 0;
    let first_mismatch: string | null = null;
    for (let i = 0; i < ref.bucket_id.length; i++) {
      const gx = limbsU32ToBigint(gpuX, i * NUM_LIMBS_U32);
      const gy = limbsU32ToBigint(gpuY, i * NUM_LIMBS_U32);
      if (gpuBucket[i] !== ref.bucket_id[i] || gx !== ref.x[i] || gy !== ref.y[i]) {
        mismatches++;
        if (first_mismatch === null) {
          first_mismatch = `i=${i} gpu_b=${gpuBucket[i]} ref_b=${ref.bucket_id[i]} gpu_x=0x${gx.toString(16).slice(0, 16)} ref_x=0x${ref.x[i].toString(16).slice(0, 16)}`;
        }
      }
    }
    if (mismatches === 0) log('ok', `correctness OK: ${synth.total_outputs} outputs match CPU reference bit-for-bit`);
    else log('err', `MISMATCH on ${mismatches}/${synth.total_outputs}: ${first_mismatch}`);

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
    log('ok', `bench: median=${median_ms.toFixed(3)}ms reps=${samples_ms.length}`);
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
    benchState.state = 'error';
    benchState.error = e instanceof Error ? e.message : String(e);
  })
  .finally(() => {
    postFinal().catch(() => {});
  });
