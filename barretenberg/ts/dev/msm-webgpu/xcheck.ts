// Standalone WebGPU MSM correctness cross-check harness (no WASM, no COI).
//
// Imports the in-tree MsmV2 pipeline + SRS loader directly (same pattern as
// walker-validate.ts) and cross-checks the GPU MSM result against the
// @noble/curves BN254 Pippenger reference for an arbitrary log2(n) — including
// the small sizes (logn=8, 10) the main index.html page floors out at and that
// SwiftShader can run quickly. Drives entirely off WebGPU so it does not need
// cross-origin isolation / SharedArrayBuffer / the threaded WASM oracle.
//
// URL params:
//   ?logn=N    log2 of the MSM size (default 10)
//
// Reports a terminal JSON payload via POST /results and mirrors every line to
// console + the #log element so the playwright driver can scrape either.

import { bn254 } from '@noble/curves/bn254';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { MsmV2, MsmV2Pool } from '../../src/msm_webgpu/msm_v2.js';

const $status = document.getElementById('status')!;
const $log = document.getElementById('log')!;
const lines: string[] = [];
function log(level: 'info' | 'ok' | 'err', msg: string): void {
  const tag = level === 'ok' ? '[OK]' : level === 'err' ? '[ERR]' : '[..]';
  const line = `${tag} ${msg}`;
  console.log(line);
  lines.push(line);
  $log.textContent = lines.join('\n');
}
function setStatus(text: string, cls?: 'ok' | 'err'): void {
  $status.textContent = text;
  if (cls) $status.className = cls;
}
async function postResult(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    log('err', `POST /results failed: ${(e as Error).message}`);
  }
}

const FR_ORDER = bn254.fields.Fr.ORDER;

function biToLe32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
function randomFr(): bigint {
  for (;;) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    bytes[31] &= 0x3f;
    let v = 0n;
    for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
    if (v < FR_ORDER) return v;
  }
}
// Writes a base-field element as 32 LE bytes — the per-coordinate layout
// MsmV2Pool expects (same as the SRS loader's writeLe32). A point is the
// interleaved [x|y] LE-32 pair, 64 bytes total.
function writeLe32(out: Uint8Array, off: number, v: bigint): void {
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[off + i] = Number(x & 0xffn);
    x >>= 8n;
  }
}
function pointsEqual(a: { x: bigint; y: bigint }, b: { x: bigint; y: bigint }): boolean {
  return a.x === b.x && a.y === b.y;
}

