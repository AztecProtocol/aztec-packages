/// <reference types="@webgpu/types" />
// Standalone WebGPU bench + correctness oracle for the
// `ba_rev_packed_carry` batch-affine scheme: per-thread descending
// suffix-product, single fr_inv_by_a per thread, ascending lean
// apply, with packed 8x u32 storage at the I/O boundary and 13-bit
// BigInt limbs in every register-resident variable.
//
// Inputs: TOTAL_PAIRS on-curve BN254 G1 affine pairs (P_i, Q_i),
// stored flat. Thread `tid` consumes pairs[tid * BS .. (tid+1) * BS).
// The kernel writes R_i = P_i + Q_i to outputs_x[i] / outputs_y[i];
// we decode packed Mont form back to canonical and compare to noble's
// reference P.add(Q).
//
// Sweep dimension: BS (per-thread batch size) at fixed TPB=64. Default
// sweep covers BS in {8, 12, 16, 20, 24} to bracket the M2 sweet spot.
// Override via ?bs=S or ?tpb=T.

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

const DEFAULT_TPB = 64;
let TPB = DEFAULT_TPB;
const DEFAULT_BS_SWEEP: readonly number[] = [8, 12, 16, 20, 24];
let BS_SWEEP: readonly number[] = DEFAULT_BS_SWEEP;

let SKIP_CORRECTNESS = false;

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
  bs: number;
  tpb: number;
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
  params: { reps: number; total: number; tpb: number; bs_sweep: readonly number[]; skip_correctness: boolean } | null;
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

