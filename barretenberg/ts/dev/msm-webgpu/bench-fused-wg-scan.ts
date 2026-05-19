/// <reference types="@webgpu/types" />
// Standalone WebGPU bench + correctness oracle for the new
// `batch_affine_fused_wg_scan` kernel (workgroup-scan fused batch-affine
// round, validated to mirror bench_batch_affine's 22 ns/pair design with
// bucket-indirect loads via pair_target_meta).
//
// Inputs: TOTAL_PAIRS on-curve BN254 G1 affine pairs (P_i, Q_i),
// distributed across ONE synthetic subtask. Each pair maps to a unique
// bucket (`pair_target_meta[2i] = i`, `pair_target_meta[2i+1] = i`,
// `val_idx[i] = i`), so the scheduler's "distinct-buckets within a
// subtask round" invariant holds trivially. The kernel writes the
// affine sum `R_i = P_i + Q_i` to running_x[i] / running_y[i]; we
// decode packed Mont form back to canonical and compare to noble's
// reference P.add(Q).
//
// SAFETY: NO MSM pipeline touched. The shader uses only compile-time-
// const loop bounds (BS, TPB, NUM_WORDS). One dispatch per measurement.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';
import { bn254 } from '@noble/curves/bn254';

const G1 = bn254.G1.ProjectivePoint;
const FR_ORDER = bn254.fields.Fr.ORDER;

const DEFAULT_TOTAL_PAIRS = 1 << 16;
let TOTAL_PAIRS = DEFAULT_TOTAL_PAIRS;

const DEFAULT_BATCH_SIZES = [256, 512, 1024, 2048] as const;
let BATCH_SIZES: readonly number[] = DEFAULT_BATCH_SIZES;

let SKIP_CORRECTNESS = false;

function tpbBsFor(batchSize: number): { tpb: number; bs: number } {
  if (batchSize <= 64) return { tpb: batchSize, bs: 1 };
  return { tpb: 64, bs: batchSize / 64 };
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
    if (v > 0n && v < p) return v;
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function biToLe32u32(v: bigint): Uint32Array {
  const out = new Uint32Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffffffffn);
    x >>= 32n;
  }
  return out;
}

function le32u32ToBi(u32: Uint32Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 32n) | BigInt(u32[off + i] >>> 0);
  return v;
}

interface PerSizeResult {
  batch_size: number;
  tpb: number;
  bs: number;
  num_wgs: number;
  total_pairs: number;
  median_ms: number;
  min_ms: number;
  max_ms: number;
  ns_per_pair: number;
  samples_ms: number[];
  correctness: 'pass' | 'fail' | 'skipped';
  correctness_first_fail?: { i: number; expected_x: string; got_x: string; expected_y: string; got_y: string };
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { reps: number; total: number; sizes: readonly number[]; skip_correctness: boolean } | null;
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

const resultsClient = makeResultsClient({ page: 'bench-fused-wg-scan' });
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
  console.log(`[bench-fused-wg-scan] ${msg}`);
}

async function createPipeline(
  device: GPUDevice,
  code: string,
  cacheKey: string,
): Promise<{ pipeline: GPUComputePipeline; layout: GPUBindGroupLayout }> {
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
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const pipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
  return { pipeline, layout };
}

interface PointPair {
  p: { x: bigint; y: bigint };
  q: { x: bigint; y: bigint };
  r: { x: bigint; y: bigint };
}

function buildPairs(n: number, seed: number): PointPair[] {
  const rng = makeRng(seed);
  const out: PointPair[] = [];
  for (let i = 0; i < n; i++) {
    let p: { x: bigint; y: bigint };
    let q: { x: bigint; y: bigint };
    let r: { x: bigint; y: bigint };
    for (;;) {
      const sp = randomBelow(FR_ORDER, rng);
      const sq = randomBelow(FR_ORDER, rng);
      const pp = G1.BASE.multiply(sp);
      const qp = G1.BASE.multiply(sq);
      if (pp.is0() || qp.is0()) continue;
      const pa = pp.toAffine();
      const qa = qp.toAffine();
      if (pa.x === qa.x) continue;
      const rp = pp.add(qp);
      if (rp.is0()) continue;
      const ra = rp.toAffine();
      p = pa;
      q = qa;
      r = ra;
      break;
    }
    out.push({ p, q, r });
  }
  return out;
}

