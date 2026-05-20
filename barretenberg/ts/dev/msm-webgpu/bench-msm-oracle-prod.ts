/// <reference types="@webgpu/types" />
// End-to-end correctness oracle for the prod v2 pair-tree orchestrator.
//
// Wraps runSmvpV2PairTree (cuzk/smvp_v2_pair_tree.ts) with a noble-CPU
// cross-check on real BN254 affine points. Validates the full prod
// path: csr_to_v2_meta + csr_to_v2_active_sums + planner_v2_prod +
// marshal_prod + disjoint_prod + scatter_prod + carry_prod +
// v2_to_running, with indirect dispatch driven by the planner's
// per-level totals.
//
// Sizing: small by design (num_subtasks=1, num_columns=32, N=256) so
// noble's projective bucket sum runs instantly in the browser. Each
// bucket gets ~8 points; pair-tree needs ~4 levels.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD, modInverse } from '../../src/msm_webgpu/cuzk/bn254.js';
import { runSmvpV2PairTree } from '../../src/msm_webgpu/cuzk/smvp_v2_pair_tree.js';
import { makeResultsClient } from './results_post.js';
import { bn254 } from '@noble/curves/bn254';

let NUM_SUBTASKS = 1;
let NUM_COLUMNS = 32;
let INPUT_SIZE = 256;
let S = 16;
let WGI = 64;
let TPB = 64;
let PER_THREAD = 1;
let MAX_LEVELS = 8;
let SEED = 0xc0de;

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
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

function packedU32x8ToBigint(w: Uint32Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 32n) | BigInt(w[off + i] >>> 0);
  return v;
}

interface OracleResult {
  num_subtasks: number;
  num_columns: number;
  input_size: number;
  s: number;
  wgi: number;
  tpb: number;
  per_thread: number;
  max_levels: number;
  total_passes: number;
  gpu_wall_ms: number;
  buckets_checked: number;
  buckets_passed: number;
  first_mismatches: Array<{ subtask: number; bucket: number; count: number; gpu_x: string; gpu_y: string; ref_x: string; ref_y: string; ok: boolean }>;
  all_passed: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: Record<string, unknown> | null;
  results: OracleResult[];
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: [], error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;
const resultsClient = makeResultsClient({ page: 'bench-msm-oracle-prod' });
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
  console.log(`[bench-msm-oracle-prod] ${msg}`);
}

async function readbackU32(device: GPUDevice, buf: GPUBuffer, bytes: number): Promise<Uint32Array> {
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await staging.mapAsync(GPUMapMode.READ);
  const out = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return out;
}

