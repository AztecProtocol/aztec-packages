// Suite: MegaFlavor ArithmeticRelation accumulate. The 11-Fr per-edge
// contribution is diffed against a polynomial reference of
// ultra_arithmetic_relation.hpp. Rows 0-3 force q_arith ∈ {0,1,2,3}.

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
  type Suite, type SuiteCtx,
  WG, sm, mod, modinv, toMont, fromMont, biToLe32, le32ToBi, makeRng,
  pMul, pAdd, pSub, pScale, pSubC, edgePoly, evalSet,
} from './harness.js';

const IN_LEN = 27; // 13 entity edges (v0,v1) + scaling
const OUT_LEN = 11; // subrel0 (6) + subrel1 (5)
const NEG_HALF = mod(-modinv(2n));

// e = 13 entity edges (each [v0,v1]) in the kernel's order + scaling scalar.
function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_4s, w_ls, q_m, q_l, q_r, q_o, q_4, q_c, q_arith] = e.map(([a, b]) => edgePoly(a, b));
  const scaled = pScale(q_arith, scaling);
  const tmp0 = pMul(pScale(pMul(w_r, w_l), NEG_HALF), pMul(pSubC(q_arith, 3n), q_m));
  let tmp1 = pAdd(pAdd(pAdd(pMul(q_l, w_l), pMul(q_r, w_r)), pMul(q_o, w_o)), pMul(q_4, w_4));
  tmp1 = pAdd(tmp1, q_c);
  tmp1 = pAdd(tmp1, pMul(pSubC(q_arith, 1n), w_4s));
  const sub0 = evalSet(pMul(pAdd(tmp0, tmp1), scaled), 6);
  const t0 = pAdd(pSub(pAdd(w_l, w_4), w_ls), q_m);
  const sub1 = evalSet(pMul(pMul(t0, pSubC(q_arith, 2n)), pMul(pSubC(q_arith, 1n), scaled)), 5);
  return [...sub0, ...sub1];
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x1badb002c0defacen);
  const inputs: { e: bigint[][]; s: bigint }[] = [];
  const inBytes = new Uint8Array(n * IN_LEN * 32);
  for (let i = 0; i < n; i++) {
    const e: bigint[][] = Array.from({ length: 13 }, () => [rng(), rng()]);
    if (i < 4) e[12] = [BigInt(i), BigInt(i)]; // q_arith = 0,1,2,3
    const s = rng();
    inputs.push({ e, s });
    for (let j = 0; j < 13; j++) {
      inBytes.set(biToLe32(toMont(e[j][0])), (i * IN_LEN + 2 * j) * 32);
      inBytes.set(biToLe32(toMont(e[j][1])), (i * IN_LEN + 2 * j + 1) * 32);
    }
    inBytes.set(biToLe32(toMont(s)), (i * IN_LEN + 26) * 32);
  }

  const code = sm.gen_arithmetic_relation_test_shader(WG);
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform']);
  const inBuf = create_and_write_sb(device, inBytes);
  const outBuf = create_sb(device, n * OUT_LEN * 32);
  const params = new Uint8Array(16);
  new DataView(params.buffer).setUint32(0, n, true);
  const bg = create_bind_group(device, layout, [inBuf, outBuf, create_and_write_ub(device, params)]);
  const pipeline = await create_compute_pipeline(device, [layout], code, 'arithmetic_main', 'arithmetic_main');

  const t0 = performance.now();
  const enc = device.createCommandEncoder();
  await execute_pipeline(enc, pipeline, bg, Math.ceil(n / WG));
  const [bytes] = await read_from_gpu(device, enc, [outBuf]);
  const ms = performance.now() - t0;

  let mism = 0;
  let first = '';
  for (let i = 0; i < n; i++) {
    const want = polyRef(inputs[i].e, inputs[i].s);
    for (let k = 0; k < OUT_LEN; k++) {
      const got = fromMont(le32ToBi(bytes, (i * OUT_LEN + k) * 32));
      if (got !== want[k]) { mism++; if (mism <= 4) first += `\n    i=${i} k=${k} got=${got} want=${want[k]}`; }
    }
  }
  if (mism === 0) { log('ok', `  arithmetic ✓  ${n}×${OUT_LEN} match  (${ms.toFixed(1)} ms)`); return true; }
  log('err', `  arithmetic ✗  ${mism}/${n * OUT_LEN} MISMATCH${first}`);
  return false;
}

export const arithSuite: Suite = { id: 'arith', label: 'Arithmetic', run };