async function runOne(
  device: GPUDevice,
  sm: ShaderManager,
  batchSize: number,
  reps: number,
  R: bigint,
  p: bigint,
  pairs: PointPair[],
): Promise<PerSizeResult> {
  const { tpb, bs } = tpbBsFor(batchSize);
  if (TOTAL_PAIRS % batchSize !== 0) {
    throw new Error(`TOTAL_PAIRS=${TOTAL_PAIRS} must be a multiple of batch_size=${batchSize}`);
  }
  const numWgs = TOTAL_PAIRS / batchSize;
  log('info', `=== batch_size=${batchSize}: TPB=${tpb} BS=${bs} num_WGs=${numWgs}`);

  const code = sm.gen_batch_affine_fused_wg_scan_shader(tpb, bs);
  const cacheKey = `bench-fused-wg-scan-T${tpb}-S${bs}`;
  log('info', `compiling shader (${code.length} chars)`);
  (window as unknown as Record<string, unknown>)[`__shader_${batchSize}`] = code;
  const { pipeline, layout } = await createPipeline(device, code, cacheKey);

  const fieldBytes = 32;
  const fieldsPerPair = 2;
  const fieldsTotalIo = TOTAL_PAIRS * fieldsPerPair;

  const newPointXAB = new ArrayBuffer(TOTAL_PAIRS * fieldBytes);
  const newPointYAB = new ArrayBuffer(TOTAL_PAIRS * fieldBytes);
  const runningXAB = new ArrayBuffer(TOTAL_PAIRS * fieldBytes);
  const runningYAB = new ArrayBuffer(TOTAL_PAIRS * fieldBytes);

  const nx32 = new Uint32Array(newPointXAB);
  const ny32 = new Uint32Array(newPointYAB);
  const rx32 = new Uint32Array(runningXAB);
  const ry32 = new Uint32Array(runningYAB);

  for (let i = 0; i < TOTAL_PAIRS; i++) {
    const { p: pp, q: qq } = pairs[i];
    const pxM = (pp.x * R) % p;
    const pyM = (pp.y * R) % p;
    const qxM = (qq.x * R) % p;
    const qyM = (qq.y * R) % p;
    rx32.set(biToLe32u32(pxM), i * 8);
    ry32.set(biToLe32u32(pyM), i * 8);
    nx32.set(biToLe32u32(qxM), i * 8);
    ny32.set(biToLe32u32(qyM), i * 8);
  }

  const valIdxAB = new Uint32Array(TOTAL_PAIRS);
  const ptmAB = new Uint32Array(TOTAL_PAIRS * 2);
  for (let i = 0; i < TOTAL_PAIRS; i++) {
    valIdxAB[i] = i;
    ptmAB[2 * i] = i;
    ptmAB[2 * i + 1] = i;
  }
  const countAB = new Uint32Array([TOTAL_PAIRS]);
  const paramsAB = new Uint32Array([TOTAL_PAIRS, TOTAL_PAIRS, 0, 0]);

  const mkSb = (size: number, copyDst = true, copySrc = false): GPUBuffer => {
    let usage = GPUBufferUsage.STORAGE;
    if (copyDst) usage |= GPUBufferUsage.COPY_DST;
    if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
    return device.createBuffer({ size, usage });
  };

  const valIdxBuf = mkSb(valIdxAB.byteLength);
  const newPointXBuf = mkSb(newPointXAB.byteLength);
  const newPointYBuf = mkSb(newPointYAB.byteLength);
  const runningXBuf = mkSb(runningXAB.byteLength, true, true);
  const runningYBuf = mkSb(runningYAB.byteLength, true, true);
  const ptmBuf = mkSb(ptmAB.byteLength);
  const prefixBuf = mkSb(TOTAL_PAIRS * 20 * 4, false);
  const countBuf = mkSb(countAB.byteLength);
  const paramsBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(valIdxBuf, 0, valIdxAB);
  device.queue.writeBuffer(newPointXBuf, 0, newPointXAB);
  device.queue.writeBuffer(newPointYBuf, 0, newPointYAB);
  device.queue.writeBuffer(ptmBuf, 0, ptmAB);
  device.queue.writeBuffer(countBuf, 0, countAB);
  device.queue.writeBuffer(paramsBuf, 0, paramsAB);

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: valIdxBuf } },
      { binding: 1, resource: { buffer: newPointXBuf } },
      { binding: 2, resource: { buffer: newPointYBuf } },
      { binding: 3, resource: { buffer: runningXBuf } },
      { binding: 4, resource: { buffer: runningYBuf } },
      { binding: 5, resource: { buffer: ptmBuf } },
      { binding: 6, resource: { buffer: prefixBuf } },
      { binding: 7, resource: { buffer: countBuf } },
      { binding: 8, resource: { buffer: paramsBuf } },
    ],
  });

  device.queue.writeBuffer(runningXBuf, 0, runningXAB);
  device.queue.writeBuffer(runningYBuf, 0, runningYAB);

  const dispatch = async (resetState: boolean) => {
    if (resetState) {
      device.queue.writeBuffer(runningXBuf, 0, runningXAB);
      device.queue.writeBuffer(runningYBuf, 0, runningYAB);
      await device.queue.onSubmittedWorkDone();
    }
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numWgs, 1, 1);
    pass.end();
    const t0 = performance.now();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    return performance.now() - t0;
  };

  await dispatch(true);
  log('info', 'warmup dispatch returned');

  let correctness: 'pass' | 'fail' | 'skipped' = 'skipped';
  let correctness_first_fail: PerSizeResult['correctness_first_fail'];

  if (!SKIP_CORRECTNESS) {
    const stagingX = device.createBuffer({
      size: TOTAL_PAIRS * fieldBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const stagingY = device.createBuffer({
      size: TOTAL_PAIRS * fieldBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(runningXBuf, 0, stagingX, 0, TOTAL_PAIRS * fieldBytes);
    enc.copyBufferToBuffer(runningYBuf, 0, stagingY, 0, TOTAL_PAIRS * fieldBytes);
    device.queue.submit([enc.finish()]);
    await Promise.all([stagingX.mapAsync(GPUMapMode.READ), stagingY.mapAsync(GPUMapMode.READ)]);
    const gpuX = new Uint32Array(stagingX.getMappedRange().slice(0));
    const gpuY = new Uint32Array(stagingY.getMappedRange().slice(0));
    stagingX.unmap();
    stagingY.unmap();
    stagingX.destroy();
    stagingY.destroy();

    const rInv = (() => {
      let g = R % p;
      let r = p;
      let x = 0n;
      let y = 1n;
      while (g !== 0n) {
        const q = r / g;
        [r, g] = [g, r - q * g];
        [x, y] = [y, x - q * y];
      }
      return ((x % p) + p) % p;
    })();

    let mismatches = 0;
    const MAX_REPORTED = 4;
    for (let i = 0; i < TOTAL_PAIRS; i++) {
      const gxM = le32u32ToBi(gpuX, i * 8);
      const gyM = le32u32ToBi(gpuY, i * 8);
      const gx = (gxM * rInv) % p;
      const gy = (gyM * rInv) % p;
      const ex = pairs[i].r.x;
      const ey = pairs[i].r.y;
      if (gx !== ex || gy !== ey) {
        mismatches++;
        if (!correctness_first_fail) {
          correctness_first_fail = {
            i,
            expected_x: ex.toString(),
            got_x: gx.toString(),
            expected_y: ey.toString(),
            got_y: gy.toString(),
          };
        }
        if (mismatches > MAX_REPORTED) break;
      }
    }
    correctness = mismatches === 0 ? 'pass' : 'fail';
    if (mismatches === 0) {
      log('ok', `correctness: pass (${TOTAL_PAIRS}/${TOTAL_PAIRS} pairs match noble reference)`);
    } else {
      log('err', `correctness: FAIL (${mismatches}+ mismatches; first @ i=${correctness_first_fail!.i})`);
      log('err', `  expected R.x = ${correctness_first_fail!.expected_x.slice(0, 24)}...`);
      log('err', `  got      R.x = ${correctness_first_fail!.got_x.slice(0, 24)}...`);
    }
  }

  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    samples.push(await dispatch(false));
  }
  const med = median(samples);
  const mn = Math.min(...samples);
  const mx = Math.max(...samples);
  const nsPerPair = (med * 1e6) / TOTAL_PAIRS;

  log(
    correctness === 'fail' ? 'err' : 'ok',
    `B=${batchSize}: median=${med.toFixed(3)}ms min=${mn.toFixed(3)}ms max=${mx.toFixed(3)}ms ns/pair=${nsPerPair.toFixed(1)} correctness=${correctness}`,
  );

  valIdxBuf.destroy();
  newPointXBuf.destroy();
  newPointYBuf.destroy();
  runningXBuf.destroy();
  runningYBuf.destroy();
  ptmBuf.destroy();
  prefixBuf.destroy();
  countBuf.destroy();
  paramsBuf.destroy();

  return {
    batch_size: batchSize,
    tpb,
    bs,
    num_wgs: numWgs,
    total_pairs: TOTAL_PAIRS,
    median_ms: med,
    min_ms: mn,
    max_ms: mx,
    ns_per_pair: nsPerPair,
    samples_ms: samples,
    correctness,
    correctness_first_fail,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  const reps = parseInt(qp.get('reps') ?? '5', 10);
  if (!Number.isFinite(reps) || reps <= 0 || reps > 50) {
    throw new Error(`?reps must be in (0, 50], got ${qp.get('reps')}`);
  }
  const totalStr = qp.get('total');
  if (totalStr !== null) {
    const total = parseInt(totalStr, 10);
    if (!Number.isFinite(total) || total <= 0 || total > (1 << 20)) {
      throw new Error(`?total must be in (0, 2^20], got ${totalStr}`);
    }
    TOTAL_PAIRS = total;
  }
  const sizesStr = qp.get('sizes');
  if (sizesStr !== null) {
    const sizes = sizesStr.split(',').map(s => parseInt(s, 10));
    for (const s of sizes) {
      if (!Number.isFinite(s) || s <= 0 || s > 4096) {
        throw new Error(`?sizes entries must be in (0, 4096], got ${s}`);
      }
      if (TOTAL_PAIRS % s !== 0) {
        throw new Error(`?sizes entry ${s} does not divide TOTAL_PAIRS=${TOTAL_PAIRS}`);
      }
      const { tpb } = tpbBsFor(s);
      if ((tpb & (tpb - 1)) !== 0) {
        throw new Error(`?sizes entry ${s} yields TPB=${tpb} which is not a power of two`);
      }
    }
    BATCH_SIZES = sizes;
  }
  if (qp.get('skip_correctness') === '1') {
    SKIP_CORRECTNESS = true;
  }
  return { reps, total: TOTAL_PAIRS, sizes: BATCH_SIZES, skip_correctness: SKIP_CORRECTNESS };
}

async function main() {
  try {
    if (!('gpu' in navigator)) {
      throw new Error('navigator.gpu missing — WebGPU not available');
    }
    const params = parseParams();
    benchState.params = params;
    log('info', `params: reps=${params.reps} total=${params.total} sizes=[${params.sizes.join(',')}] skip_correctness=${params.skip_correctness}`);

    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');

    const p = BN254_BASE_FIELD;
    const miscParams = compute_misc_params(p, 13);
    const R = miscParams.r;

    log('info', `generating ${TOTAL_PAIRS} on-curve pairs via noble (this can take a few seconds)…`);
    const t0 = performance.now();
    const pairs = buildPairs(TOTAL_PAIRS, 0xc0ffee);
    log('info', `pair generation done in ${(performance.now() - t0).toFixed(0)} ms`);

    const sm = new ShaderManager(4, TOTAL_PAIRS, BN254_CURVE_CONFIG, false);

    for (const B of BATCH_SIZES) {
      try {
        const r = await runOne(device, sm, B, params.reps, R, p, pairs);
        benchState.results.push(r);
        resultsClient.postProgress({ kind: 'batch_done', batch_size: B, median_ms: r.median_ms, ns_per_pair: r.ns_per_pair, correctness: r.correctness });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('err', `B=${B} failed: ${msg} — STOPPING sweep at first failure`);
        benchState.state = 'error';
        benchState.error = msg;
        return;
      }
    }

    benchState.state = 'done';
    log('ok', 'all batches done');
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
