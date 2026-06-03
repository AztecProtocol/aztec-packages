// Suite: short-monomial (Mono) WGSL arithmetic — the UnivariateCoefficientBasis
// mirror. Each op's 7 promoted Lagrange evals are diffed against the polynomial
// reference. Row 0 is a fixed regression for the montgomery non-canonical path.

import {
  create_and_write_sb,
  create_and_write_ub,
  create_sb,
  create_bind_group_layout,
  create_bind_group,
  create_compute_pipeline,
  execute_pipeline,
  read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import {
  type Suite, type SuiteCtx, type Poly,
  WG, sm, toMont, fromMont, biToLe32, le32ToBi, makeRng,
  pMul, pAdd, pSub, pScale, pAddC, pSubC, pNeg, edgePoly, evalSet,
} from './harness.js';

const OUT_LEN = 7;
type Expect = (e: bigint[], s: bigint) => Poly;
const A = (e: bigint[]) => edgePoly(e[0], e[1]);
const B = (e: bigint[]) => edgePoly(e[2], e[3]);
const C = (e: bigint[]) => edgePoly(e[4], e[5]);
const D = (e: bigint[]) => edgePoly(e[6], e[7]);
const OPS: { entry: string; expect: Expect }[] = [
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

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0xa5a51234deadbeefn);
  // Row 0: a fixed trigger for the montgomery non-canonical (>=2p) path —
  // A.c1=a1, B.c1=b1 with montmul(a1,b1) reducing to >= 2p. Seed-independent.
  const TRIGGER = [
    0n, 939307639465374932647448609882611505824244567973771368353441656731307668302n,
    0n, 1373820220876102643954906121899991107507286105563010266357646197072060934766n,
    0n, 0n, 0n, 0n, 0n,
  ];
  const plain: bigint[][] = [];
  const inBytes = new Uint8Array(n * 9 * 32);
  for (let i = 0; i < n; i++) {
    const row = i === 0 ? TRIGGER : [...Array.from({ length: 8 }, () => rng()), rng()];
    plain.push(row);
    for (let j = 0; j < 9; j++) inBytes.set(biToLe32(toMont(row[j])), (i * 9 + j) * 32);
  }

  const code = sm.gen_mono_ops_test_shader(WG);
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform']);
  const inBuf = create_and_write_sb(device, inBytes);
  const outBuf = create_sb(device, n * OUT_LEN * 32);
  const params = new Uint8Array(16);
  new DataView(params.buffer).setUint32(0, n, true);
  const bg = create_bind_group(device, layout, [inBuf, outBuf, create_and_write_ub(device, params)]);
  const numWg = Math.ceil(n / WG);

  let allOk = true;
  for (const { entry, expect } of OPS) {
    const pipeline = await create_compute_pipeline(device, [layout], code, entry, entry);
    const t0 = performance.now();
    const enc = device.createCommandEncoder();
    await execute_pipeline(enc, pipeline, bg, numWg);
    const [bytes] = await read_from_gpu(device, enc, [outBuf]);
    const ms = performance.now() - t0;
    let mism = 0;
    let first = '';
    for (let i = 0; i < n; i++) {
      const want = evalSet(expect(plain[i].slice(0, 8), plain[i][8]), OUT_LEN);
      for (let k = 0; k < OUT_LEN; k++) {
        const got = fromMont(le32ToBi(bytes, (i * OUT_LEN + k) * 32));
        if (got !== want[k]) { mism++; if (mism <= 3) first += `\n    i=${i} k=${k} got=${got} want=${want[k]}`; }
      }
    }
    const name = entry.replace('mono_', '').replace('_main', '');
    if (mism === 0) log('ok', `  ${name.padEnd(12)} ✓  ${n}×${OUT_LEN} match  (${ms.toFixed(1)} ms)`);
    else { allOk = false; log('err', `  ${name.padEnd(12)} ✗  ${mism} MISMATCH${first}`); }
  }
  return allOk;
}

export const monoSuite: Suite = { id: 'mono', label: 'Mono', run };
