/// <reference types="@webgpu/types" />
// End-to-end correctness oracle for the v2 bin-packed pair-tree
// bucket-accumulate pipeline. Feeds REAL BN254 affine points (random
// scalar * G, via @noble/curves) into the pair-tree and verifies that
// the per-bucket reduced sum matches a noble-projective reference.
//
// This is the test fused_revcarry never had: a ground-truth oracle on
// real curve data. If this passes, the v2 pair-tree's bucket-accumulate
// math (disjoint pair-sum + suffix-product single-fr_inv + lean affine
// add) is correct end-to-end on real BN254 points.
//
// Scope: validates the round kernel + planner only. BPR / horner /
// finalize are NOT part of v2 yet — they're step 3+ of the rewrite plan.
// This oracle stops at "per-bucket sum is correct".
//
// Sizing: tiny by design — N=256 points, B=32 buckets, single window
// (no signed slicing). Each bucket gets ~8 points; the pair-tree
// reduces in ~4 levels.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD, modInverse } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';
import { bn254 } from '@noble/curves/bn254';

const PG = 2;
let NPTS = 256;
let BUCKETS = 32;
let S = 16;
let WGI = 64;
let SEED = 0xa110ce;

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

function makeSoABuf(device: GPUDevice, M: number, copyDst: boolean, copySrc: boolean): GPUBuffer {
  const bytes = 2 * PG * M * 4 * 4;
  let usage = GPUBufferUsage.STORAGE;
  if (copyDst) usage |= GPUBufferUsage.COPY_DST;
  if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
  return device.createBuffer({ size: bytes, usage });
}

interface CurvePoint {
  x: bigint;
  y: bigint;
}

function buildL0WithRealPoints(
  N: number,
  B: number,
  R: bigint,
  p: bigint,
  rng: () => number,
): {
  initBuf: Uint32Array;
  initCounts: Uint32Array;
  initOffsets: Uint32Array;
  M: number;
  points: CurvePoint[];
  bucket: Uint32Array;
} {
  const M = N + 2;
  const buf = new Uint32Array(2 * PG * M * 4);
  const G1 = bn254.G1.ProjectivePoint;
  const order = bn254.fields.Fr.ORDER;

  const points: CurvePoint[] = [];
  const xWords = new Uint32Array(8 * M);
  const yWords = new Uint32Array(8 * M);

  for (let i = 0; i < N; i++) {
    let k = 0n;
    for (let w = 0; w < 8; w++) k = (k << 32n) | BigInt(rng() >>> 0);
    k = k % order;
    if (k === 0n) k = 1n;
    const aff = G1.BASE.multiply(k).toAffine();
    points.push({ x: aff.x, y: aff.y });
    const xMont = (aff.x * R) % p;
    const yMont = (aff.y * R) % p;
    xWords.set(bigintToPackedU32x8(xMont), 8 * i);
    yWords.set(bigintToPackedU32x8(yMont), 8 * i);
  }

  for (let pad = 0; pad < 2; pad++) {
    const i = N + pad;
    let xCand: bigint;
    do {
      xCand = 0n;
      for (let w = 0; w < 8; w++) xCand = (xCand << 32n) | BigInt(rng() >>> 0);
      xCand = xCand % p;
    } while (xCand === 0n);
    const yCand = ((xCand + 1n + BigInt(pad)) * 7n) % p;
    const xMont = (xCand * R) % p;
    const yMont = (yCand * R) % p;
    xWords.set(bigintToPackedU32x8(xMont), 8 * i);
    yWords.set(bigintToPackedU32x8(yMont), 8 * i);
  }

  const bucket = new Uint32Array(N);
  const counts = new Uint32Array(B);
  for (let i = 0; i < N; i++) {
    const hi = (rng() >>> 16) & 0xffff;
    const lo = (rng() >>> 16) & 0xffff;
    const v = hi * 0x10000 + lo;
    const b = v % B;
    bucket[i] = b;
    counts[b]++;
  }
  const offsets = new Uint32Array(B + 1);
  for (let b = 0; b < B; b++) offsets[b + 1] = offsets[b] + counts[b];

  const cursor = new Uint32Array(B);
  const writeElem = (planeIdx: number, dstIdx: number, words: Uint32Array, srcOff: number) => {
    const planeBase = planeIdx * PG * M;
    for (let v = 0; v < PG; v++) {
      const base = (planeBase + PG * dstIdx + v) * 4;
      buf[base + 0] = words[srcOff + 4 * v + 0];
      buf[base + 1] = words[srcOff + 4 * v + 1];
      buf[base + 2] = words[srcOff + 4 * v + 2];
      buf[base + 3] = words[srcOff + 4 * v + 3];
    }
  };
  for (let i = 0; i < N; i++) {
    const b = bucket[i];
    const dst = offsets[b] + cursor[b]++;
    writeElem(0, dst, xWords, 8 * i);
    writeElem(1, dst, yWords, 8 * i);
  }
  writeElem(0, M - 2, xWords, 8 * (M - 2));
  writeElem(1, M - 2, yWords, 8 * (M - 2));
  writeElem(0, M - 1, xWords, 8 * (M - 1));
  writeElem(1, M - 1, yWords, 8 * (M - 1));

  return { initBuf: buf, initCounts: counts, initOffsets: offsets, M, points, bucket };
}

