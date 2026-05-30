// End-to-end correctness harness for the MsmV2 WebGPU pipeline (including the
// stream-walker accumulator) at SMALL sizes, cross-checked against a noble CPU
// reference. Unlike index.html this needs no SRS download and no threaded WASM:
// it synthesises valid BN254 points with noble, so it runs under a headless
// SwiftShader browser on a GPU-less host.
//
// URL params:
//   ?logns=8,10   comma-separated log2(n) sizes to test (default "8,10")
//   ?c=NN ?wgi=NN ...  forwarded as MsmConfig knobs (same names as index.html)

import { bn254 } from '@noble/curves/bn254';

import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { MsmV2, MsmV2Pool, type MsmConfig } from '../../src/msm_webgpu/msm_v2.js';

const $status = document.getElementById('status')!;
const $log = document.getElementById('log')!;
const lines: string[] = [];
function log(level: 'info' | 'ok' | 'err', msg: string) {
  const tag = level === 'ok' ? '[OK]' : level === 'err' ? '[ERR]' : '[..]';
  const line = `${tag} ${msg}`;
  console.log(line);
  lines.push(line);
  $log.textContent = lines.join('\n');
}
function setStatus(text: string, cls?: 'ok' | 'err') {
  $status.textContent = text;
  if (cls) $status.className = cls;
}

async function postResult(payload: Record<string, unknown>) {
  try {
    await fetch('/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: (window as any).__runId, ...payload }),
    });
  } catch (e) {
    log('err', `POST /results failed: ${(e as Error).message}`);
  }
}

// Heartbeat to /progress so the BrowserStack runner's stall/first-progress
// watchdogs see liveness during long mobile runs (which only post /results at
// the very end). ts is required by the runner's stall detector.
async function postProgress(stage: string, extra: Record<string, unknown> = {}) {
  try {
    await fetch('/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: (window as any).__runId, ts: new Date().toISOString(), stage, ...extra }),
    });
  } catch {
    // progress is best-effort
  }
}

(window as any).__runId = `corr-${Math.random().toString(36).slice(2)}-${Date.now()}`;

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

// Optional deterministic PRNG (?seed=N) so two runs (e.g. baseline vs a knob
// flip) see byte-identical points + scalars for an equivalence diff.
let prng: number | null = (() => {
  const s = new URLSearchParams(window.location.search).get('seed');
  return s === null ? null : (parseInt(s, 10) >>> 0 || 1);
})();
function fillBytes(out: Uint8Array): void {
  if (prng === null) { crypto.getRandomValues(out); return; }
  let s = prng;
  for (let i = 0; i < out.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s & 0xff; out[i + 1] = (s >>> 8) & 0xff; out[i + 2] = (s >>> 16) & 0xff; out[i + 3] = (s >>> 24) & 0xff;
  }
  prng = s;
}
function randomFr(): bigint {
  for (;;) {
    const bytes = new Uint8Array(32);
    fillBytes(bytes);
    bytes[31] &= 0x3f;
    let v = 0n;
    for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
    if (v < FR_ORDER) return v;
  }
}

// Synthesise n pseudo-random affine BN254 points as a random arithmetic
// progression on the curve: P_i = (start + i·stride)·G with random start and
// a large random stride. Two cheap scalar-muls plus n point-adds. Crucially
// the points must NOT be small/consecutive multiples of G — those let the
// MSM's batched AFFINE addition hit x₁==x₂ collisions (partial sums and points
// are all G-multiples, so P_i+P_j can equal ±P_k), dividing by zero. A random
// stride makes such collisions negligible, matching real SRS point genericity.
// Layout: pointsBuf[i] = x_i[32 LE] || y_i[32 LE], non-Montgomery.
function makePoints(n: number): { pointsBuf: Uint8Array; affine: { x: bigint; y: bigint }[] } {
  const pointsBuf = new Uint8Array(n * 64);
  const affine = new Array<{ x: bigint; y: bigint }>(n);
  // ?indep=1 → each point an independent random multiple of G (n scalar-muls,
  // slow but no AP linear relation); default → random arithmetic progression.
  const indep = new URLSearchParams(window.location.search).get('indep') === '1';
  if (indep) {
    for (let i = 0; i < n; i++) {
      const a = bn254.G1.ProjectivePoint.BASE.multiply(randomFr()).toAffine();
      affine[i] = { x: a.x, y: a.y };
      pointsBuf.set(biToLe32(a.x), i * 64);
      pointsBuf.set(biToLe32(a.y), i * 64 + 32);
    }
    return { pointsBuf, affine };
  }
  const start = randomFr();
  const stride = randomFr();
  let acc = bn254.G1.ProjectivePoint.BASE.multiply(start);
  const step = bn254.G1.ProjectivePoint.BASE.multiply(stride);
  for (let i = 0; i < n; i++) {
    const a = acc.toAffine();
    affine[i] = { x: a.x, y: a.y };
    pointsBuf.set(biToLe32(a.x), i * 64);
    pointsBuf.set(biToLe32(a.y), i * 64 + 32);
    acc = acc.add(step);
  }
  return { pointsBuf, affine };
}