async function runOracle(device: GPUDevice, sm: ShaderManager, R: bigint, Rinv: bigint, p: bigint): Promise<OracleResult> {
  log('info', `=== T=${NUM_SUBTASKS} B=${NUM_COLUMNS} N=${INPUT_SIZE} S=${S} WGI=${WGI} TPB=${TPB} PER=${PER_THREAD} MAX_LEVELS=${MAX_LEVELS}`);
  const rng = makeRng(SEED);
  const G1 = bn254.G1.ProjectivePoint;
  const order = bn254.fields.Fr.ORDER;

  const points: Array<{ x: bigint; y: bigint }> = [];
  const pointXWords = new Uint32Array(INPUT_SIZE * 8);
  const pointYWords = new Uint32Array(INPUT_SIZE * 8);
  for (let i = 0; i < INPUT_SIZE; i++) {
    let k = 0n;
    for (let w = 0; w < 8; w++) k = (k << 32n) | BigInt(rng() >>> 0);
    k = k % order;
    if (k === 0n) k = 1n;
    const aff = G1.BASE.multiply(k).toAffine();
    points.push({ x: aff.x, y: aff.y });
    pointXWords.set(bigintToPackedU32x8((aff.x * R) % p), 8 * i);
    pointYWords.set(bigintToPackedU32x8((aff.y * R) % p), 8 * i);
  }
  log('info', `generated ${INPUT_SIZE} BN254 affine points`);

  const valIdxArr = new Uint32Array(NUM_SUBTASKS * INPUT_SIZE);
  const rowPtrArr = new Uint32Array(NUM_SUBTASKS * (NUM_COLUMNS + 1));
  const bucketOf: Uint32Array[] = [];
  for (let st = 0; st < NUM_SUBTASKS; st++) {
    const bucket = new Uint32Array(INPUT_SIZE);
    const counts = new Uint32Array(NUM_COLUMNS);
    for (let i = 0; i < INPUT_SIZE; i++) {
      const hi = (rng() >>> 16) & 0xffff;
      const lo = (rng() >>> 16) & 0xffff;
      const v = hi * 0x10000 + lo;
      const b = v % NUM_COLUMNS;
      bucket[i] = b;
      counts[b]++;
    }
    bucketOf.push(bucket);
    const offsets = new Uint32Array(NUM_COLUMNS + 1);
    for (let b = 0; b < NUM_COLUMNS; b++) offsets[b + 1] = offsets[b] + counts[b];
    const cursor = new Uint32Array(NUM_COLUMNS);
    for (let i = 0; i < INPUT_SIZE; i++) {
      const b = bucket[i];
      const slot = offsets[b] + cursor[b]++;
      valIdxArr[st * INPUT_SIZE + slot] = i;
    }
    const rpBase = st * (NUM_COLUMNS + 1);
    for (let b = 0; b <= NUM_COLUMNS; b++) rowPtrArr[rpBase + b] = offsets[b];
  }
  log('info', `built synthetic CSR for ${NUM_SUBTASKS} window(s)`);

  const mk = (bytes: number, extra: GPUBufferUsageFlags = 0): GPUBuffer =>
    device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | extra });
  const val_idx_buf = mk(valIdxArr.byteLength, GPUBufferUsage.COPY_DST);
  const row_ptr_buf = mk(rowPtrArr.byteLength, GPUBufferUsage.COPY_DST);
  const point_x_buf = mk(INPUT_SIZE * 32, GPUBufferUsage.COPY_DST);
  const point_y_buf = mk(INPUT_SIZE * 32, GPUBufferUsage.COPY_DST);
  const running_x_buf = mk(NUM_SUBTASKS * NUM_COLUMNS * 32, GPUBufferUsage.COPY_SRC);
  const running_y_buf = mk(NUM_SUBTASKS * NUM_COLUMNS * 32, GPUBufferUsage.COPY_SRC);
  const bucket_active_buf = mk(NUM_SUBTASKS * NUM_COLUMNS * 4, GPUBufferUsage.COPY_SRC);

  device.queue.writeBuffer(val_idx_buf, 0, valIdxArr as BufferSource);
  device.queue.writeBuffer(row_ptr_buf, 0, rowPtrArr as BufferSource);
  device.queue.writeBuffer(point_x_buf, 0, pointXWords as BufferSource);
  device.queue.writeBuffer(point_y_buf, 0, pointYWords as BufferSource);

  const stats = await runSmvpV2PairTree({
    device,
    shaderManager: sm,
    num_subtasks: NUM_SUBTASKS,
    num_columns: NUM_COLUMNS,
    input_size: INPUT_SIZE,
    s: S,
    tpb: TPB,
    per_thread: PER_THREAD,
    wgi: WGI,
    max_levels: MAX_LEVELS,
    val_idx_buf, row_ptr_buf, point_x_buf, point_y_buf,
    running_x_buf, running_y_buf, bucket_active_buf,
  });
  log('info', `runSmvpV2PairTree returned: ${JSON.stringify(stats)}`);

  const runningXWords = await readbackU32(device, running_x_buf, NUM_SUBTASKS * NUM_COLUMNS * 32);
  const runningYWords = await readbackU32(device, running_y_buf, NUM_SUBTASKS * NUM_COLUMNS * 32);
  const bucketActive = await readbackU32(device, bucket_active_buf, NUM_SUBTASKS * NUM_COLUMNS * 4);

  const refSumPerBucket = new Map<number, { x: bigint; y: bigint } | null>();
  for (let st = 0; st < NUM_SUBTASKS; st++) {
    const bucket = bucketOf[st];
    for (let b = 0; b < NUM_COLUMNS; b++) {
      let acc = G1.ZERO;
      let count = 0;
      for (let i = 0; i < INPUT_SIZE; i++) {
        if (bucket[i] !== b) continue;
        acc = acc.add(G1.fromAffine({ x: points[i].x, y: points[i].y }));
        count++;
      }
      const bucket_global = st * NUM_COLUMNS + b;
      refSumPerBucket.set(bucket_global, count === 0 ? null : (acc.is0() ? null : acc.toAffine()));
    }
  }

  const checks: OracleResult['first_mismatches'] = [];
  const mismatches: OracleResult['first_mismatches'] = [];
  let passCount = 0;
  for (let st = 0; st < NUM_SUBTASKS; st++) {
    const bucket = bucketOf[st];
    const counts = new Uint32Array(NUM_COLUMNS);
    for (let i = 0; i < INPUT_SIZE; i++) counts[bucket[i]]++;
    for (let b = 0; b < NUM_COLUMNS; b++) {
      const bucket_global = st * NUM_COLUMNS + b;
      const ref = refSumPerBucket.get(bucket_global) ?? null;
      const active = bucketActive[bucket_global];
      if (counts[b] === 0) {
        if (active !== 0) mismatches.push({ subtask: st, bucket: b, count: 0, gpu_x: 'active=1', gpu_y: '', ref_x: 'empty', ref_y: '', ok: false });
        continue;
      }
      if (active === 0) {
        mismatches.push({ subtask: st, bucket: b, count: counts[b], gpu_x: 'active=0', gpu_y: '', ref_x: ref ? ref.x.toString(16) : 'INF', ref_y: ref ? ref.y.toString(16) : 'INF', ok: false });
        continue;
      }
      const xMont = packedU32x8ToBigint(runningXWords, bucket_global * 8);
      const yMont = packedU32x8ToBigint(runningYWords, bucket_global * 8);
      const gx = (xMont * Rinv) % p;
      const gy = (yMont * Rinv) % p;
      const ok = ref !== null && gx === ref.x && gy === ref.y;
      const entry = { subtask: st, bucket: b, count: counts[b], gpu_x: gx.toString(16), gpu_y: gy.toString(16), ref_x: ref ? ref.x.toString(16) : 'INF', ref_y: ref ? ref.y.toString(16) : 'INF', ok };
      checks.push(entry);
      if (ok) passCount++;
      else if (mismatches.length < 8) mismatches.push(entry);
    }
  }
  const allPassed = mismatches.length === 0;

  if (allPassed) {
    log('ok', `oracle PASS — ${passCount}/${checks.length} buckets match noble reference (prod orchestrator)`);
  } else {
    log('err', `oracle FAIL — ${mismatches.length} mismatches in first ${checks.length} buckets`);
    for (const m of mismatches.slice(0, 8)) {
      log('err', `  subtask=${m.subtask} bucket=${m.bucket} count=${m.count}`);
      log('err', `    gpu: x=${m.gpu_x} y=${m.gpu_y}`);
      log('err', `    ref: x=${m.ref_x} y=${m.ref_y}`);
    }
  }

  val_idx_buf.destroy();
  row_ptr_buf.destroy();
  point_x_buf.destroy();
  point_y_buf.destroy();
  running_x_buf.destroy();
  running_y_buf.destroy();
  bucket_active_buf.destroy();

  return {
    num_subtasks: NUM_SUBTASKS,
    num_columns: NUM_COLUMNS,
    input_size: INPUT_SIZE,
    s: S,
    wgi: WGI,
    tpb: TPB,
    per_thread: PER_THREAD,
    max_levels: MAX_LEVELS,
    total_passes: stats.total_passes,
    gpu_wall_ms: stats.gpu_wall_ms,
    buckets_checked: checks.length,
    buckets_passed: passCount,
    first_mismatches: mismatches,
    all_passed: allPassed,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('subtasks')) NUM_SUBTASKS = parseInt(qp.get('subtasks')!, 10);
  if (qp.get('columns')) NUM_COLUMNS = parseInt(qp.get('columns')!, 10);
  if (qp.get('input')) INPUT_SIZE = parseInt(qp.get('input')!, 10);
  if (qp.get('s')) S = parseInt(qp.get('s')!, 10);
  if (qp.get('wgi')) WGI = parseInt(qp.get('wgi')!, 10);
  if (qp.get('tpb')) TPB = parseInt(qp.get('tpb')!, 10);
  if (qp.get('per')) PER_THREAD = parseInt(qp.get('per')!, 10);
  if (qp.get('lvls')) MAX_LEVELS = parseInt(qp.get('lvls')!, 10);
  if (qp.get('seed')) SEED = parseInt(qp.get('seed')!, 10);
  return { subtasks: NUM_SUBTASKS, columns: NUM_COLUMNS, input: INPUT_SIZE, s: S, wgi: WGI, tpb: TPB, per_thread: PER_THREAD, max_levels: MAX_LEVELS, seed: SEED };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const params = parseParams();
    benchState.params = params;
    log('info', `params: ${JSON.stringify(params)}`);
    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');
    const p = BN254_BASE_FIELD;
    const miscParams = compute_misc_params(p, 13);
    const R = miscParams.r;
    const Rinv = modInverse(R, p);
    const sm = new ShaderManager(NUM_SUBTASKS, NUM_COLUMNS, BN254_CURVE_CONFIG, false);
    const r = await runOracle(device, sm, R, Rinv, p);
    benchState.results.push(r);
    resultsClient.postProgress({
      kind: 'oracle_prod_done',
      all_passed: r.all_passed,
      buckets_passed: r.buckets_passed,
      buckets_checked: r.buckets_checked,
      gpu_wall_ms: r.gpu_wall_ms,
    });
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
