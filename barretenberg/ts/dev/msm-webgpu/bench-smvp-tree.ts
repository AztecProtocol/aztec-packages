/// <reference types="@webgpu/types" />
// End-to-end tree-reduce orchestrator bench.
//
// Builds a synthetic bucket-sorted schedule, runs the tree-reduce
// orchestrator (Phase 1 + iterated Phase 2 with CPU sort between
// phases), and diffs the final per-bucket partials against a CPU
// reference that computes the per-bucket point-add sum directly.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { runTreeReduce } from '../../src/msm_webgpu/cuzk/smvp_tree.js';
import { makeResultsClient } from './results_post.js';

const NUM_LIMBS_U32 = 20;
const WORD_SIZE_U32 = 13;
const W_U32 = 1n << BigInt(WORD_SIZE_U32);
const MASK_U32 = W_U32 - 1n;
const TPB = 64;
// SWEET_B = 1024 per the plan. Re-architected Phase 1/2 shaders
// (v2) precompute rank_to_raw + prev_raw_for_pair in the preamble
// and iterate exactly PER_THREAD_PAIRS times per thread in Phase
// A/D, with pair_bucket moved to global memory to keep workgroup
// storage under M2's 32 KiB cap.
const MAX_SLICE_ENTRIES = 1024;
const SCHEDULE_SIGN_BIT = 0x80000000;
const SCHEDULE_IDX_MASK = 0x7fffffff;

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { entries: number; buckets: number; seed: number } | null;
  results: {
    layers: number;
    total_outputs: number;
    phase_ms: { phase: string; ms: number }[];
    mismatches: number;
    first_mismatch: string | null;
  } | null;
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: null, error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;

const resultsClient = makeResultsClient({ page: 'bench-smvp-tree' });
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
  console.log(`[bench-smvp-tree] ${msg}`);
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
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
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
  while (r !== 0n) { const q = old_r / r; [old_r, r] = [r, old_r - q * r]; [old_s, s] = [s, old_s - q * s]; }
  if (old_r !== 1n) throw new Error('not invertible');
  return ((old_s % m) + m) % m;
}

// CPU affine add in canonical form.
function affineAddCanon(pX: bigint, pY: bigint, qX: bigint, qY: bigint, p: bigint): { x: bigint; y: bigint } {
  if (pX === qX) {
    if (pY === qY) {
      // Point doubling.
      const slope = (3n * pX * pX * modInverse(2n * pY, p)) % p;
      const rx = ((slope * slope - 2n * pX) % p + p) % p;
      const ry = ((slope * ((pX - rx + p) % p) - pY) % p + p) % p;
      return { x: rx, y: ry };
    }
    throw new Error(`affineAddCanon: P + (-P), point at infinity not supported in synthetic test`);
  }
  const sub = (a: bigint, b: bigint) => ((a - b) % p + p) % p;
  const dx = sub(qX, pX);
  const dy = sub(qY, pY);
  const slope = (dy * modInverse(dx, p)) % p;
  const rx = sub(sub((slope * slope) % p, pX), qX);
  const ry = sub((slope * sub(pX, rx)) % p, pY);
  return { x: rx, y: ry };
}

interface Synth {
  schedule: Uint32Array;
  entry_bucket_id: Uint32Array;
  point_x: Uint32Array;
  point_y: Uint32Array;
  point_x_canon: bigint[];
  point_y_canon: bigint[];
  bucket_pops: number[]; // [bucket0_pop, bucket1_pop, ...]
  total_entries: number;
  bucketStart: Uint32Array;
}

