// WASM-free, network-free WebGPU MSM correctness cross-check.
//
// Generates deterministic BN254 points (multiples of the generator) and
// random Fr scalars entirely in-page, runs the WebGPU MSM pipeline, and
// compares the affine result against a CPU reference computed by noble.
// Sized for SwiftShader: small logn only (8 and 10 by default). This is the
// only correctness oracle that runs on a GPU-less host — the noble bigint
// MSM is the ground truth, and no cross-origin isolation / WASM threads are
// required.
//
// Driven headlessly by xcheck-driver.mjs; reports OK / FAIL via #status so
// playwright can scrape it. Append ?engine=<name>&logns=8,10 to select the
// backend and sizes.

import { bn254 } from '@noble/curves/bn254';

import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { MsmV2, MsmV2Pool } from '../../src/msm_webgpu/msm_v2.js';
import { buildGlvInputs } from '../../src/msm_webgpu/cuzk/glv.js';

const $status = document.getElementById('status')!;
const $log = document.getElementById('log')!;
const lines: string[] = [];
function log(msg: string) {
  console.log(msg);
  lines.push(msg);
  $log.textContent = lines.join('\n');
}
function setStatus(t: string) {
  $status.textContent = t;
}

const q = new URLSearchParams(location.search);
const LOGNS = (q.get('logns') ?? '8,10').split(',').map(s => parseInt(s, 10));
const GLV = q.get('glv') === '1';

function biToLe32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

const FR_ORDER = bn254.fields.Fr.ORDER;
// Cheap deterministic LCG so runs reproduce across reloads.
let prng = 0x12345678 >>> 0;
function randFr(): bigint {
  for (;;) {
    let v = 0n;
    for (let i = 0; i < 8; i++) {
      prng = (Math.imul(prng, 1664525) + 1013904223) >>> 0;
      v = (v << 32n) | BigInt(prng >>> 0);
    }
    v &= (1n << 254n) - 1n;
    if (v < FR_ORDER) return v;
  }
}

interface Inputs {
  n: number;
  pointsBuf: Uint8Array;
  scalarsBuf: Uint8Array;
  affine: { x: bigint; y: bigint }[];
  scalars: bigint[];
}

function genInputs(n: number): Inputs {
  const pointsBuf = new Uint8Array(n * 64);
  const scalarsBuf = new Uint8Array(n * 32);
  const affine: { x: bigint; y: bigint }[] = new Array(n);
  const scalars: bigint[] = new Array(n);
  // Random group elements P_i = [r_i] G with independent random r_i. Mimics
  // the statistical structure of a real SRS: the batch-affine accumulator
  // skips dx==0 collisions silently (valid only when collisions are
  // dlog-unreachable), so structured points like [i+1]G would break it.
  const G = bn254.G1.ProjectivePoint.BASE;
  for (let i = 0; i < n; i++) {
    const a = G.multiply(randFr()).toAffine();
    affine[i] = a;
    pointsBuf.set(biToLe32(a.x), i * 64);
    pointsBuf.set(biToLe32(a.y), i * 64 + 32);
    const s = randFr();
    scalars[i] = s;
    scalarsBuf.set(biToLe32(s), i * 32);
  }
  return { n, pointsBuf, scalarsBuf, affine, scalars };
}

function reference(inp: Inputs): { x: bigint; y: bigint } {
  const pts = inp.affine.map(p => bn254.G1.ProjectivePoint.fromAffine(p));
  const r = bn254.G1.ProjectivePoint.msm(pts, inp.scalars);
  return r.toAffine();
}

(async () => {
  try {
    log(`requesting WebGPU device...`);
    const device = await get_device();
    const failures: string[] = [];

    for (const logN of LOGNS) {
      const n = 1 << logN;
      log(`--- logN=${logN} (n=${n}) ---`);
      const inp = genInputs(n);
      log(`  generated ${n} points + scalars`);

      const ref = reference(inp);
      log(`  noble ref x=0x${ref.x.toString(16).slice(0, 16)}...`);

      // In GLV mode, transform the n-pair 254-bit MSM into a 2n-pair 128-bit
      // MSM (Σ k1ᵢ Pᵢ + Σ k2ᵢ φPᵢ) and run with scalarBits=128. The expected
      // result is unchanged — still Σ kᵢ Pᵢ — so we compare to the same noble
      // reference.
      let runN = n;
      let pts = inp.pointsBuf;
      let scs = inp.scalarsBuf;
      const cfg: { scalarBits?: number } = {};
      if (GLV) {
        const g = buildGlvInputs(inp.pointsBuf, inp.scalarsBuf, n);
        runN = 2 * n;
        pts = g.pointsBuf;
        scs = g.scalarsBuf;
        cfg.scalarBits = 128;
        log(`  GLV: ${runN} pairs, scalarBits=128, max |kᵢ|=${g.maxBits} bits`);
      }

      const pool = await MsmV2Pool.create(device, pts);
      const msm = await MsmV2.create(device, runN, pool, cfg);
      msm.prepare(scs);
      await msm.run(); // first-use warm
      const got = await msm.run();
      log(`  webgpu   x=0x${got.x.toString(16).slice(0, 16)}... (c=${got.c})`);

      const ok = got.x === ref.x && got.y === ref.y;
      log(`  ${ok ? 'PASS' : 'FAIL'} logN=${logN}`);
      if (!ok) {
        failures.push(`logN=${logN}: got(${got.x},${got.y}) ref(${ref.x},${ref.y})`);
      }
      msm.destroy();
      pool.destroy();
    }

    if (failures.length === 0) {
      setStatus('OK');
      log(`ALL PASS (${LOGNS.join(',')})`);
    } else {
      setStatus('FAIL');
      for (const f of failures) log(f);
    }
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    setStatus(`THROW: ${e instanceof Error ? e.message : String(e)}`);
    log(`top-level throw: ${msg}`);
  }
})();
