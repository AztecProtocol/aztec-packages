// In-browser correctness harness for the short-monomial (Mono) WGSL arithmetic
// (Phase-2 step 1 of the sumcheck WebGPU port).
//
// For each Mono op it uploads random edge values (Montgomery 8×u32), dispatches
// the matching kernel entry point, reads back the 7 promoted Lagrange evals,
// converts out of Montgomery form, and diffs them against an independent CPU
// polynomial reference (the same ground truth the no-GPU oracle checks the
// algorithm against). Any mismatch is a hard fail; the first few are printed.
//
// Run: `yarn dev:sumcheck-webgpu`, open /dev/sumcheck-webgpu/mono.html in Chrome,
// click Run. Headless: `node dev/sumcheck-webgpu/drive-fr.mjs 'mono.html?autorun=mono'`.

import {
  get_device,
  create_and_write_sb,
  create_and_write_ub,
  create_sb,
  create_bind_group_layout,
  create_bind_group,
  create_compute_pipeline,
  execute_pipeline,
  read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';

type Level = 'info' | 'ok' | 'err' | 'warn' | 'muted';
const $log = document.getElementById('log') as HTMLDivElement;
const $run = document.getElementById('run') as HTMLButtonElement;
const $logn = document.getElementById('logn') as HTMLInputElement;

function log(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $log.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

const P = BN254_SCALAR_FIELD;
const WG = 64;
const OUT_LEN = 7;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
const R = sm.r;
const RINV = sm.rinv;
const toMont = (x: bigint): bigint => (mod(x) * R) % P;
const fromMont = (y: bigint): bigint => (y * RINV) % P;

function biToLe32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
function le32ToBi(b: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(b[off + i]);
  return v;
}

// ---- polynomial reference (coefficient arrays, mod P) ----
type Poly = bigint[];
const pMul = (a: Poly, b: Poly): Poly => {
  const r: Poly = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j]);
  return r;
};
const pAdd = (a: Poly, b: Poly): Poly =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) + (b[i] ?? 0n)));
const pSub = (a: Poly, b: Poly): Poly =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) - (b[i] ?? 0n)));
const pScale = (a: Poly, s: bigint): Poly => a.map(x => mod(x * s));
const pAddC = (a: Poly, s: bigint): Poly => {
  const r = a.slice();
  r[0] = mod((r[0] ?? 0n) + s);
  return r;
};
const pSubC = (a: Poly, s: bigint): Poly => pAddC(a, mod(-s));
const pNeg = (a: Poly): Poly => a.map(x => mod(-x));
const evalSet = (a: Poly): bigint[] =>
  Array.from({ length: OUT_LEN }, (_, k) => {
    const x = BigInt(k);
    let acc = 0n;
    let xp = 1n;
    for (const c of a) {
      acc = mod(acc + c * xp);
      xp = mod(xp * x);
    }
    return acc;
  });
// edge {v0,v1} as the linear interpolant v0 + (v1-v0)X
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];

// inputs per thread: [a0,a1,b0,b1,c0,c1,d0,d1,s]
type ExpectFn = (e: bigint[], s: bigint) => Poly;
const A = (e: bigint[]) => edgePoly(e[0], e[1]);
const B = (e: bigint[]) => edgePoly(e[2], e[3]);
const C = (e: bigint[]) => edgePoly(e[4], e[5]);
const D = (e: bigint[]) => edgePoly(e[6], e[7]);
const OPS: { entry: string; expect: ExpectFn }[] = [
  { entry: 'mono_edge_promote', expect: e => A(e) },
  { entry: 'mono_mul_cc_main', expect: e => pMul(A(e), B(e)) },
  { entry: 'mono_mul_gg_main', expect: (e, s) => pMul(pSubC(A(e), s), pSubC(B(e), s)) },
  { entry: 'mono_sqr_c_main', expect: e => pMul(A(e), A(e)) },
  { entry: 'mono_sqr_g_main', expect: (e, s) => pMul(pSubC(A(e), s), pSubC(A(e), s)) },
  { entry: 'mono_sub_main', expect: e => pSub(pMul(A(e), B(e)), pMul(C(e), D(e))) },
  { entry: 'mono_add_main', expect: e => pAdd(pMul(A(e), B(e)), pMul(C(e), D(e))) },
  { entry: 'mono_scalar_main', expect: (e, s) => pScale(pMul(A(e), B(e)), s) },
  { entry: 'mono_add_scalar_main', expect: (e, s) => pAddC(pMul(A(e), B(e)), s) },
  { entry: 'mono_neg_main', expect: e => pNeg(pMul(A(e), B(e))) },
];