const gpuKnobs: MsmConfig = (() => {
  const q = new URLSearchParams(window.location.search);
  const optInt = (k: string): number | undefined => {
    const raw = q.get(k);
    if (raw === null) return undefined;
    const v = Number(raw);
    return Number.isInteger(v) && v > 0 ? v : undefined;
  };
  return {
    c: optInt('c'), s: optInt('s'), wgi: optInt('wgi'), reduceWg: optInt('reducewg'),
    walkerS: optInt('walkers'), walkerMaxWg: optInt('walkermaxwg'),
  };
})();

// Build-only memory probe: statsBytes() is a pure function of n, so we can read
// the algorithm-buffer footprint at large logn without running any compute
// (warmupRuns: 0, zero-filled points — the result is never checked).
async function memProbe(device: GPUDevice, logN: number): Promise<number> {
  const n = 1 << logN;
  const pointsBuf = new Uint8Array(n * 64); // zeros — only sizes matter
  const pool = await MsmV2Pool.create(device, pointsBuf);
  const msm = await MsmV2.create(device, n, pool, { ...gpuKnobs, warmupRuns: 0 } as MsmConfig);
  const bytes = msm.statsBytes();
  msm.destroy();
  pool.destroy();
  return bytes;
}

(async () => {
  try {
    const qp = new URLSearchParams(window.location.search);
    const logns = (qp.get('logns') ?? '8,10')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(Number.isFinite);

    log('info', 'requesting WebGPU device...');
    await postProgress('boot');
    const device = await get_device();
    log('ok', 'device ready');
    await postProgress('device-ready');

    // Optional memory-footprint probe (?mem=17,20): build-only, no compute.
    const memLogns = (qp.get('mem') ?? '')
      .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
    const mem: { logN: number; bytes: number; mib: number }[] = [];
    for (const logN of memLogns) {
      const bytes = await memProbe(device, logN);
      mem.push({ logN, bytes, mib: bytes / 1024 / 1024 });
      log('info', `[mem] logN=${logN} (n=${1 << logN}): algorithm buffers = ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
    }

    // ?reps=N → after the correctness check, run N timed iterations and report
    // per-phase GPU times (from window.__lastPhaseMs, needs timestamp-query) +
    // wall time. The 'stream_walker' phase is the batched-inversion accumulate
    // kernel under study. No WASM/SRS needed, so this profiles real devices too
    // (Android lacks timestamp-query → phases empty, use wallMs).
    const reps = (() => { const v = parseInt(qp.get('reps') ?? '0', 10); return Number.isFinite(v) && v > 0 ? v : 0; })();
    // ?ssweep=8,16,24,32 → benchmark each walkerS in one page load (one
    // BrowserStack seat maps the whole curve). walkerMaxWg is coupled so
    // walkerS*walkerMaxWg = 256 (default S=8,maxWg=32 product), holding the
    // partials_buf footprint flat across the sweep. Falls back to the single
    // (walkers,walkermaxwg) config from gpuKnobs when ssweep is absent.
    // ?sweepmaxwg=M fixes walkerMaxWg for every S in the sweep (decoupled —
    // keeps NUM_THREADS=M*256 constant so partials grow ∝ S; isolates the
    // inversion-amortization effect from the parallelism loss of the default
    // coupled mode where maxWg=256/S). Default: coupled (memory flat).
    const fixedMaxWg = (() => { const v = parseInt(qp.get('sweepmaxwg') ?? '', 10); return Number.isFinite(v) && v > 0 ? v : 0; })();
    const sweep: { walkerS: number; walkerMaxWg: number }[] = (() => {
      const raw = qp.get('ssweep');
      if (raw) {
        return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(v => Number.isFinite(v) && v > 0)
          .map(S => ({ walkerS: S, walkerMaxWg: fixedMaxWg || Math.max(1, Math.round(256 / S)) }));
      }
      return [{ walkerS: gpuKnobs.walkerS ?? 8, walkerMaxWg: gpuKnobs.walkerMaxWg ?? 32 }];
    })();
    const FP = bn254.fields.Fp.ORDER;
    const onCurve = (p: { x: bigint; y: bigint }) => (p.y * p.y - (p.x * p.x * p.x + 3n)) % FP === 0n;
    const results: { logN: number; n: number; walkerS: number; walkerMaxWg: number; pass: boolean; onCurve: boolean; gpu: string; ref: string; timing?: any }[] = [];
    let allPass = true;

    for (const logN of logns) {
      const n = 1 << logN;
      log('info', `=== logN=${logN} (n=${n}) ===`);
      await postProgress('logn-start', { logN });
      const { pointsBuf, affine } = makePoints(n);
      // ?sc=N forces every scalar to N (diagnostic: sc=1 makes MSM = Σ Pᵢ).
      const forced = qp.get('sc');
      const scalars = new Array<bigint>(n);
      const scalarsBuf = new Uint8Array(n * 32);
      for (let i = 0; i < n; i++) {
        const s = forced !== null ? BigInt(forced) : randomFr();
        scalars[i] = s;
        scalarsBuf.set(biToLe32(s), i * 32);
      }

      log('info', 'computing noble reference MSM...');
      const proj = affine.map(p => bn254.G1.ProjectivePoint.fromAffine(p));
      const refAff = bn254.G1.ProjectivePoint.msm(proj, scalars).toAffine();
      if (n <= 1024) {
        let acc = bn254.G1.ProjectivePoint.ZERO;
        for (let i = 0; i < n; i++) if (scalars[i] !== 0n) acc = acc.add(proj[i].multiply(scalars[i]));
        const naive = acc.toAffine();
        const refMatchesNaive = naive.x === refAff.x && naive.y === refAff.y;
        log(refMatchesNaive ? 'ok' : 'err', `[ref-selfcheck] noble msm()==naive Σ: ${refMatchesNaive}`);
      }

      const pool = await MsmV2Pool.create(device, pointsBuf);
      for (const cfg of sweep) {
        await postProgress('build', { logN, walkerS: cfg.walkerS });
        log('info', `building MsmV2 S=${cfg.walkerS} maxWg=${cfg.walkerMaxWg}...`);
        const msm = await MsmV2.create(device, n, pool,
          { ...gpuKnobs, walkerS: cfg.walkerS, walkerMaxWg: cfg.walkerMaxWg, profile: reps > 0 } as MsmConfig);
        msm.prepare(scalarsBuf);
        const warm = qp.get('warm') !== '0';
        if (warm) await msm.run();
        const xy = await msm.run();
        const bytes = pool.statsBytes();

        let timing: any = undefined;
        if (reps > 0) {
          const wallSamples: number[] = [];
          const phaseSamples: Record<string, number>[] = [];
          for (let r = 0; r < reps; r++) {
            const t0 = performance.now();
            await msm.run();
            const wall = performance.now() - t0;
            wallSamples.push(wall);
            const ph = (window as any).__lastPhaseMs as Record<string, number> | undefined;
            if (ph) phaseSamples.push({ ...ph });
            await postProgress('rep', { logN, walkerS: cfg.walkerS, rep: r + 1, wallMs: wall });
          }
          const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
          const keys = Array.from(new Set(phaseSamples.flatMap(p => Object.keys(p))));
          const avgPhases: Record<string, number> = {};
          for (const k of keys) avgPhases[k] = avg(phaseSamples.map(p => p[k] ?? 0));
          timing = {
            reps, walkerS: cfg.walkerS, walkerMaxWg: cfg.walkerMaxWg,
            wallMs: avg(wallSamples), wallMin: Math.min(...wallSamples),
            mib: bytes / 1024 / 1024, phases: avgPhases, hasTimestamps: phaseSamples.length > 0,
          };
          log('ok', `[bench] logN=${logN} S=${cfg.walkerS} maxWg=${cfg.walkerMaxWg} reps=${reps}: ` +
            `wall=${timing.wallMs.toFixed(2)}ms (min ${timing.wallMin.toFixed(2)}) ` +
            `stream_walker=${(avgPhases['stream_walker'] ?? 0).toFixed(2)}ms mem=${timing.mib.toFixed(2)}MiB ts=${timing.hasTimestamps}`);
        }
        msm.destroy();

        const oc = onCurve(xy);
        const pass = xy.x === refAff.x && xy.y === refAff.y;
        allPass = allPass && pass;
        log(pass ? 'ok' : 'err',
          `logN=${logN} S=${cfg.walkerS}: ${pass ? 'PASS' : 'FAIL'} on-curve=${oc} mem=${(bytes / 1024 / 1024).toFixed(2)}MiB`);
        results.push({
          logN, n, walkerS: cfg.walkerS, walkerMaxWg: cfg.walkerMaxWg, pass, onCurve: oc,
          gpu: `${xy.x.toString(16)},${xy.y.toString(16)}`,
          ref: `${refAff.x.toString(16)},${refAff.y.toString(16)}`,
          timing,
        });
        await postProgress('config-done', { logN, walkerS: cfg.walkerS, pass });
      }
      pool.destroy();
    }

    device.destroy();
    setStatus(allPass ? 'OK' : 'FAIL', allPass ? 'ok' : 'err');
    (window as any).__result = { state: allPass ? 'done' : 'error', results, mem };
    await postResult({ state: allPass ? 'done' : 'error', results, mem, log: lines });
    log(allPass ? 'ok' : 'err', `ALL ${allPass ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `top-level: ${msg}`);
    setStatus(`THROW: ${(e as Error).message}`, 'err');
    (window as any).__result = { state: 'error', error: msg };
    await postResult({ state: 'error', error: msg, log: lines });
  }
})();
