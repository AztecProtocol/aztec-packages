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
// Re-seed the deterministic PRNG so a sweep can iterate distinct seeds.
function seedPrng(s: number): void {
  prng = (s >>> 0) || 1;
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
  // ?pts=rand → independent random points P_i = r_i·G with independent random
  // r_i (real-SRS-like genericity: no subset-sum collisions). Default (AP) is
  // cheaper (2 scalar-muls + n adds) but every point is a known multiple of G,
  // so subset sums collide far more than real points, artificially tripping the
  // reduce's documented no-collision assumption.
  const mode = new URLSearchParams(window.location.search).get('pts') ?? 'ap';
  if (mode === 'rand') {
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
  return { c: optInt('c'), s: optInt('s'), wgi: optInt('wgi'), reduceWg: optInt('reducewg') };
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

const FPO = bn254.fields.Fp.ORDER;
const onCurve = (p: { x: bigint; y: bigint }) =>
  (p.x === 0n && p.y === 0n) || (p.y * p.y - (p.x * p.x * p.x + 3n)) % FPO === 0n;

// Count off-curve entries in the Montgomery-decoded bucket_sums / window sums.
// The stream-walker's split-bucket combine writes bucket_sums; the reduce folds
// them into per-window sums. A correct affine accumulation keeps every sum on
// the curve — an un-handled dx==0 (point doubling / intermediate infinity)
// produced off-curve garbage, so this is the direct signal for the fix.
async function bucketOffCurve(msm: MsmV2): Promise<{ used: number; off: number; sample: string[] }> {
  const { buf, BW, numWindows, rinv } = await msm.debugBucketResult();
  const bTot = numWindows * BW;
  const packed = (off: number): bigint => {
    let v = 0n;
    for (let i = 7; i >= 0; i--) v = (v << 32n) | BigInt(buf[off + i] >>> 0);
    return v;
  };
  let used = 0, off = 0;
  const sample: string[] = [];
  for (let b = 0; b < bTot; b++) {
    const x = (packed(8 * b) * rinv) % FPO;
    const y = (packed(8 * bTot + 8 * b) * rinv) % FPO;
    if (x === 0n && y === 0n) continue;
    used++;
    if (!onCurve({ x, y })) {
      off++;
      if (sample.length < 10) sample.push(`w${Math.floor(b / BW)}:b${b % BW}`);
    }
  }
  return { used, off, sample };
}

(async () => {
  try {
    const qp = new URLSearchParams(window.location.search);
    const logns = (qp.get('logns') ?? '8,10')
      .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
    // Repeated-green sweep knobs (proof that the non-deterministic combine race
    // is gone): run every (seed, logN) `reps` times — each run re-traverses the
    // CAS-ordered partial linked list, so on real hardware the order (and thus
    // any surviving dx==0) varies run-to-run.
    const seeds = (qp.get('seeds') ?? qp.get('seed') ?? '1')
      .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
    const reps = Math.max(1, parseInt(qp.get('reps') ?? '1', 10));
    // ?hot=K → draw scalars from {1..K} so few distinct buckets accrue many
    // points → hot buckets split into many partials (the combine's stress case).
    const hot = parseInt(qp.get('hot') ?? '0', 10);
    const forced = qp.get('sc');

    log('info', 'requesting WebGPU device...');
    const device = await get_device();
    log('ok', `device ready; pts=${qp.get('pts') ?? 'ap'} seeds=${seeds.join(',')} reps=${reps}${hot ? ` hot=${hot}` : ''}`);

    const memLogns = (qp.get('mem') ?? '')
      .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
    const mem: { logN: number; bytes: number; mib: number }[] = [];
    for (const logN of memLogns) {
      const bytes = await memProbe(device, logN);
      mem.push({ logN, bytes, mib: bytes / 1024 / 1024 });
      log('info', `[mem] logN=${logN} (n=${1 << logN}): algorithm buffers = ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
    }

    const results: { seed: number; logN: number; rep: number; pass: boolean; offBuckets: number }[] = [];
    let allPass = true;

    for (const seed of seeds) {
      for (const logN of logns) {
        const n = 1 << logN;
        seedPrng(seed);
        const { pointsBuf, affine } = makePoints(n);
        // ?hot=K draws every scalar from a pool of K distinct *full-width*
        // random scalars, so each window sees only K distinct digits → buckets
        // accrue ~n/K points each (hot buckets, the combine's stress case)
        // across all windows (not just the low one, which a tiny-scalar pool
        // would degenerate to).
        const pool32 = hot > 0 ? Array.from({ length: hot }, () => randomFr()) : null;
        const scalars = new Array<bigint>(n);
        const scalarsBuf = new Uint8Array(n * 32);
        for (let i = 0; i < n; i++) {
          const s = forced !== null ? BigInt(forced) : pool32 ? pool32[Number(randomFr() % BigInt(hot))] : randomFr();
          scalars[i] = s;
          scalarsBuf.set(biToLe32(s), i * 32);
        }

        const proj = affine.map(p => bn254.G1.ProjectivePoint.fromAffine(p));
        const refAff = bn254.G1.ProjectivePoint.msm(proj, scalars).toAffine();

        const pool = await MsmV2Pool.create(device, pointsBuf);
        const msm = await MsmV2.create(device, n, pool, gpuKnobs);
        msm.prepare(scalarsBuf);
        await msm.run(); // warm (first-touch) — untimed

        for (let rep = 0; rep < reps; rep++) {
          const xy = await msm.run();
          const { used, off, sample } = await bucketOffCurve(msm);
          const ws = (xy.windowSums ?? []);
          const offWin = ws.filter(p => !onCurve(p)).length;
          const match = xy.x === refAff.x && xy.y === refAff.y;
          const pass = match && off === 0 && offWin === 0;
          allPass = allPass && pass;
          results.push({ seed, logN, rep, pass, offBuckets: off });
          log(pass ? 'ok' : 'err',
            `seed=${seed} logN=${logN} rep=${rep}: ${pass ? 'PASS' : 'FAIL'} | msm-match=${match} buckets=${used}(off=${off}${off ? ' @ ' + sample.join(',') : ''}) winOff=${offWin} | gpu.x=0x${xy.x.toString(16).slice(0, 16)}`);
        }
        const bytes = pool.statsBytes();
        msm.destroy();
        pool.destroy();
        if (reps > 1 || seeds.length === 1) log('info', `[mem] logN=${logN}: algorithm buffers = ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
      }
    }

    const failCount = results.filter(r => !r.pass).length;
    device.destroy();
    setStatus(allPass ? 'OK' : 'FAIL', allPass ? 'ok' : 'err');
    (window as any).__result = { state: allPass ? 'done' : 'error', total: results.length, fails: failCount, results, mem };
    await postResult({ state: allPass ? 'done' : 'error', total: results.length, fails: failCount, mem, log: lines });
    log(allPass ? 'ok' : 'err', `SWEEP ${allPass ? 'ALL PASS' : 'FAIL'}: ${results.length - failCount}/${results.length} configs green`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `top-level: ${msg}`);
    setStatus(`THROW: ${(e as Error).message}`, 'err');
    (window as any).__result = { state: 'error', error: msg };
    await postResult({ state: 'error', error: msg, log: lines });
  }
})();
