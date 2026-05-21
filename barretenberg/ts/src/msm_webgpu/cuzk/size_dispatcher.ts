import { TrivialMsm } from "./trivial_msm.js";

/**
 * Per-`logN` `NUM_THREAD_MULS` (= `k`) recommendation derived from the
 * P8 BrowserStack M2 confirmation sweep (Apple M2 base, macOS Sequoia,
 * Chrome 148, `hardwareConcurrency=8`; reps=5, warmup=2).
 *
 * Best-`k` was `1` across every logN in `[4, 11]` and `2` at logN=12,
 * with cell time growing monotonically with `k` over the sweep — i.e.
 * the per-thread doubling cost the plan expected to amortise away
 * didn't, because the lookup_precompute + straus_main + log2(T)
 * combine_fold + to_affine dispatch chain has a ~17 ms fixed encoder
 * tail on M2 that dominates at every swept size. Sizes outside the
 * sweep fall back to `PICK_NTM_DEFAULT`.
 */
const PICK_NTM_TABLE: Readonly<Record<number, number>> = {
  4: 1,
  5: 1,
  6: 1,
  7: 1,
  8: 1,
  9: 1,
  10: 1,
  11: 1,
  12: 2,
};
const PICK_NTM_DEFAULT = 1;

/**
 * Largest `n` where the TrivialMsm small-MSM path is faster than MsmV2.
 *
 * The P8 M2 sweep found NO logN in `[4, 12]` where TrivialMsm beats the
 * production MsmV2 Pippenger pipeline — TrivialMsm's median is 0.34x-0.74x
 * MsmV2's at every cell (MsmV2 wins everywhere, ratio worsens as N grows).
 * Setting the crossover to `0` makes `compute_bn254_msm_auto` always route
 * to MsmV2 by default; the M2 sweep result lives in PR #23475's gist for
 * future reference. Raise this constant once an optimisation lands that
 * actually moves the crossover into TrivialMsm's favour at some N.
 */
export const PICK_NTM_CROSSOVER_N = 0;

/**
 * Choose the per-thread chunk size `k` (NUM_THREAD_MULS) for a given
 * problem size `n`. Looks up the M2 table by `Math.ceil(log2(n))` and
 * falls back to `PICK_NTM_DEFAULT` outside the swept range.
 */
export function pickNtm(n: number): number {
  if (n <= 0) return PICK_NTM_DEFAULT;
  const logN = Math.max(0, Math.ceil(Math.log2(n)));
  return PICK_NTM_TABLE[logN] ?? PICK_NTM_DEFAULT;
}

/**
 * Size-routed BN254 MSM entry point. Routes `n ≤ PICK_NTM_CROSSOVER_N` to
 * the `TrivialMsm` small-MSM path with `k = pickNtm(n)`, falls through to
 * the production MsmV2 Pippenger path otherwise.
 *
 * `pointsBuf`: n × 64 LE bytes (32 for x, 32 for y; matches the MsmV2 SoA
 * input format).
 * `scalarsBuf`: n × 32 LE bytes.
 *
 * The fallback MsmV2 import lives in `dev/msm-webgpu/msm_v2.ts` today; the
 * dispatcher takes it as a parameter so this file stays buildable in the
 * `src/` tree without pulling `dev/` into the production bundle. P9.1
 * (follow-up) moves MsmV2 into `src/` and removes the parameter.
 */
export async function compute_bn254_msm_auto(
  device: GPUDevice,
  n: number,
  pointsBuf: Uint8Array,
  scalarsBuf: Uint8Array,
  fallback: {
    create: (
      device: GPUDevice,
      n: number,
      pointsBuf: Uint8Array,
    ) => Promise<{
      prepare: (scalarsBuf: Uint8Array) => void;
      run: () => Promise<{ x: bigint; y: bigint }>;
      destroy: () => void;
    }>;
  },
): Promise<{ x: bigint; y: bigint }> {
  if (n <= PICK_NTM_CROSSOVER_N) {
    const trivial = await TrivialMsm.create(device, n, pointsBuf, pickNtm(n));
    try {
      trivial.prepare(scalarsBuf);
      return await trivial.run();
    } finally {
      trivial.destroy();
    }
  }
  const m = await fallback.create(device, n, pointsBuf);
  try {
    m.prepare(scalarsBuf);
    return await m.run();
  } finally {
    m.destroy();
  }
}