function buildSynthetic(entries: number, buckets: number, seed: number, p: bigint, R: bigint, skewMode: 'uniform' | 'heavy' = 'uniform'): Synth {
  const rng = makeRng(seed);
  // Distribute `entries` across `buckets` buckets, each at least 1.
  const pops: number[] = new Array(buckets).fill(1);
  let remaining = entries - buckets;
  if (skewMode === 'heavy') {
    // Worst-case skew for the existing round-loop MSM: one bucket gets
    // ~half the entries, the rest distribute uniformly over the
    // remainder. Tree-reduce should still finish in ceil(log2(heavy_pop))+1
    // layers regardless.
    const heavy = Math.floor(entries / 2);
    pops[0] += heavy; remaining -= heavy;
  }
  while (remaining > 0) {
    const b = rng() % buckets;
    pops[b]++;
    remaining--;
  }
  const total_entries = entries;
  const bucketStart = new Uint32Array(buckets + 1);
  let acc = 0;
  for (let b = 0; b < buckets; b++) { bucketStart[b] = acc; acc += pops[b]; }
  bucketStart[buckets] = acc;

  const entry_bucket_id = new Uint32Array(total_entries);
  for (let b = 0; b < buckets; b++) {
    for (let i = bucketStart[b]; i < bucketStart[b + 1]; i++) entry_bucket_id[i] = b;
  }

  const schedule = new Uint32Array(total_entries);
  for (let i = 0; i < total_entries; i++) {
    // No sign flip for this bench to keep the CPU reference simple.
    schedule[i] = (i & SCHEDULE_IDX_MASK);
  }

  // Synthetic points: random canonical x,y (not on-curve; we diff
  // CPU vs GPU using the same algebraic affine-add formula, so on-
  // curveness doesn't matter as long as the math doesn't hit P+(-P)
  // or zero delta_x, which we guard against by picking distinct x).
  const point_x_canon: bigint[] = new Array(total_entries);
  const point_y_canon: bigint[] = new Array(total_entries);
  const seenX = new Set<bigint>();
  for (let i = 0; i < total_entries; i++) {
    let x: bigint;
    do { x = randomBelow(p, rng); } while (seenX.has(x));
    seenX.add(x);
    point_x_canon[i] = x;
    point_y_canon[i] = randomBelow(p, rng);
  }
  const point_x = new Uint32Array(total_entries * NUM_LIMBS_U32);
  const point_y = new Uint32Array(total_entries * NUM_LIMBS_U32);
  for (let i = 0; i < total_entries; i++) {
    point_x.set(bigintToLimbsU32((point_x_canon[i] * R) % p), i * NUM_LIMBS_U32);
    point_y.set(bigintToLimbsU32((point_y_canon[i] * R) % p), i * NUM_LIMBS_U32);
  }

  return { schedule, entry_bucket_id, point_x, point_y, point_x_canon, point_y_canon, bucket_pops: pops, total_entries, bucketStart };
}