const resultsClient = makeResultsClient({ page: 'bench-ba-rev-packed-carry' });
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
  console.log(`[bench-ba-rev-packed-carry] ${msg}`);
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
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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
  bs: number,
  reps: number,
  R: bigint,
  p: bigint,
  pairs: PointPair[],
): Promise<PerSizeResult> {
  const perThread = bs;
  if (TOTAL_PAIRS % (TPB * perThread) !== 0) {
    throw new Error(
      `TOTAL_PAIRS=${TOTAL_PAIRS} must be a multiple of TPB*BS=${TPB * perThread}`,
    );
  }
  const totalThreads = TOTAL_PAIRS / perThread;
  const numWgs = totalThreads / TPB;
  log('info', `=== BS=${bs}: TPB=${TPB} num_threads=${totalThreads} num_WGs=${numWgs}`);

  const code = sm.gen_ba_rev_packed_carry_bench_shader(TPB, bs);
  const cacheKey = `bench-ba-rev-packed-carry-T${TPB}-S${bs}`;
  log('info', `compiling shader (${code.length} chars)`);
  (window as unknown as Record<string, unknown>)[`__shader_bs${bs}`] = code;
  const { pipeline, layout } = await createPipeline(device, code, cacheKey);

  const fieldBytes = 32; // 8 x u32 = 2 vec4
  const bufBytes = TOTAL_PAIRS * fieldBytes;

  const pxAB = new ArrayBuffer(bufBytes);
  const pyAB = new ArrayBuffer(bufBytes);
  const qxAB = new ArrayBuffer(bufBytes);
  const qyAB = new ArrayBuffer(bufBytes);

  const px32 = new Uint32Array(pxAB);
  const py32 = new Uint32Array(pyAB);
  const qx32 = new Uint32Array(qxAB);
  const qy32 = new Uint32Array(qyAB);

  for (let i = 0; i < TOTAL_PAIRS; i++) {
    const { p: pp, q: qq } = pairs[i];
    const pxM = (pp.x * R) % p;
    const pyM = (pp.y * R) % p;
    const qxM = (qq.x * R) % p;
    const qyM = (qq.y * R) % p;
    px32.set(biToLe32u32(pxM), i * 8);
    py32.set(biToLe32u32(pyM), i * 8);
    qx32.set(biToLe32u32(qxM), i * 8);
    qy32.set(biToLe32u32(qyM), i * 8);
  }

  const mkSb = (size: number, copyDst: boolean, copySrc: boolean): GPUBuffer => {
    let usage = GPUBufferUsage.STORAGE;
    if (copyDst) usage |= GPUBufferUsage.COPY_DST;
    if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
    return device.createBuffer({ size, usage });
  };

  const pxBuf = mkSb(bufBytes, true, false);
  const pyBuf = mkSb(bufBytes, true, false);
  const qxBuf = mkSb(bufBytes, true, false);
  const qyBuf = mkSb(bufBytes, true, false);
  const oxBuf = mkSb(bufBytes, false, true);
  const oyBuf = mkSb(bufBytes, false, true);

  device.queue.writeBuffer(pxBuf, 0, pxAB);
  device.queue.writeBuffer(pyBuf, 0, pyAB);
  device.queue.writeBuffer(qxBuf, 0, qxAB);
  device.queue.writeBuffer(qyBuf, 0, qyAB);

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: pxBuf } },
      { binding: 1, resource: { buffer: pyBuf } },
      { binding: 2, resource: { buffer: qxBuf } },
      { binding: 3, resource: { buffer: qyBuf } },
      { binding: 4, resource: { buffer: oxBuf } },
      { binding: 5, resource: { buffer: oyBuf } },
    ],
  });

  const dispatch = async (): Promise<number> => {
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

  await dispatch();
  log('info', 'warmup dispatch returned');

  let correctness: 'pass' | 'fail' | 'skipped' = 'skipped';
  let correctness_first_fail: PerSizeResult['correctness_first_fail'];

  if (!SKIP_CORRECTNESS) {
    const stagingX = device.createBuffer({
      size: bufBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const stagingY = device.createBuffer({
      size: bufBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(oxBuf, 0, stagingX, 0, bufBytes);
    enc.copyBufferToBuffer(oyBuf, 0, stagingY, 0, bufBytes);
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
    samples.push(await dispatch());
  }
  const med = median(samples);
  const mn = Math.min(...samples);
  const mx = Math.max(...samples);
  const nsPerPair = (med * 1e6) / TOTAL_PAIRS;

  log(
    correctness === 'fail' ? 'err' : 'ok',
    `BS=${bs}: median=${med.toFixed(3)}ms min=${mn.toFixed(3)}ms max=${mx.toFixed(3)}ms ns/pair=${nsPerPair.toFixed(1)} correctness=${correctness}`,
  );

  pxBuf.destroy();
  pyBuf.destroy();
  qxBuf.destroy();
  qyBuf.destroy();
  oxBuf.destroy();
  oyBuf.destroy();

  return {
    bs,
    tpb: TPB,
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
  const tpbStr = qp.get('tpb');
  if (tpbStr !== null) {
    const tpb = parseInt(tpbStr, 10);
    if (!Number.isFinite(tpb) || tpb <= 0 || tpb > 1024) {
      throw new Error(`?tpb must be in (0, 1024], got ${tpbStr}`);
    }
    TPB = tpb;
  }
  const bsStr = qp.get('bs');
  if (bsStr !== null) {
    const list = bsStr.split(',').map(s => parseInt(s, 10));
    for (const s of list) {
      if (!Number.isFinite(s) || s <= 0 || s > 64) {
        throw new Error(`?bs entries must be in (0, 64], got ${s}`);
      }
    }
    BS_SWEEP = list;
  }
  for (const s of BS_SWEEP) {
    if (TOTAL_PAIRS % (TPB * s) !== 0) {
      throw new Error(`BS=${s} with TPB=${TPB} does not divide TOTAL_PAIRS=${TOTAL_PAIRS}`);
    }
  }
  if (qp.get('skip_correctness') === '1') {
    SKIP_CORRECTNESS = true;
  }
  return { reps, total: TOTAL_PAIRS, tpb: TPB, bs_sweep: BS_SWEEP, skip_correctness: SKIP_CORRECTNESS };
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
      `params: reps=${params.reps} total=${params.total} tpb=${params.tpb} bs=[${params.bs_sweep.join(',')}] skip_correctness=${params.skip_correctness}`,
    );

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

    for (const bs of BS_SWEEP) {
      try {
        const r = await runOne(device, sm, bs, params.reps, R, p, pairs);
        benchState.results.push(r);
        resultsClient.postProgress({ kind: 'batch_done', bs, median_ms: r.median_ms, ns_per_pair: r.ns_per_pair, correctness: r.correctness });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('err', `BS=${bs} failed: ${msg} — STOPPING sweep at first failure`);
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