let seed = 0xa5a5_1234_dead_beefn;
const rnd = (): bigint => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
  return mod(seed >> 2n);
};

async function run(): Promise<boolean> {
  $run.disabled = true;
  $log.replaceChildren();
  let allOk = true;
  try {
    const n = 1 << Math.max(4, Math.min(20, parseInt($logn.value, 10) || 14));
    log('info', `Mono short-monomial WGSL — n=${n} (2^${Math.log2(n)}) per op`);

    const device = await get_device();
    const code = sm.gen_mono_ops_test_shader(WG);
    const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform']);
    const pipelines: Record<string, GPUComputePipeline> = {};
    for (const { entry } of OPS) pipelines[entry] = await create_compute_pipeline(device, [layout], code, entry, entry);
    log('ok', `compiled ${OPS.length} entry points`);

    // Row 0 is a fixed regression for the montgomery non-canonical (≥2p) path:
    // A=(0, a1) and B=(0, b1) make A.c1=a1, B.c1=b1, and montmul(a1,b1) reduces to
    // a value ≥ 2p — which mono_neg/mono_sub expose unless conditional_reduce fully
    // canonicalizes. Keeps the regression independent of the random seed and `n`.
    const TRIGGER = [
      0n,
      939307639465374932647448609882611505824244567973771368353441656731307668302n,
      0n,
      1373820220876102643954906121899991107507286105563010266357646197072060934766n,
      0n, 0n, 0n, 0n, 0n,
    ];
    // inputs: 9 Fr/thread, Montgomery. plain values kept for the reference.
    const plain: bigint[][] = [];
    const inBytes = new Uint8Array(n * 9 * 32);
    for (let i = 0; i < n; i++) {
      const row = i === 0 ? TRIGGER : [...Array.from({ length: 8 }, () => rnd()), rnd()];
      plain.push(row);
      for (let j = 0; j < 9; j++) inBytes.set(biToLe32(toMont(row[j])), (i * 9 + j) * 32);
    }
    const inBuf = create_and_write_sb(device, inBytes);
    const outBuf = create_sb(device, n * OUT_LEN * 32);
    const params = new Uint8Array(16);
    new DataView(params.buffer).setUint32(0, n, true);
    const paramsBuf = create_and_write_ub(device, params);
    const bg = create_bind_group(device, layout, [inBuf, outBuf, paramsBuf]);
    const numWg = Math.ceil(n / WG);

    for (const { entry, expect } of OPS) {
      const t0 = performance.now();
      const enc = device.createCommandEncoder();
      await execute_pipeline(enc, pipelines[entry], bg, numWg);
      const [bytes] = await read_from_gpu(device, enc, [outBuf]);
      const ms = performance.now() - t0;

      let mismatches = 0;
      let first = '';
      for (let i = 0; i < n; i++) {
        const want = evalSet(expect(plain[i].slice(0, 8), plain[i][8]));
        for (let k = 0; k < OUT_LEN; k++) {
          const got = fromMont(le32ToBi(bytes, (i * OUT_LEN + k) * 32));
          if (got !== want[k]) {
            mismatches++;
            if (mismatches <= 3) first += `\n    i=${i} k=${k} got=${got} want=${want[k]}`;
          }
        }
      }
      const name = entry.replace('mono_', '').replace('_main', '');
      if (mismatches === 0) {
        log('ok', `  ${name.padEnd(12)} ✓  ${n}×${OUT_LEN} evals match  (${ms.toFixed(1)} ms)`);
      } else {
        allOk = false;
        log('err', `  ${name.padEnd(12)} ✗  ${mismatches} MISMATCH${first}`);
      }
    }
    log(allOk ? 'ok' : 'err', allOk ? 'ALL MONO OPS CORRECT' : 'FAILURES DETECTED');
  } catch (e) {
    allOk = false;
    log('err', `exception: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    $run.disabled = false;
    log('muted', `[autorun] state=${allOk ? 'ok' : 'err'}`);
  }
  return allOk;
}

$run.addEventListener('click', () => void run());
if (new URLSearchParams(window.location.search).get('autorun') === 'mono') {
  void run();
}