function cpuReferenceFullReduce(s: Synth, p: bigint): { bucketId: number[]; x: bigint[]; y: bigint[] } {
  // Mirror the GPU's tree-reduce parenthesization. Critical detail:
  // the affine-add formula is only group-associative on actual
  // elliptic curve points. The synthetic input uses random (off-curve)
  // bigints, so sequential `((P0+P1)+P2)+P3` produces a DIFFERENT
  // bit-pattern than the tree-reduce `(P0+P1)+(P2+P3)`. To validate
  // the orchestrator bit-for-bit, walk each bucket via the same pair-
  // detection state machine the GPU uses, recursing layer-by-layer.
  function reduceBucket(points: { x: bigint; y: bigint }[]): { x: bigint; y: bigint } {
    let cur = points;
    while (cur.length > 1) {
      const next: { x: bigint; y: bigint }[] = [];
      // Pair-detection state machine — same as GPU thread-0 preamble.
      let open: { x: bigint; y: bigint } | null = null;
      for (const pt of cur) {
        if (open !== null) {
          next.push(affineAddCanon(open.x, open.y, pt.x, pt.y, p));
          open = null;
        } else {
          open = pt;
        }
      }
      if (open !== null) next.push(open);
      cur = next;
    }
    return cur[0];
  }
  const out: { bucketId: number[]; x: bigint[]; y: bigint[] } = { bucketId: [], x: [], y: [] };
  let cursor = 0;
  for (let b = 0; b < s.bucket_pops.length; b++) {
    const pop = s.bucket_pops[b];
    const pts: { x: bigint; y: bigint }[] = [];
    for (let k = 0; k < pop; k++) {
      pts.push({ x: s.point_x_canon[cursor], y: s.point_y_canon[cursor] });
      cursor++;
    }
    const r = reduceBucket(pts);
    out.bucketId.push(b);
    out.x.push(r.x);
    out.y.push(r.y);
  }
  return out;
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const qp = new URLSearchParams(window.location.search);
    const params = {
      entries: Math.max(2, Math.min(1 << 18, parseInt(qp.get('entries') ?? '60', 10))),
      buckets: Math.max(1, Math.min(1 << 14, parseInt(qp.get('buckets') ?? '6', 10))),
      seed: parseInt(qp.get('seed') ?? '12345', 10),
      skewMode: (qp.get('skew') === 'heavy' ? 'heavy' : 'uniform') as 'uniform' | 'heavy',
    };
    benchState.params = params;
    benchState.state = 'running';
    log('info', `params: entries=${params.entries} buckets=${params.buckets} seed=${params.seed}`);

    const device = await get_device();
    log('info', 'WebGPU device acquired');
    const p = BN254_BASE_FIELD;
    const misc = compute_misc_params(p, WORD_SIZE_U32);
    const R = misc.r;
    const Rinv = modInverse(R, p);

    const synth = buildSynthetic(params.entries, params.buckets, params.seed, p, R, params.skewMode);
    const popsSummary = synth.bucket_pops.length > 16
      ? `pops[0..15]=${synth.bucket_pops.slice(0, 16).join(',')}... max=${Math.max(...synth.bucket_pops)} min=${Math.min(...synth.bucket_pops)}`
      : `pops=${synth.bucket_pops.join(',')}`;
    log('info', `synth: entries=${synth.total_entries} buckets=${synth.bucket_pops.length} skew=${params.skewMode} ${popsSummary}`);

    const sm = new ShaderManager(4, synth.total_entries, BN254_CURVE_CONFIG, false);
    const p1Code = sm.gen_smvp_tree_phase1_shader(TPB, MAX_SLICE_ENTRIES);
    const p2Code = sm.gen_smvp_tree_phase2_shader(TPB, MAX_SLICE_ENTRIES);
    log('info', `compiling shaders (p1=${p1Code.length} p2=${p2Code.length} chars)`);
    const p1Mod = device.createShaderModule({ code: p1Code });
    const p2Mod = device.createShaderModule({ code: p2Code });

    const p1Layout = device.createBindGroupLayout({
      entries: Array.from({ length: 10 }, (_, i) => ({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: i <= 5 ? 'read-only-storage' as const : 'storage' as const },
      })),
    });
    const p2Layout = device.createBindGroupLayout({
      entries: Array.from({ length: 9 }, (_, i) => ({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: i <= 4 ? 'read-only-storage' as const : 'storage' as const },
      })),
    });

    const p1Pipeline = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [p1Layout] }),
      compute: { module: p1Mod, entryPoint: 'main' },
    });
    const p2Pipeline = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [p2Layout] }),
      compute: { module: p2Mod, entryPoint: 'main' },
    });

    function mkBuf(data: BufferSource | number, usage: number): GPUBuffer {
      const size = typeof data === 'number' ? data : (data as ArrayBufferView).byteLength;
      const buf = device.createBuffer({ size, usage });
      if (typeof data !== 'number') device.queue.writeBuffer(buf, 0, data as BufferSource);
      return buf;
    }
    const scheduleBuf = mkBuf(synth.schedule, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const bucketBuf = mkBuf(synth.entry_bucket_id, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
    const xBuf = mkBuf(synth.point_x, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const yBuf = mkBuf(synth.point_y, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);

    log('info', 'running tree-reduce orchestrator...');
    const res = await runTreeReduce(
      device, p1Pipeline, p1Layout, p2Pipeline, p2Layout,
      scheduleBuf, bucketBuf, xBuf, yBuf,
      synth.total_entries, synth.bucketStart,
      { tpb: TPB, maxSliceEntries: MAX_SLICE_ENTRIES },
    );
    log('info', `orchestrator done: layers=${res.layers} total_outputs=${res.totalOutputs}`);
    for (const t of res.phaseTimingsMs) log('info', `  ${t.phase}: ${t.ms.toFixed(2)}ms`);

    // Readback final partials.
    const outN = res.totalOutputs;
    const stB = device.createBuffer({ size: outN * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const stX = device.createBuffer({ size: outN * NUM_LIMBS_U32 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const stY = device.createBuffer({ size: outN * NUM_LIMBS_U32 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    {
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(res.outputBucketId, 0, stB, 0, stB.size);
      enc.copyBufferToBuffer(res.outputX, 0, stX, 0, stX.size);
      enc.copyBufferToBuffer(res.outputY, 0, stY, 0, stY.size);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      await Promise.all([stB.mapAsync(GPUMapMode.READ), stX.mapAsync(GPUMapMode.READ), stY.mapAsync(GPUMapMode.READ)]);
    }
    const gpuB = new Uint32Array(stB.getMappedRange().slice(0));
    const gpuX = new Uint32Array(stX.getMappedRange().slice(0));
    const gpuY = new Uint32Array(stY.getMappedRange().slice(0));
    stB.unmap(); stX.unmap(); stY.unmap(); stB.destroy(); stX.destroy(); stY.destroy();

    log('info', 'running CPU full-reduce reference');
    const ref = cpuReferenceFullReduce(synth, p);
    if (ref.bucketId.length !== outN) {
      throw new Error(`ref bucket count ${ref.bucketId.length} != gpu count ${outN}`);
    }
    // Pair up by bucket_id (both should be sorted; if GPU isn't sorted,
    // build a map).
    const gpuByBucket = new Map<number, { x: bigint; y: bigint }>();
    for (let i = 0; i < outN; i++) {
      gpuByBucket.set(gpuB[i], {
        x: (limbsU32ToBigint(gpuX, i * NUM_LIMBS_U32) * Rinv) % p,
        y: (limbsU32ToBigint(gpuY, i * NUM_LIMBS_U32) * Rinv) % p,
      });
    }
    let mismatches = 0;
    let first_mismatch: string | null = null;
    for (let i = 0; i < ref.bucketId.length; i++) {
      const b = ref.bucketId[i];
      const g = gpuByBucket.get(b);
      if (!g || g.x !== ref.x[i] || g.y !== ref.y[i]) {
        mismatches++;
        if (first_mismatch === null) {
          first_mismatch = `bucket=${b} gpu_x=${g?.x?.toString(16)?.slice(0, 16)} ref_x=${ref.x[i].toString(16).slice(0, 16)}`;
        }
      }
    }
    if (mismatches === 0) log('ok', `correctness OK: ${outN} buckets match full-reduce CPU reference bit-for-bit`);
    else log('err', `MISMATCH on ${mismatches}/${outN}: ${first_mismatch}`);

    benchState.results = {
      layers: res.layers,
      total_outputs: outN,
      phase_ms: res.phaseTimingsMs,
      mismatches,
      first_mismatch,
    };
    benchState.state = mismatches === 0 ? 'done' : 'error';
    if (mismatches !== 0) benchState.error = `${mismatches} mismatches`;
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `FATAL: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  }
}

main()
  .catch(e => { benchState.state = 'error'; benchState.error = e instanceof Error ? e.message : String(e); })
  .finally(() => { postFinal().catch(() => {}); });
