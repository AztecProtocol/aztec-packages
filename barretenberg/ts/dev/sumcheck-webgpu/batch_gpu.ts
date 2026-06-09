// Host side of the GPU batch_over_relations kernel (batch_test.template.wgsl):
// precompute the two constant matrices (li/ld) and the pow coefficients, and a
// standalone suite that validates the kernel against the CPU batchOverRelations.
//
// The kernel computes, per eval point e in 0..7:
//   uni[e] = (sum_idx li[e][idx]*acc[idx]) * extRandom[e] * c_i  +  sum_idx ld[e][idx]*acc[idx]
// li/ld fold alpha^g and the barycentric extend-to-8 coefficients of each
// subrelation (li = linearly-independent subrels, ld = dependent); extRandom[e] =
// a_e + b_e*beta_i. This reformulation is proven equal to batchOverRelations.

import {
  SUBREL_LEN, SUBREL_START, SUBREL_LIN_INDEP, NUM_SUBRELATIONS, ACC_LEN, BATCHED_LEN,
  extendTo, batchOverRelations,
} from '../../src/msm_webgpu/batch_tail.js';
import {
  create_and_write_sb, create_bind_group_layout, create_bind_group,
  create_compute_pipeline, execute_pipeline, read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import {
  type Suite, type SuiteCtx, WG, sm, P, mod, makeRng, toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';

const mul = (a: bigint, b: bigint): bigint => mod(a * b);
const add = (a: bigint, b: bigint): bigint => mod(a + b);

export interface BatchConsts {
  liBytes: Uint8Array; // BATCHED_LEN*ACC_LEN Fr, Montgomery
  ldBytes: Uint8Array;
  powBytes: Uint8Array; // 2*BATCHED_LEN Fr: a[0..7] then b[0..7], Montgomery
}

/**
 * Build the GPU batch matrices for a given subrelation-separator `alpha`. alpha is
 * fixed for a whole sumcheck run, so these are computed once at engine setup.
 */
export function buildBatchConsts(alpha: bigint): BatchConsts {
  const li = Array.from({ length: BATCHED_LEN }, () => new Array<bigint>(ACC_LEN).fill(0n));
  const ld = Array.from({ length: BATCHED_LEN }, () => new Array<bigint>(ACC_LEN).fill(0n));
  let alphaPow = 1n;
  for (let g = 0; g < NUM_SUBRELATIONS; g++) {
    if (g > 0) alphaPow = mul(alphaPow, alpha); // alpha^g (alpha^0 = 1 for g=0)
    const L = SUBREL_LEN[g];
    const st = SUBREL_START[g];
    const tgt = SUBREL_LIN_INDEP[g] ? li : ld;
    for (let j = 0; j < L; j++) {
      const unit = new Array<bigint>(L).fill(0n);
      unit[j] = 1n;
      const col = extendTo(unit, BATCHED_LEN); // col[e] = extend-to-8 coefficient C[e][j]
      for (let e = 0; e < BATCHED_LEN; e++) {
        tgt[e][st + j] = add(tgt[e][st + j], mul(alphaPow, col[e]));
      }
    }
  }
  const a = extendTo([1n, 0n], BATCHED_LEN); // extRandom at beta=0
  const b1 = extendTo([1n, 1n], BATCHED_LEN);
  const b = b1.map((v, e) => mod(v - a[e]));

  const liBytes = new Uint8Array(BATCHED_LEN * ACC_LEN * 32);
  const ldBytes = new Uint8Array(BATCHED_LEN * ACC_LEN * 32);
  for (let e = 0; e < BATCHED_LEN; e++) {
    for (let idx = 0; idx < ACC_LEN; idx++) {
      writeLe32(liBytes, (e * ACC_LEN + idx) * 32, toMont(li[e][idx]));
      writeLe32(ldBytes, (e * ACC_LEN + idx) * 32, toMont(ld[e][idx]));
    }
  }
  const powBytes = new Uint8Array(2 * BATCHED_LEN * 32);
  for (let e = 0; e < BATCHED_LEN; e++) {
    writeLe32(powBytes, e * 32, toMont(a[e]));
    writeLe32(powBytes, (BATCHED_LEN + e) * 32, toMont(b[e]));
  }
  return { liBytes, ldBytes, powBytes };
}

/** Pack [beta_i, c_i] as Montgomery bytes for the kernel's scalars buffer. */
export function packBatchScalars(beta: bigint, ci: bigint): Uint8Array {
  const out = new Uint8Array(2 * 32);
  writeLe32(out, 0, toMont(mod(beta)));
  writeLe32(out, 32, toMont(mod(ci)));
  return out;
}

async function run({ device, log }: SuiteCtx): Promise<boolean> {
  const layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage',
  ]);
  const pipeline = await create_compute_pipeline(device, [layout], sm.gen_batch_test_shader(WG), 'batch_main', 'batch_main');

  const rng = makeRng(0xba7c_0def_1234n);
  let allOk = true;
  for (let trial = 0; trial < 6; trial++) {
    const alpha = rng();
    const beta = rng();
    const ci = rng();
    const acc = Array.from({ length: ACC_LEN }, () => rng());

    const { liBytes, ldBytes, powBytes } = buildBatchConsts(alpha);
    const accBytes = new Uint8Array(ACC_LEN * 32);
    for (let i = 0; i < ACC_LEN; i++) writeLe32(accBytes, i * 32, toMont(acc[i]));

    const accBuf = create_and_write_sb(device, accBytes);
    const liBuf = create_and_write_sb(device, liBytes);
    const ldBuf = create_and_write_sb(device, ldBytes);
    const powBuf = create_and_write_sb(device, powBytes);
    const scBuf = create_and_write_sb(device, packBatchScalars(beta, ci));
    const outBuf = create_and_write_sb(device, new Uint8Array(BATCHED_LEN * 32).fill(0xff));

    const bg = create_bind_group(device, layout, [accBuf, liBuf, ldBuf, powBuf, scBuf, outBuf]);
    const enc = device.createCommandEncoder();
    await execute_pipeline(enc, pipeline, bg, Math.ceil(BATCHED_LEN / WG));
    const [bytes] = await read_from_gpu(device, enc, [outBuf]);

    const want = batchOverRelations(acc, alpha, beta, ci);
    for (let e = 0; e < BATCHED_LEN; e++) {
      const got = fromMont(le32ToBi(bytes, e * 32));
      if (got !== want[e]) {
        allOk = false;
        log('err', `  batch trial ${trial} e=${e}: got ${got} want ${want[e]}`);
      }
    }
  }
  if (allOk) log('ok', `  batch ✓  GPU batch_over_relations matches CPU (6 trials × 8 evals)  ·  p = ${P}`);
  return allOk;
}

export const batchSuite: Suite = { id: 'batch', label: 'Batch (round univariate on GPU)', run };
