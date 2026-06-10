// Host side of the GPU Poseidon2 transcript kernel (poseidon2_transcript_test.template.wgsl):
// upload the round constants + internal diagonal once, and a standalone suite that
// checks the GPU round-challenge + c_i update against the CPU Poseidon2 reference
// (which itself matches bb.js poseidon2Hash bit-for-bit).

import { POSEIDON2_RC, POSEIDON2_DIAG_M1 } from '../../src/msm_webgpu/cuzk/poseidon2_consts.js';
import { sumcheckRoundChallenge } from '../../src/msm_webgpu/cuzk/poseidon2_cpu.js';
import {
  create_and_write_sb, create_and_write_ub, create_bind_group_layout, create_bind_group,
  create_compute_pipeline, execute_pipeline, read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import {
  type Suite, type SuiteCtx, WG, sm, mod, makeRng, toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';

const mul = (a: bigint, b: bigint): bigint => mod(a * b);

/** Round-structure bounds {rf_half, p_end, nr, pad} = {4, 60, 64, 0} for the transcript
 * kernel's uniform — runtime bounds keep Metal from unrolling the 56-round loop. */
export function p2ParamsBytes(): Uint8Array {
  const o = new Uint8Array(16);
  const dv = new DataView(o.buffer);
  dv.setUint32(0, 4, true); dv.setUint32(4, 60, true); dv.setUint32(8, 64, true); dv.setUint32(12, 0, true);
  return o;
}

/** IV for hashing 9 field elements (running + 8 univariate evals): (len << 64), Montgomery. */
export const POSEIDON2_IV_9 = (): Uint8Array => {
  const out = new Uint8Array(32);
  writeLe32(out, 0, toMont(mod(9n << 64n)));
  return out;
};

/** Round constants (64*4 Fr) and internal diagonal (4 Fr) as Montgomery bytes, uploaded once. */
export function poseidon2ConstBytes(): { rcBytes: Uint8Array; diagBytes: Uint8Array } {
  const rcBytes = new Uint8Array(64 * 4 * 32);
  for (let i = 0; i < 64; i++) {
    for (let k = 0; k < 4; k++) writeLe32(rcBytes, (i * 4 + k) * 32, toMont(mod(POSEIDON2_RC[i][k])));
  }
  const diagBytes = new Uint8Array(4 * 32);
  for (let k = 0; k < 4; k++) writeLe32(diagBytes, k * 32, toMont(mod(POSEIDON2_DIAG_M1[k])));
  return { rcBytes, diagBytes };
}

async function run({ device, log }: SuiteCtx): Promise<boolean> {
  const layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'read-only-storage', 'uniform',
  ]);
  const pipeline = await create_compute_pipeline(
    device, [layout], sm.gen_poseidon2_transcript_test_shader(WG), 'poseidon2_transcript_main', 'poseidon2_transcript_main',
  );
  const { rcBytes, diagBytes } = poseidon2ConstBytes();
  const rcBuf = create_and_write_sb(device, rcBytes);
  const diagBuf = create_and_write_sb(device, diagBytes);
  const p2pBuf = create_and_write_ub(device, p2ParamsBytes());
  const ivBytes = POSEIDON2_IV_9();

  const rng = makeRng(0x9051d0_7a3c_0n);
  let allOk = true;
  for (let trial = 0; trial < 8; trial++) {
    const running = rng();
    const beta = rng();
    const c = rng();
    const uni = Array.from({ length: 8 }, () => rng());

    const uniBytes = new Uint8Array(8 * 32);
    for (let e = 0; e < 8; e++) writeLe32(uniBytes, e * 32, toMont(uni[e]));
    const runBytes = new Uint8Array(32);
    writeLe32(runBytes, 0, toMont(running));
    const cBytes = new Uint8Array(32);
    writeLe32(cBytes, 0, toMont(c));
    const scalars = new Uint8Array(2 * 32);
    writeLe32(scalars, 0, toMont(beta));
    scalars.set(ivBytes, 32);

    const uniBuf = create_and_write_sb(device, uniBytes);
    const runBuf = create_and_write_sb(device, runBytes);
    const cBuf = create_and_write_sb(device, cBytes);
    const outBuf = create_and_write_sb(device, new Uint8Array(32).fill(0xff));
    const scBuf = create_and_write_sb(device, scalars);

    const bg = create_bind_group(device, layout, [uniBuf, rcBuf, diagBuf, runBuf, cBuf, outBuf, scBuf, p2pBuf]);
    const enc = device.createCommandEncoder();
    await execute_pipeline(enc, pipeline, bg, 1);
    const [outBytes, runOut, cOut] = await read_from_gpu(device, enc, [outBuf, runBuf, cBuf]);

    const { challenge } = sumcheckRoundChallenge(running, uni);
    const cNext = mul(c, mod(1n + mul(challenge, mod(beta - 1n))));

    const gotU = fromMont(le32ToBi(outBytes, 0));
    const gotRunning = fromMont(le32ToBi(runOut, 0));
    const gotC = fromMont(le32ToBi(cOut, 0));
    if (gotU !== challenge) { allOk = false; log('err', `  p2 trial ${trial}: challenge got ${gotU} want ${challenge}`); }
    if (gotRunning !== challenge) { allOk = false; log('err', `  p2 trial ${trial}: running got ${gotRunning} want ${challenge}`); }
    if (gotC !== cNext) { allOk = false; log('err', `  p2 trial ${trial}: c_next got ${gotC} want ${cNext}`); }
  }
  if (allOk) log('ok', `  poseidon2 ✓  GPU transcript challenge + c-update match CPU Poseidon2 (8 trials)`);
  return allOk;
}

export const poseidon2Suite: Suite = { id: 'poseidon2', label: 'Poseidon2 transcript (GPU Fiat-Shamir)', run };