(async () => {
  const qp = new URLSearchParams(window.location.search);
  const logN = parseInt(qp.get('logn') ?? '10', 10);
  const reps = parseInt(qp.get('reps') ?? '5', 10);
  const n = 1 << logN;
  // Unique run id so the BrowserStack orchestrator (run-browserstack.mjs) can
  // detect this run in the shared JSONL and apply its watchdogs.
  const runId = `xcheck-${logN}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    log('info', `xcheck start: runId=${runId} logN=${logN} (n=${n}) reps=${reps}`);
    if (!('gpu' in navigator)) throw new Error('navigator.gpu is undefined — no WebGPU');
    // Early progress ping so the orchestrator detects the runId quickly and the
    // no-first-progress watchdog is satisfied before the (slower) noble run.
    await fetch('/progress', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, phase: 'start', logN }),
    }).catch(() => {});

    // Generate n distinct on-curve BN254 G1 bases as deterministic scalar
    // multiples of the generator. We avoid the CRS-CDN SRS fetch because the
    // headless SwiftShader Chromium can't validate the CDN TLS chain
    // (ERR_CERT_AUTHORITY_INVALID). For a GPU-vs-reference correctness check
    // the only requirement is that BOTH sides consume the identical valid G1
    // points; these noble-generated bases satisfy that. (No source edits to
    // srs.ts; this harness simply supplies its own bases.)
    log('info', `generating ${n} random on-curve G1 bases (r_i·G)…`);
    const G = bn254.G1.ProjectivePoint.BASE;
    const points = new Array<{ x: bigint; y: bigint }>(n);
    const pointsBuf = new Uint8Array(n * 64);
    for (let i = 0; i < n; i++) {
      const aff = G.multiply(randomFr() || 1n).toAffine();
      points[i] = { x: aff.x, y: aff.y };
      writeLe32(pointsBuf, i * 64, aff.x);
      writeLe32(pointsBuf, i * 64 + 32, aff.y);
    }
    log('ok', `bases ready: ${n} points`);

    const scalars = new Array<bigint>(n);
    const scalarBytes = new Uint8Array(n * 32);
    for (let i = 0; i < n; i++) {
      const s = randomFr();
      scalars[i] = s;
      scalarBytes.set(biToLe32(s), i * 32);
    }
    log('info', `inputs ready: ${n} points + ${n} scalars`);

    log('info', 'acquiring GPUDevice…');
    const device = await get_device();
    log('ok', 'device ready');

    const pool = await MsmV2Pool.create(device, pointsBuf);
    const msm = await MsmV2.create(device, n, pool, { profile: true });
    log('ok', 'MsmV2 ready');

    // Per-architecture autotuner decision for this device.
    const wgStorage = (device.limits as unknown as Record<string, number>)['maxComputeWorkgroupStorageSize'];
    const adapterInfo = (device as unknown as { adapterInfo?: GPUAdapterInfo }).adapterInfo;
    const wc = msm.walkerConfig;
    const autotune = {
      arch: wc.arch, tpb: wc.tpb, s: wc.s,
      prefScratchBytes: wc.prefScratchBytes, prefScratchPlacement: wc.prefScratchPlacement,
      wgStorage, reason: wc.reason,
      vendor: adapterInfo?.vendor, architecture: adapterInfo?.architecture,
    };
    log('ok',
      `[autotune] vendor=${adapterInfo?.vendor ?? '?'} arch=${wc.arch}(${adapterInfo?.architecture ?? '?'}) ` +
      `wgStorage=${wgStorage}B → TPB=${wc.tpb} S=${wc.s} pref_scratch=${wc.prefScratchBytes}B`);

    msm.prepare(scalarBytes);
    await msm.run(); // warm-up (first-touch)
    const gpuXy = await msm.run();
    log('ok', `[gpu] x=0x${gpuXy.x.toString(16).slice(0, 16)}…`);

    // Timed reps: wall around run() + (when timestamp-query is available) the
    // summed per-pass GPU breakdown, including the stream_walker accumulate.
    const wallSamples: number[] = [];
    let lastProfile: Record<string, number> | null = null;
    for (let r = 0; r < reps; r++) {
      const t0 = performance.now();
      const out = await msm.run();
      wallSamples.push(performance.now() - t0);
      if (out.profile) lastProfile = out.profile as unknown as Record<string, number>;
    }
    wallSamples.sort((a, b) => a - b);
    const medWall = wallSamples[Math.floor(wallSamples.length / 2)];
    const gpuSum = lastProfile
      ? Object.entries(lastProfile).filter(([k]) => k !== 'wall').reduce((a, [, v]) => a + (v ?? 0), 0)
      : null;
    log('ok',
      `[timing] median wall=${medWall.toFixed(2)}ms over ${reps} reps` +
      (gpuSum !== null ? `; gpu_sum=${gpuSum.toFixed(2)}ms walker=${(lastProfile?.fused ?? lastProfile?.stream_walker ?? 0).toFixed(2)}ms` : ' (no timestamp-query)'));
    log('info', `[gpu] full x=0x${gpuXy.x.toString(16)}`);
    log('info', `[gpu] full y=0x${gpuXy.y.toString(16)}`);

    log('info', '[noble] computing reference MSM (noble pippenger)…');
    const t0 = performance.now();
    const projPoints = points.map(p => bn254.G1.ProjectivePoint.fromAffine(p));
    const nobleAff = bn254.G1.ProjectivePoint.msm(projPoints, scalars).toAffine();
    log('info', `[noble] done in ${(performance.now() - t0).toFixed(0)} ms`);
    log('info', `[noble] x=0x${nobleAff.x.toString(16)}`);

    const ok = pointsEqual(nobleAff, gpuXy);
    if (ok) {
      log('ok', `[noble] matches GPU at log₂(n) = ${logN}`);
      log('ok', `[cross-check] WebGPU and noble agree at logN=${logN}`);
    } else {
      log('err', `[noble] mismatch: noble.x=0x${nobleAff.x.toString(16)}, gpu.x=0x${gpuXy.x.toString(16)}`);
      log('err', `[cross-check] disagreement at logN=${logN}`);
    }

    msm.destroy();
    pool.destroy();

    setStatus(ok ? 'PASS' : 'FAIL', ok ? 'ok' : 'err');
    await postResult({
      state: ok ? 'done' : 'error',
      runId,
      logN,
      n,
      cross_ok: ok,
      autotune,
      timing: { medianWallMs: medWall, wallSamplesMs: wallSamples, gpuSumMs: gpuSum, profile: lastProfile },
      gpu_x: `0x${gpuXy.x.toString(16)}`,
      gpu_y: `0x${gpuXy.y.toString(16)}`,
      noble_x: `0x${nobleAff.x.toString(16)}`,
      noble_y: `0x${nobleAff.y.toString(16)}`,
      log: lines,
    });
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `top-level: ${msg}`);
    setStatus(`THROW: ${msg}`, 'err');
    await postResult({ state: 'error', runId, logN, n, error: msg, log: lines });
  }
})();
