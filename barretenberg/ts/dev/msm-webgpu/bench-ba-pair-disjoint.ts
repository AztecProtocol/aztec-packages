/// <reference types="@webgpu/types" />
// Standalone WebGPU bench for the disjoint pair-sum kernel
// (ba_pair_disjoint_bench): each thread reduces 2*S input points to
// S disjoint pair sums R_k = P_{2k} + P_{2k+1}, using one batched
// fr_inv_by_a per chunk of S. Same DISP=8 dispatch amortisation as
// bench-ba-rev-packed-carry to keep the measurement methodology
// apples-to-apples.
//
// Input: random Montgomery field elems packed into SoA layout with
// 2 planes (P.x, P.y), 2*PAIRS elements per plane. Pairs are arranged
// at strided positions e = t + i*T for i in 0..2S so the kernel's
// coalesced reads work. Adjacent pair members are guaranteed distinct
// x to avoid the lean-add div-by-zero.
//
// Output: 2 planes (R.x, R.y), PAIRS elements per plane. Reports
// ns/useful-pair-sum (every kernel output is a usable disjoint pair
// sum, vs the chain kernel where only S/2 of S outputs are usable).

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';

const PG = 2;
const DEFAULT_PAIRS = 1 << 17;           // 131072 output pair sums per dispatch
const DEFAULT_WGI = 64;
const DEFAULT_DISP = 8;
const DEFAULT_S_SWEEP: readonly number[] = [16, 32, 64];

let PAIRS = DEFAULT_PAIRS;
let WGI = DEFAULT_WGI;
let DISP = DEFAULT_DISP;
let S_SWEEP: readonly number[] = DEFAULT_S_SWEEP;

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

function bigintToPackedU32x8(v: bigint): Uint32Array {
  const w = new Uint32Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    w[i] = Number(x & 0xffffffffn);
    x >>= 32n;
  }
  return w;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// SoA-packed input buffer with 2 planes (P.x, P.y), each PG*(2*PAIRS)
// vec4. Plane p at element idx e: vec4 indices (p*PG + v)*N_in + e for
// v in 0..PG, where N_in = 2*PAIRS. Adjacent pairs (2k, 2k+1) have
// distinct x.
function buildPackedPairsSoA(pairs: number, R: bigint, p: bigint, rng: () => number): Uint32Array {
  const N_in = 2 * pairs;
  const buf = new Uint32Array(2 * PG * N_in * 4);
  for (let k = 0; k < pairs; k++) {
    let lx: bigint;
    let rx: bigint;
    do {
      lx = (randomBelow(p, rng) * R) % p;
      rx = (randomBelow(p, rng) * R) % p;
    } while (lx === rx);
    const ly = (randomBelow(p, rng) * R) % p;
    const ry = (randomBelow(p, rng) * R) % p;
    const writeElem = (planeIdx: number, e: number, val: bigint) => {
      const words = bigintToPackedU32x8(val);
      for (let v = 0; v < PG; v++) {
        const base = ((planeIdx * PG + v) * N_in + e) * 4;
        buf[base + 0] = words[4 * v + 0];
        buf[base + 1] = words[4 * v + 1];
        buf[base + 2] = words[4 * v + 2];
        buf[base + 3] = words[4 * v + 3];
      }
    };
    writeElem(0, 2 * k + 0, lx);
    writeElem(1, 2 * k + 0, ly);
    writeElem(0, 2 * k + 1, rx);
    writeElem(1, 2 * k + 1, ry);
  }
  return buf;
}

interface PerSizeResult {
  s: number;
  wgi: number;
  T: number;
  num_wgs: number;
  pairs: number;
  disp: number;
  total_ops: number;
  median_ms: number;
  min_ms: number;
  max_ms: number;
  ns_per_op: number;
  samples_ms: number[];
  sanity_ok: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: { reps: number; pairs: number; wgi: number; disp: number; s_sweep: readonly number[] } | null;
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

const resultsClient = makeResultsClient({ page: 'bench-ba-pair-disjoint' });
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
  console.log(`[bench-ba-pair-disjoint] ${msg}`);
}

async function compile(
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
  if (hasError) throw new Error(`WGSL compile failed for ${cacheKey}: ${errLines.join(' | ')}`);
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const pipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
  return { pipeline, layout };
}

async function readNonZero(device: GPUDevice, buf: GPUBuffer, u32Count: number): Promise<boolean> {
  const bytes = u32Count * 4;
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await staging.mapAsync(GPUMapMode.READ);
  const u32 = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  for (let i = 0; i < u32.length; i++) if (u32[i] !== 0) return true;
  return false;
}

