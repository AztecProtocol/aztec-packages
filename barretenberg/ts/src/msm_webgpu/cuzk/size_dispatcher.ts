import { TrivialMsm } from "./trivial_msm.js";

/**
 * Per-`logN` `NUM_THREAD_MULS` (= `k`) recommendation populated from the
 * P8 BrowserStack M2 confirmation run. Sizes outside the keys fall back
 * to `PICK_NTM_DEFAULT`.
 *
 * The numbers below are placeholders sized from static reasoning about
 * the algorithm (more threads at smaller `n` so the per-chunk doubling
 * cost amortises). They must be replaced with the actual M2 medians
 * once the P8 driver lands a confirmed JSONL on the gist.
 */
const PICK_NTM_TABLE: Readonly<Record<number, number>> = {
  4: 1,
  5: 1,
  6: 1,
  7: 2,
  8: 2,
  9: 3,
  10: 4,
  11: 4,
  12: 6,
  13: 8,
  14: 8,
  15: 12,
  16: 16,
};
const PICK_NTM_DEFAULT = 16;

/**
 * Largest `n` where the TrivialMsm small-MSM path is faster than MsmV2.
 * Replace with the actual M2 crossover once P8 measures it. Below the
 * crossover the dispatcher routes to TrivialMsm; above it routes to the
 * production MsmV2 Pippenger path.
 */
export const PICK_NTM_CROSSOVER_N = 1 << 14;

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