function buildLevelPlan(
  counts: Uint32Array,
  offsets: Uint32Array,
  s: number,
  padLIdx: number,
  padRIdx: number,
  discardIdx: number,
) {
  const B = counts.length;
  let totalPairs = 0;
  let totalCarries = 0;
  const newCounts = new Uint32Array(B);
  for (let b = 0; b < B; b++) {
    const n = counts[b];
    const p = Math.floor(n / 2);
    const c = n & 1;
    totalPairs += p;
    totalCarries += c;
    newCounts[b] = p + c;
  }
  const newOffsets = new Uint32Array(B + 1);
  for (let b = 0; b < B; b++) newOffsets[b + 1] = newOffsets[b] + newCounts[b];

  const numChunks = Math.max(1, Math.ceil(totalPairs / s));
  const chunkPlan = new Uint32Array(2 * s * numChunks);
  const scatterPlan = new Uint32Array(s * numChunks);
  const carryPlan = new Uint32Array(2 * Math.max(1, totalCarries));

  for (let i = 0; i < numChunks * s; i++) {
    chunkPlan[2 * i + 0] = padLIdx;
    chunkPlan[2 * i + 1] = padRIdx;
    scatterPlan[i] = discardIdx;
  }

  let slot = 0;
  let carryIdx = 0;
  for (let b = 0; b < B; b++) {
    const n = counts[b];
    const p = Math.floor(n / 2);
    for (let j = 0; j < p; j++) {
      chunkPlan[2 * slot + 0] = offsets[b] + 2 * j;
      chunkPlan[2 * slot + 1] = offsets[b] + 2 * j + 1;
      scatterPlan[slot] = newOffsets[b] + j;
      slot++;
    }
    if (n & 1) {
      carryPlan[2 * carryIdx + 0] = offsets[b] + n - 1;
      carryPlan[2 * carryIdx + 1] = newOffsets[b] + p;
      carryIdx++;
    }
  }
  return { chunkPlan, scatterPlan, carryPlan, newCounts, newOffsets, numChunks, numCarries: totalCarries, totalPairs };
}

interface BucketCheck {
  bucket: number;
  count: number;
  gpu_x: string;
  gpu_y: string;
  ref_x: string;
  ref_y: string;
  ok: boolean;
}

interface OracleResult {
  n: number;
  buckets: number;
  s: number;
  wgi: number;
  levels: number;
  total_pair_adds: number;
  buckets_checked: number;
  buckets_passed: number;
  first_mismatches: BucketCheck[];
  all_passed: boolean;
  gpu_wall_ms: number;
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
const resultsClient = makeResultsClient({ page: 'bench-msm-oracle' });
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
  console.log(`[bench-msm-oracle] ${msg}`);
}

