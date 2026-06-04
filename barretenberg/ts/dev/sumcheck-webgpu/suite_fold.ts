// Suite: sumcheck fold (partially_evaluate). Folds NUM_COLS columns of length n
// by dest[k] = src[2k] + u*(src[2k+1] - src[2k]) and diffs against the CPU
// reference (fold.ts). NUM_COLS mirrors the 62 MegaFlavor columns the real fold
// processes each round. One thread per output element; challenge u at binding(3).

import {
  create_and_write_sb, create_and_write_ub, create_sb,
  create_bind_group_layout, create_bind_group, create_compute_pipeline,
  execute_pipeline, read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import { fold as cpuFold } from '../../src/msm_webgpu/fold.js';
import {
  type Suite, type SuiteCtx,
  WG, sm, makeRng, toMont, fromMont, biToLe32, le32ToBi, packParams,
} from './harness.js';

const NUM_COLS = 62;

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  if (n % 2 !== 0) { log('err', '  fold: n must be even'); return false; }
  const rng = makeRng(0xf01dac0ffee00001n);
  const u = rng();
  const halfLen = n / 2;
  const numOut = NUM_COLS * halfLen;

  const cols: bigint[][] = [];
  const inBytes = new Uint8Array(NUM_COLS * n * 32);
  for (let c = 0; c < NUM_COLS; c++) {
    const col: bigint[] = [];
    for (let i = 0; i < n; i++) {
      const v = rng();
      col.push(v);
      inBytes.set(biToLe32(toMont(v)), (c * n + i) * 32);
    }
    cols.push(col);
  }

  const code = sm.gen_fold_test_shader(WG);
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
  const inBuf = create_and_write_sb(device, inBytes);
  const outBuf = create_sb(device, numOut * 32);
  const params = new Uint8Array(16);
  const dv = new DataView(params.buffer);
  dv.setUint32(0, numOut, true);
  dv.setUint32(4, halfLen, true);
  const bg = create_bind_group(device, layout, [
    inBuf, outBuf, create_and_write_ub(device, params), create_and_write_sb(device, packParams([u])),
  ]);
  const pipeline = await create_compute_pipeline(device, [layout], code, 'fold_main', 'fold_main');

  const t0 = performance.now();
  const enc = device.createCommandEncoder();
  await execute_pipeline(enc, pipeline, bg, Math.ceil(numOut / WG));
  const [bytes] = await read_from_gpu(device, enc, [outBuf]);
  const ms = performance.now() - t0;

  let mism = 0;
  let first = '';
  for (let c = 0; c < NUM_COLS; c++) {
    const want = cpuFold(cols[c], u);
    for (let k = 0; k < halfLen; k++) {
      const got = fromMont(le32ToBi(bytes, (c * halfLen + k) * 32));
      if (got !== want[k]) { mism++; if (mism <= 4) first += `\n    c=${c} k=${k} got=${got} want=${want[k]}`; }
    }
  }
  if (mism === 0) {
    log('ok', `  fold ✓  ${NUM_COLS}×${n} → ${NUM_COLS}×${halfLen} match  (${ms.toFixed(1)} ms)`);
    return true;
  }
  log('err', `  fold ✗  ${mism}/${numOut} MISMATCH${first}`);
  return false;
}

export const foldSuite: Suite = { id: 'fold', label: 'Fold (partially_evaluate)', run };