async function timeDispatch(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bind: GPUBindGroup,
  numWgs: number,
  reps: number,
  passes: number,
): Promise<number[]> {
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

async function runOne(
  device: GPUDevice,
  sm: ShaderManager,
  s: number,
  reps: number,
  R: bigint,
  p: bigint,
  seed: number,
): Promise<PerSizeResult> {
  if (PAIRS % s !== 0) throw new Error(`PAIRS=${PAIRS} must be a multiple of S=${s}`);
  const T = PAIRS / s;
  const numWgs = Math.ceil(T / WGI);
  log('info', `=== S=${s}: PAIRS=${PAIRS} T=${T} WGI=${WGI} numWgs=${numWgs} DISP=${DISP}`);

  const code = sm.gen_ba_pair_disjoint_bench_shader(WGI, s);
  log('info', `compiling shader (${code.length} chars)`);
  (window as unknown as Record<string, unknown>)[`__shader_s${s}`] = code;
  const cacheKey = `bench-ba-pair-disjoint-W${WGI}-S${s}`;
  const { pipeline, layout } = await compile(device, code, cacheKey);

  const rng = makeRng(seed);
  const inU32 = buildPackedPairsSoA(PAIRS, R, p, rng);

  const inBuf = device.createBuffer({
    size: inU32.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inBuf, 0, inU32);
  const dummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const outBytes = 2 * PG * PAIRS * 4 * 4;
  const outBuf = device.createBuffer({
    size: outBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const paramsBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuf, 0, new Uint32Array([2 * PAIRS, T, 0, 0]));

  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: inBuf } },
      { binding: 1, resource: { buffer: dummy } },
      { binding: 2, resource: { buffer: outBuf } },
      { binding: 3, resource: { buffer: paramsBuf } },
    ],
  });

  const samples = await timeDispatch(device, pipeline, bind, numWgs, reps, DISP);
  const sanityOk = await readNonZero(device, outBuf, 8);
  const med = median(samples);
  const totalOps = PAIRS * DISP;
  const nsPerOp = (med * 1e6) / totalOps;

  log(
    sanityOk ? 'ok' : 'err',
    `S=${s}: median=${med.toFixed(3)}ms min=${Math.min(...samples).toFixed(3)}ms max=${Math.max(...samples).toFixed(3)}ms ns/op=${nsPerOp.toFixed(2)} sanity=${sanityOk ? 'OK' : 'FAIL'}`,
  );

  inBuf.destroy();
  dummy.destroy();
  outBuf.destroy();
  paramsBuf.destroy();

  return {
    s,
    wgi: WGI,
    T,
    num_wgs: numWgs,
    pairs: PAIRS,
    disp: DISP,
    total_ops: totalOps,
    median_ms: med,
    min_ms: Math.min(...samples),
    max_ms: Math.max(...samples),
    ns_per_op: nsPerOp,
    samples_ms: samples,
    sanity_ok: sanityOk,
  };
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  const reps = parseInt(qp.get('reps') ?? '5', 10);
  if (!Number.isFinite(reps) || reps <= 0 || reps > 50) throw new Error(`?reps must be in (0, 50]`);
  const pairsStr = qp.get('pairs');
  if (pairsStr !== null) {
    const v = parseInt(pairsStr, 10);
    if (!Number.isFinite(v) || v <= 0 || v > (1 << 20)) throw new Error(`?pairs must be in (0, 2^20]`);
    PAIRS = v;
  }
  const wgiStr = qp.get('wgi');
  if (wgiStr !== null) {
    const v = parseInt(wgiStr, 10);
    if (!Number.isFinite(v) || v <= 0 || v > 1024) throw new Error(`?wgi must be in (0, 1024]`);
    WGI = v;
  }
  const dispStr = qp.get('disp');
  if (dispStr !== null) {
    const v = parseInt(dispStr, 10);
    if (!Number.isFinite(v) || v <= 0 || v > 64) throw new Error(`?disp must be in (0, 64]`);
    DISP = v;
  }
  const sStr = qp.get('s');
  if (sStr !== null) {
    const list = sStr.split(',').map(v => parseInt(v, 10));
    for (const v of list) {
      if (!Number.isFinite(v) || v <= 0 || v > 256) throw new Error(`?s entries must be in (0, 256]`);
    }
    S_SWEEP = list;
  }
  for (const v of S_SWEEP) {
    if (PAIRS % v !== 0) throw new Error(`S=${v} does not divide PAIRS=${PAIRS}`);
  }
  return { reps, pairs: PAIRS, wgi: WGI, disp: DISP, s_sweep: S_SWEEP };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing — WebGPU not available');
    const params = parseParams();
    benchState.params = params;
    log(
      'info',
      `params: reps=${params.reps} pairs=${params.pairs} wgi=${params.wgi} disp=${params.disp} s=[${params.s_sweep.join(',')}]`,
    );

    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');

    const p = BN254_BASE_FIELD;
    const miscParams = compute_misc_params(p, 13);
    const R = miscParams.r;

    const sm = new ShaderManager(4, PAIRS, BN254_CURVE_CONFIG, false);

    let seed = 0xd1d1;
    for (const s of S_SWEEP) {
      try {
        const r = await runOne(device, sm, s, params.reps, R, p, seed);
        benchState.results.push(r);
        resultsClient.postProgress({
          kind: 'batch_done',
          s,
          median_ms: r.median_ms,
          ns_per_op: r.ns_per_op,
          sanity_ok: r.sanity_ok,
        });
        seed += 0x10;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('err', `S=${s} failed: ${msg} — STOPPING`);
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