async function compileOne(device: GPUDevice, code: string, key: string, layout: GPUBindGroupLayout): Promise<GPUComputePipeline> {
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

function ioLayout4(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
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
  log('info', `=== N=${NPTS} B=${BUCKETS} S=${S} WGI=${WGI}`);
  const rng = makeRng(SEED);
  const { initBuf, initCounts, initOffsets, M, points, bucket } = buildL0WithRealPoints(NPTS, BUCKETS, R, p, rng);

  let cMin = NPTS, cMax = 0, cZero = 0;
  for (let b = 0; b < BUCKETS; b++) {
    if (initCounts[b] > cMax) cMax = initCounts[b];
    if (initCounts[b] < cMin) cMin = initCounts[b];
    if (initCounts[b] === 0) cZero++;
  }
  log('info', `built L0: M=${M} bucket counts min=${cMin} max=${cMax} zero=${cZero}/${BUCKETS}`);

  const padLIdx = M - 2;
  const padRIdx = M - 1;
  const discardIdx = M - 2;

  const bufA = makeSoABuf(device, M, true, true);
  const bufB = makeSoABuf(device, M, true, true);
  device.queue.writeBuffer(bufA, 0, initBuf);
  device.queue.writeBuffer(bufB, 0, initBuf);

  const maxL0Chunks = Math.ceil(NPTS / 2 / S) + 1;
  const chainBuf = makeSoABuf(device, 2 * S * maxL0Chunks, false, false);
  const tempOutBuf = makeSoABuf(device, S * maxL0Chunks, false, true);

  const layoutMarshal = ioLayout4(device);
  const layoutDisjoint = ioLayout4(device);
  const layoutScatter = ioLayout4(device);
  const layoutCarry = ioLayout4(device);
  const marshalPipe = await compileOne(device, sm.gen_ba_marshal_pairs_bench_shader(WGI, S), `marshal-W${WGI}-S${S}`, layoutMarshal);
  const disjointPipe = await compileOne(device, sm.gen_ba_pair_disjoint_tree_bench_shader(WGI, S), `disjoint-W${WGI}-S${S}`, layoutDisjoint);
  const scatterPipe = await compileOne(device, sm.gen_ba_scatter_pairs_bench_shader(WGI, S), `scatter-W${WGI}-S${S}`, layoutScatter);
  const carryPipe = await compileOne(device, sm.gen_ba_carry_copy_bench_shader(WGI), `carry-W${WGI}`, layoutCarry);
  log('info', '4 pipelines compiled');

  let counts = initCounts;
  let offsets = initOffsets;
  let finalOffsets: Uint32Array = initOffsets;
  let curIn: GPUBuffer = bufA;
  let curOut: GPUBuffer = bufB;
  let totalPairAdds = 0;
  let levelIdx = 0;
  const dummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });

  interface PassSpec { pipeline: GPUComputePipeline; bind: GPUBindGroup; numWgs: number }
  const allPasses: PassSpec[] = [];
  const levelBufHolders: GPUBuffer[] = [];

  for (;;) {
    let maxCount = 0;
    for (let b = 0; b < counts.length; b++) if (counts[b] > maxCount) maxCount = counts[b];
    if (maxCount <= 1) {
      finalOffsets = offsets;
      break;
    }
    if (levelIdx > 24) throw new Error('exceeded safety level cap');

    const plan = buildLevelPlan(counts, offsets, S, padLIdx, padRIdx, discardIdx);
    totalPairAdds += plan.totalPairs;
    const T = plan.numChunks;
    const numWgs = Math.ceil(T / WGI);
    log('info', `L${levelIdx}: T=${T} pairs=${plan.totalPairs} carries=${plan.numCarries} maxCount=${maxCount}`);

    const chunkPlanBuf = device.createBuffer({ size: plan.chunkPlan.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(chunkPlanBuf, 0, plan.chunkPlan);
    const scatterPlanBuf = device.createBuffer({ size: plan.scatterPlan.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(scatterPlanBuf, 0, plan.scatterPlan);
    const carryPlanBuf = device.createBuffer({ size: plan.carryPlan.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(carryPlanBuf, 0, plan.carryPlan);

    const marshalParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(marshalParams, 0, new Uint32Array([T, M, 0, 0]));
    const disjointParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(disjointParams, 0, new Uint32Array([2 * S * T, T, 1, 0]));
    const scatterParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(scatterParams, 0, new Uint32Array([T, M, 0, 0]));
    const carryParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    if (plan.numCarries > 0) {
      device.queue.writeBuffer(carryParams, 0, new Uint32Array([plan.numCarries, M, M, 0]));
    }

    const marshalBind = device.createBindGroup({
      layout: layoutMarshal,
      entries: [
        { binding: 0, resource: { buffer: chunkPlanBuf } },
        { binding: 1, resource: { buffer: curIn } },
        { binding: 2, resource: { buffer: chainBuf } },
        { binding: 3, resource: { buffer: marshalParams } },
      ],
    });
    const disjointBind = device.createBindGroup({
      layout: layoutDisjoint,
      entries: [
        { binding: 0, resource: { buffer: chainBuf } },
        { binding: 1, resource: { buffer: dummy } },
        { binding: 2, resource: { buffer: tempOutBuf } },
        { binding: 3, resource: { buffer: disjointParams } },
      ],
    });
    const scatterBind = device.createBindGroup({
      layout: layoutScatter,
      entries: [
        { binding: 0, resource: { buffer: scatterPlanBuf } },
        { binding: 1, resource: { buffer: tempOutBuf } },
        { binding: 2, resource: { buffer: curOut } },
        { binding: 3, resource: { buffer: scatterParams } },
      ],
    });
    let carryBind: GPUBindGroup | null = null;
    if (plan.numCarries > 0) {
      carryBind = device.createBindGroup({
        layout: layoutCarry,
        entries: [
          { binding: 0, resource: { buffer: carryPlanBuf } },
          { binding: 1, resource: { buffer: curIn } },
          { binding: 2, resource: { buffer: curOut } },
          { binding: 3, resource: { buffer: carryParams } },
        ],
      });
    }

    allPasses.push({ pipeline: marshalPipe, bind: marshalBind, numWgs });
    allPasses.push({ pipeline: disjointPipe, bind: disjointBind, numWgs });
    allPasses.push({ pipeline: scatterPipe, bind: scatterBind, numWgs });
    if (plan.numCarries > 0 && carryBind) {
      const carryWgs = Math.ceil(plan.numCarries / WGI);
      allPasses.push({ pipeline: carryPipe, bind: carryBind, numWgs: carryWgs });
    }
    levelBufHolders.push(chunkPlanBuf, scatterPlanBuf, carryPlanBuf, marshalParams, disjointParams, scatterParams, carryParams);

    counts = plan.newCounts;
    offsets = plan.newOffsets;
    [curIn, curOut] = [curOut, curIn];
    levelIdx++;
  }

  const enc = device.createCommandEncoder();
  for (const ps of allPasses) {
    const pass = enc.beginComputePass();
    pass.setPipeline(ps.pipeline);
    pass.setBindGroup(0, ps.bind);
    pass.dispatchWorkgroups(ps.numWgs, 1, 1);
    pass.end();
  }
  const t0 = performance.now();
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  const gpuWall = performance.now() - t0;
  log('info', `batched ${allPasses.length} passes in one submit: ${gpuWall.toFixed(2)} ms`);

  const result = await readbackU32(device, curIn, 2 * PG * M * 4 * 4);

  bufA.destroy();
  bufB.destroy();
  chainBuf.destroy();
  tempOutBuf.destroy();
  dummy.destroy();
  for (const b of levelBufHolders) b.destroy();

  const decodeAt = (slot: number): { x_mont: bigint; y_mont: bigint } => {
    const xWords = new Uint32Array(8);
    const yWords = new Uint32Array(8);
    const planeBaseX = 0 * PG * M;
    const planeBaseY = 1 * PG * M;
    for (let v = 0; v < PG; v++) {
      const baseX = (planeBaseX + PG * slot + v) * 4;
      const baseY = (planeBaseY + PG * slot + v) * 4;
      xWords[4 * v + 0] = result[baseX + 0];
      xWords[4 * v + 1] = result[baseX + 1];
      xWords[4 * v + 2] = result[baseX + 2];
      xWords[4 * v + 3] = result[baseX + 3];
      yWords[4 * v + 0] = result[baseY + 0];
      yWords[4 * v + 1] = result[baseY + 1];
      yWords[4 * v + 2] = result[baseY + 2];
      yWords[4 * v + 3] = result[baseY + 3];
    }
    const x_mont = packedU32x8ToBigint(xWords, 0);
    const y_mont = packedU32x8ToBigint(yWords, 0);
    return { x_mont, y_mont };
  };

  const G1 = bn254.G1.ProjectivePoint;
  const refSumPerBucket = new Map<number, { x: bigint; y: bigint } | null>();
  for (let b = 0; b < BUCKETS; b++) {
    if (initCounts[b] === 0) continue;
    let acc = G1.ZERO;
    for (let i = 0; i < NPTS; i++) {
      if (bucket[i] !== b) continue;
      acc = acc.add(G1.fromAffine({ x: points[i].x, y: points[i].y }));
    }
    refSumPerBucket.set(b, acc.is0() ? null : acc.toAffine());
  }

  const checks: BucketCheck[] = [];
  const mismatches: BucketCheck[] = [];
  let passCount = 0;
  for (let b = 0; b < BUCKETS; b++) {
    if (initCounts[b] === 0) continue;
    const slot = finalOffsets[b];
    const { x_mont, y_mont } = decodeAt(slot);
    const gx = (x_mont * Rinv) % p;
    const gy = (y_mont * Rinv) % p;
    const ref = refSumPerBucket.get(b);
    let ok = false;
    if (ref === null) {
      ok = gx === 0n && gy === 0n;
    } else if (ref) {
      ok = gx === ref.x && gy === ref.y;
    }
    const entry: BucketCheck = {
      bucket: b,
      count: initCounts[b],
      gpu_x: gx.toString(16),
      gpu_y: gy.toString(16),
      ref_x: ref ? ref.x.toString(16) : 'INF',
      ref_y: ref ? ref.y.toString(16) : 'INF',
      ok,
    };
    checks.push(entry);
    if (ok) passCount++;
    else if (mismatches.length < 8) mismatches.push(entry);
  }
  const allPassed = mismatches.length === 0 && passCount === checks.length;

  if (allPassed) {
    log('ok', `oracle PASS — ${passCount}/${checks.length} buckets match noble reference`);
  } else {
    log('err', `oracle FAIL — ${checks.length - passCount}/${checks.length} buckets diverged (showing first ${mismatches.length})`);
    for (const m of mismatches) {
      log('err', `  bucket ${m.bucket} (count=${m.count})`);
      log('err', `    gpu: x=${m.gpu_x} y=${m.gpu_y}`);
      log('err', `    ref: x=${m.ref_x} y=${m.ref_y}`);
    }
  }

  return {
    n: NPTS,
    buckets: BUCKETS,
    s: S,
    wgi: WGI,
    levels: levelIdx,
    total_pair_adds: totalPairAdds,
    buckets_checked: checks.length,
    buckets_passed: passCount,
    first_mismatches: mismatches,
    all_passed: allPassed,
    gpu_wall_ms: gpuWall,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('n')) NPTS = parseInt(qp.get('n')!, 10);
  if (qp.get('buckets')) BUCKETS = parseInt(qp.get('buckets')!, 10);
  if (qp.get('s')) S = parseInt(qp.get('s')!, 10);
  if (qp.get('wgi')) WGI = parseInt(qp.get('wgi')!, 10);
  if (qp.get('seed')) SEED = parseInt(qp.get('seed')!, 10);
  return { n: NPTS, buckets: BUCKETS, s: S, wgi: WGI, seed: SEED };
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
    const sm = new ShaderManager(1, BUCKETS, BN254_CURVE_CONFIG, false);
    const r = await runOracle(device, sm, R, Rinv, p);
    benchState.results.push(r);
    resultsClient.postProgress({
      kind: 'oracle_done',
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
