// Suite: BN254 F_r Montgomery primitives (add/sub/mul/neg/inv) on the 8x u32
// form, diffed against the CPU bn254ScalarField reference. Phase 0.

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
import { bn254ScalarField } from '../../src/msm_webgpu/cuzk/bn254.js';
import { type Suite, type SuiteCtx, P, R, WG, sm, toMont, fromMont, biToLe32, le32ToBi, makeRng } from './harness.js';

const ENTRY_POINTS = ['fr_add_main', 'fr_sub_main', 'fr_mul_main', 'fr_neg_main', 'fr_inv_main'] as const;
type EntryPoint = (typeof ENTRY_POINTS)[number];

function cpuExpected(op: EntryPoint, x: bigint, y: bigint): bigint {
  switch (op) {
    case 'fr_add_main': return bn254ScalarField.add(x, y);
    case 'fr_sub_main': return bn254ScalarField.sub(x, y);
    case 'fr_mul_main': return bn254ScalarField.mul(x, y);
    case 'fr_neg_main': return bn254ScalarField.neg(x);
    case 'fr_inv_main': return x === 0n ? 0n : bn254ScalarField.inv(x); // GPU returns 0 for inv(0)
  }
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x9e3779b97f4a7c15n);
  // edge cases first so failures surface on interesting values
  const edges = [0n, 1n, 2n, P - 1n, P - 2n, R % P, (P - 1n) / 2n, (1n << 253n) % P];
  const a: bigint[] = [];
  const b: bigint[] = [];
  for (const x of edges) for (const y of edges) { a.push(x); b.push(y); }
  while (a.length < n) { a.push(rng()); b.push(rng()); }
  a.length = n; b.length = n;

  const pack = (vals: bigint[]): Uint8Array => {
    const out = new Uint8Array(vals.length * 32);
    for (let i = 0; i < vals.length; i++) out.set(biToLe32(toMont(vals[i])), i * 32);
    return out;
  };

  const code = sm.gen_fr_ops_test_shader(WG);
  const layout = create_bind_group_layout(device, ['read-only-storage', 'read-only-storage', 'storage', 'uniform']);
  const aBuf = create_and_write_sb(device, pack(a));
  const bBuf = create_and_write_sb(device, pack(b));
  const outBuf = create_sb(device, n * 32);
  const params = new Uint8Array(16);
  new DataView(params.buffer).setUint32(0, n, true);
  const bindGroup = create_bind_group(device, layout, [aBuf, bBuf, outBuf, create_and_write_ub(device, params)]);
  const numWg = Math.ceil(n / WG);

  let allOk = true;
  for (const ep of ENTRY_POINTS) {
    const pipeline = await create_compute_pipeline(device, [layout], code, ep, ep);
    const t0 = performance.now();
    const enc = device.createCommandEncoder();
    await execute_pipeline(enc, pipeline, bindGroup, numWg);
    const [bytes] = await read_from_gpu(device, enc, [outBuf]);
    const ms = performance.now() - t0;
    let mism = 0;
    let first = '';
    for (let i = 0; i < n; i++) {
      const got = fromMont(le32ToBi(bytes, i * 32));
      const want = cpuExpected(ep, a[i], b[i]);
      if (got !== want) { mism++; if (mism <= 3) first += `\n    i=${i} a=${a[i]} b=${b[i]}\n      got =${got}\n      want=${want}`; }
    }
    const name = ep.replace('fr_', '').replace('_main', '');
    if (mism === 0) log('ok', `  ${name.padEnd(7)} ✓  ${n}/${n} match  (${ms.toFixed(1)} ms)`);
    else { allOk = false; log('err', `  ${name.padEnd(7)} ✗  ${mism} MISMATCH${first}`); }
  }
  return allOk;
}

export const frSuite: Suite = { id: 'fr', label: 'Fr primitives', run };
