/// <reference types="@webgpu/types" />
// Standalone microbench + validator for the cuZK CSR -> v2 active_sums
// layout converter. The converter consumes the cuZK transpose output
// (val_idx + row_ptr) and the packed 8xu32 cached bases, and emits the
// bucket-major active_sums + per-bucket counts/offsets that the v2
// pair-tree expects.
//
// Inputs are synthetic — random bucket assignments per (subtask, scalar)
// — so the harness validates the converter in isolation without needing
// the full cuZK convert + decompose + transpose pipeline.
//
// Validation: byte-equivalent compare of active_sums_x/y, active_counts,
// and active_offsets against a host-side reference. The reference is
// trivial: active_sums[k] = new_point[val_idx[k]], counts[b] =
// row_ptr[b+1]-row_ptr[b], offsets[b] = row_ptr[b].
//
// Timing methodology mirrors bench-planner: warmup, then DISP back-to-
// back dispatches in one encoder, divided by DISP for per-call time.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { makeResultsClient } from './results_post.js';

let NUM_SUBTASKS = 16;
let NUM_COLUMNS = 4096;
let INPUT_SIZE = 1 << 14;
let WG = 64;
let DISP = 32;
let REPS = 5;
let VALIDATE = false;
let SEED = 0xc5af;

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function buildSyntheticCsr(
  numSubtasks: number,
  numColumns: number,
  inputSize: number,
  seed: number,
): { rowPtr: Uint32Array; valIdx: Uint32Array } {
  const rng = makeRng(seed);
  const rowPtr = new Uint32Array(numSubtasks * (numColumns + 1));
  const valIdx = new Uint32Array(numSubtasks * inputSize);

  for (let s = 0; s < numSubtasks; s++) {
    const bucketOf = new Uint32Array(inputSize);
    const perBucketCount = new Uint32Array(numColumns);
    for (let i = 0; i < inputSize; i++) {
      const hi = (rng() >>> 16) & 0xffff;
      const lo = (rng() >>> 16) & 0xffff;
      const r = hi * 0x10000 + lo;
      const b = r % numColumns;
      bucketOf[i] = b;
      perBucketCount[b]++;
    }
    const rpBase = s * (numColumns + 1);
    rowPtr[rpBase] = 0;
    for (let b = 0; b < numColumns; b++) {
      rowPtr[rpBase + b + 1] = rowPtr[rpBase + b] + perBucketCount[b];
    }
    const cursor = new Uint32Array(numColumns);
    const viBase = s * inputSize;
    for (let i = 0; i < inputSize; i++) {
      const b = bucketOf[i];
      const slot = rowPtr[rpBase + b] + cursor[b];
      valIdx[viBase + slot] = i;
      cursor[b]++;
    }
  }
  return { rowPtr, valIdx };
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface BenchResult {
  num_subtasks: number;
  num_columns: number;
  input_size: number;
  total_slots: number;
  total_buckets: number;
  wg: number;
  disp: number;
  reps: number;
  active_sums_us: { min: number; median: number; max: number };
  meta_us: { min: number; median: number; max: number };
  combined_us: { min: number; median: number; max: number };
  ns_per_slot_combined: number;
  validated: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: Record<string, unknown> | null;
  results: BenchResult[];
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: [], error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;
const resultsClient = makeResultsClient({ page: 'bench-csr-to-v2' });
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
  console.log(`[bench-csr-to-v2] ${msg}`);
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

async function runOne(device: GPUDevice, sm: ShaderManager): Promise<BenchResult> {
  const totalSlots = NUM_SUBTASKS * INPUT_SIZE;
  const totalBuckets = NUM_SUBTASKS * NUM_COLUMNS;
  log(
    'info',
    `=== T=${NUM_SUBTASKS} columns=${NUM_COLUMNS} input_size=${INPUT_SIZE} ` +
      `total_slots=${totalSlots} total_buckets=${totalBuckets} WG=${WG} DISP=${DISP} REPS=${REPS}`,
  );

  // Synthetic packed bases: 32 bytes per element. Random bytes are fine
  // — the converter is a layout-equivalent byte copy.
  const rng = makeRng(SEED ^ 0xfeed);
  const basesBytes = INPUT_SIZE * 32;
  const basesX = new Uint8Array(basesBytes);
  const basesY = new Uint8Array(basesBytes);
  for (let i = 0; i < basesBytes; i += 4) {
    const v = rng();
    basesX[i] = v & 0xff;
    basesX[i + 1] = (v >>> 8) & 0xff;
    basesX[i + 2] = (v >>> 16) & 0xff;
    basesX[i + 3] = (v >>> 24) & 0xff;
    const w = rng();
    basesY[i] = w & 0xff;
    basesY[i + 1] = (w >>> 8) & 0xff;
    basesY[i + 2] = (w >>> 16) & 0xff;
    basesY[i + 3] = (w >>> 24) & 0xff;
  }
  log('info', `synthetic packed bases: ${(basesBytes * 2 / 1024).toFixed(1)} KiB total`);

  const { rowPtr, valIdx } = buildSyntheticCsr(NUM_SUBTASKS, NUM_COLUMNS, INPUT_SIZE, SEED);
  log('info', `synthetic CSR: rowPtr=${(rowPtr.byteLength / 1024).toFixed(1)} KiB valIdx=${(valIdx.byteLength / 1024).toFixed(1)} KiB`);

  const mk = (bytes: number, copySrc = false, copyDst = false): GPUBuffer => {
    let usage = GPUBufferUsage.STORAGE;
    if (copySrc) usage |= GPUBufferUsage.COPY_SRC;
    if (copyDst) usage |= GPUBufferUsage.COPY_DST;
    return device.createBuffer({ size: bytes, usage });
  };

  const M = totalSlots;
  const activeBytes = 2 * 2 * M * 16;
  const basesXBuf = mk(basesBytes, false, true);
  const basesYBuf = mk(basesBytes, false, true);
  const valIdxBuf = mk(valIdx.byteLength, false, true);
  const rowPtrBuf = mk(rowPtr.byteLength, false, true);
  const activeBuf = mk(activeBytes, true);
  const countsBuf = mk(totalBuckets * 4, true);
  const offsetsBuf = mk(totalBuckets * 4, true);
  device.queue.writeBuffer(basesXBuf, 0, basesX);
  device.queue.writeBuffer(basesYBuf, 0, basesY);
  device.queue.writeBuffer(valIdxBuf, 0, valIdx);
  device.queue.writeBuffer(rowPtrBuf, 0, rowPtr);

  const paramsActiveBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(paramsActiveBuf, 0, new Uint32Array([totalSlots, M, 0, 0]));
  const paramsMetaBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(paramsMetaBuf, 0, new Uint32Array([NUM_COLUMNS, totalBuckets, 0, 0]));

  const activeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const metaLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const activePipeline = await compileOne(device, sm.gen_csr_to_v2_active_sums_shader(WG), `csr-to-v2-active_sums-wg${WG}`, activeLayout);
  const metaPipeline = await compileOne(device, sm.gen_csr_to_v2_meta_shader(WG), `csr-to-v2-meta-wg${WG}`, metaLayout);

  const activeBind = device.createBindGroup({
    layout: activeLayout,
    entries: [
      { binding: 0, resource: { buffer: valIdxBuf } },
      { binding: 1, resource: { buffer: basesXBuf } },
      { binding: 2, resource: { buffer: basesYBuf } },
      { binding: 3, resource: { buffer: activeBuf } },
      { binding: 4, resource: { buffer: paramsActiveBuf } },
    ],
  });
  const metaBind = device.createBindGroup({
    layout: metaLayout,
    entries: [
      { binding: 0, resource: { buffer: rowPtrBuf } },
      { binding: 1, resource: { buffer: countsBuf } },
      { binding: 2, resource: { buffer: offsetsBuf } },
      { binding: 3, resource: { buffer: paramsMetaBuf } },
    ],
  });

  const groupsActive = Math.ceil(totalSlots / WG);
  const groupsMeta = Math.ceil(totalBuckets / WG);
  log('info', `dispatch shape: active=${groupsActive} wgs, meta=${groupsMeta} wgs`);

  // Warmup
  {
    const enc = device.createCommandEncoder();
    let pass = enc.beginComputePass();
    pass.setPipeline(activePipeline);
    pass.setBindGroup(0, activeBind);
    pass.dispatchWorkgroups(groupsActive, 1, 1);
    pass.end();
    pass = enc.beginComputePass();
    pass.setPipeline(metaPipeline);
    pass.setBindGroup(0, metaBind);
    pass.dispatchWorkgroups(groupsMeta, 1, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  log('info', 'warmup done');

  let validated = false;
  if (VALIDATE) {
    const gpuActive = await readbackU32(device, activeBuf, activeBytes);
    const gpuCounts = await readbackU32(device, countsBuf, totalBuckets * 4);
    const gpuOffsets = await readbackU32(device, offsetsBuf, totalBuckets * 4);
    const refBasesX = new Uint32Array(basesX.buffer, basesX.byteOffset, INPUT_SIZE * 8);
    const refBasesY = new Uint32Array(basesY.buffer, basesY.byteOffset, INPUT_SIZE * 8);

    const mismatches: string[] = [];
    let xFails = 0;
    let yFails = 0;
    const planeYU32Off = 2 * 2 * M;
    for (let slot = 0; slot < totalSlots; slot++) {
      const ptIdx = valIdx[slot];
      for (let w = 0; w < 8; w++) {
        const got = gpuActive[slot * 8 + w];
        const want = refBasesX[ptIdx * 8 + w];
        if (got !== want) {
          xFails++;
          if (mismatches.length < 8) mismatches.push(`activeX[slot=${slot} w=${w}]: gpu=${got} ref=${want}`);
        }
        const gotY = gpuActive[planeYU32Off + slot * 8 + w];
        const wantY = refBasesY[ptIdx * 8 + w];
        if (gotY !== wantY) {
          yFails++;
          if (mismatches.length < 8) mismatches.push(`activeY[slot=${slot} w=${w}]: gpu=${gotY} ref=${wantY}`);
        }
      }
    }
    let mFails = 0;
    for (let s = 0; s < NUM_SUBTASKS; s++) {
      const rpBase = s * (NUM_COLUMNS + 1);
      const ccBase = s * NUM_COLUMNS;
      for (let b = 0; b < NUM_COLUMNS; b++) {
        const wantCount = rowPtr[rpBase + b + 1] - rowPtr[rpBase + b];
        const wantOffset = rowPtr[rpBase + b];
        if (gpuCounts[ccBase + b] !== wantCount) {
          mFails++;
          if (mismatches.length < 12) mismatches.push(`counts[s=${s} b=${b}]: gpu=${gpuCounts[ccBase + b]} ref=${wantCount}`);
        }
        if (gpuOffsets[ccBase + b] !== wantOffset) {
          mFails++;
          if (mismatches.length < 12) mismatches.push(`offsets[s=${s} b=${b}]: gpu=${gpuOffsets[ccBase + b]} ref=${wantOffset}`);
        }
      }
    }
    if (xFails === 0 && yFails === 0 && mFails === 0) {
      validated = true;
      log('ok', `validation: PASS — converter output byte-equivalent to host reference (${totalSlots} slots, ${totalBuckets} buckets)`);
    } else {
      log('err', `validation: FAIL — activeX mismatches=${xFails}, activeY=${yFails}, meta=${mFails}`);
      for (const m of mismatches.slice(0, 12)) log('err', `  ${m}`);
    }
  }

  // Timed: DISP back-to-back encoded as one submit per rep, split active vs meta.
  const activeSamples: number[] = [];
  const metaSamples: number[] = [];
  const combinedSamples: number[] = [];
  for (let r = 0; r < REPS; r++) {
    {
      const enc = device.createCommandEncoder();
      for (let d = 0; d < DISP; d++) {
        const pass = enc.beginComputePass();
        pass.setPipeline(activePipeline);
        pass.setBindGroup(0, activeBind);
        pass.dispatchWorkgroups(groupsActive, 1, 1);
        pass.end();
      }
      const t0 = performance.now();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      activeSamples.push(performance.now() - t0);
    }
    {
      const enc = device.createCommandEncoder();
      for (let d = 0; d < DISP; d++) {
        const pass = enc.beginComputePass();
        pass.setPipeline(metaPipeline);
        pass.setBindGroup(0, metaBind);
        pass.dispatchWorkgroups(groupsMeta, 1, 1);
        pass.end();
      }
      const t0 = performance.now();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      metaSamples.push(performance.now() - t0);
    }
    {
      const enc = device.createCommandEncoder();
      for (let d = 0; d < DISP; d++) {
        let pass = enc.beginComputePass();
        pass.setPipeline(activePipeline);
        pass.setBindGroup(0, activeBind);
        pass.dispatchWorkgroups(groupsActive, 1, 1);
        pass.end();
        pass = enc.beginComputePass();
        pass.setPipeline(metaPipeline);
        pass.setBindGroup(0, metaBind);
        pass.dispatchWorkgroups(groupsMeta, 1, 1);
        pass.end();
      }
      const t0 = performance.now();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      combinedSamples.push(performance.now() - t0);
    }
  }
  const stat = (xs: number[]): { min: number; median: number; max: number } => {
    const med = median(xs);
    return { min: (Math.min(...xs) / DISP) * 1000, median: (med / DISP) * 1000, max: (Math.max(...xs) / DISP) * 1000 };
  };
  const activeStats = stat(activeSamples);
  const metaStats = stat(metaSamples);
  const combinedStats = stat(combinedSamples);
  const nsPerSlotCombined = (combinedStats.median * 1000) / totalSlots;
  log(
    'ok',
    `active_sums per-dispatch: median=${activeStats.median.toFixed(2)}μs  min=${activeStats.min.toFixed(2)}μs  max=${activeStats.max.toFixed(2)}μs`,
  );
  log(
    'ok',
    `meta per-dispatch:        median=${metaStats.median.toFixed(2)}μs  min=${metaStats.min.toFixed(2)}μs  max=${metaStats.max.toFixed(2)}μs`,
  );
  log(
    'ok',
    `combined per-dispatch:    median=${combinedStats.median.toFixed(2)}μs  min=${combinedStats.min.toFixed(2)}μs  max=${combinedStats.max.toFixed(2)}μs   ` +
      `→ ${nsPerSlotCombined.toFixed(3)} ns/slot (${totalSlots} slots)`,
  );

  basesXBuf.destroy();
  basesYBuf.destroy();
  valIdxBuf.destroy();
  rowPtrBuf.destroy();
  activeBuf.destroy();
  countsBuf.destroy();
  offsetsBuf.destroy();
  paramsActiveBuf.destroy();
  paramsMetaBuf.destroy();

  return {
    num_subtasks: NUM_SUBTASKS,
    num_columns: NUM_COLUMNS,
    input_size: INPUT_SIZE,
    total_slots: totalSlots,
    total_buckets: totalBuckets,
    wg: WG,
    disp: DISP,
    reps: REPS,
    active_sums_us: activeStats,
    meta_us: metaStats,
    combined_us: combinedStats,
    ns_per_slot_combined: nsPerSlotCombined,
    validated,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('subtasks')) NUM_SUBTASKS = parseInt(qp.get('subtasks')!, 10);
  if (qp.get('columns')) NUM_COLUMNS = parseInt(qp.get('columns')!, 10);
  if (qp.get('input')) INPUT_SIZE = parseInt(qp.get('input')!, 10);
  if (qp.get('wg')) WG = parseInt(qp.get('wg')!, 10);
  if (qp.get('disp')) DISP = parseInt(qp.get('disp')!, 10);
  if (qp.get('reps')) REPS = parseInt(qp.get('reps')!, 10);
  if (qp.get('seed')) SEED = parseInt(qp.get('seed')!, 10);
  if (qp.get('validate') === '1') VALIDATE = true;
  return {
    subtasks: NUM_SUBTASKS,
    columns: NUM_COLUMNS,
    input_size: INPUT_SIZE,
    wg: WG,
    disp: DISP,
    reps: REPS,
    seed: SEED,
    validate: VALIDATE,
  };
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
    const sm = new ShaderManager(NUM_SUBTASKS, NUM_COLUMNS, BN254_CURVE_CONFIG, false);
    const r = await runOne(device, sm);
    benchState.results.push(r);
    resultsClient.postProgress({
      kind: 'csr_to_v2_done',
      active_sums_us: r.active_sums_us,
      meta_us: r.meta_us,
      combined_us: r.combined_us,
      ns_per_slot_combined: r.ns_per_slot_combined,
      validated: r.validated,
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
