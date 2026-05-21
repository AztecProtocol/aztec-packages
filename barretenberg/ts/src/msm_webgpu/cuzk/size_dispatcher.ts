import { TrivialMsm } from "./trivial_msm.js";

/**
 * Per-`logN` `NUM_THREAD_MULS` (= `k`) recommendation from the
 * windowed-LUT M2 BrowserStack sweep (Apple M2 base, macOS Sequoia,
 * Chrome 148, `hardwareConcurrency=8`; reps=10, warmup=3, verify=1).
 * `k=1` wins at every logN ∈ [4, 9].
 */
const PICK_NTM_TABLE: Readonly<Record<number, number>> = {
  4: 1,
  5: 1,
  6: 1,
  7: 1,
  8: 1,
  9: 1,
};
const PICK_NTM_DEFAULT = 1;

/**
 * Largest `n` where the TrivialMsm small-MSM path beats MsmV2.
 *
 * Same-sweep M2 result with the windowed-LUT kernel:
 *
 *   logN | TrivialMsm | MsmV2 | speedup
 *   ---:|---:|---:|---:
 *   4   |  9.85 | 10.80 | 1.10×
 *   7   | 11.60 | 13.35 | 1.15×
 *   8   | 11.90 | 14.20 | 1.19×
 *   9   | 12.95 | 15.25 | 1.18×
 *   10  | 15.20 | 12.30 | 0.81×  ← MsmV2 reclaims here
 *
 * The kernel bakes the `2^(4w)` window shift directly into the LUT, so
 * `straus_main` has zero inter-window doublings — closing the 124-doubling
 * serial chain that bottlenecked the earlier design.
 */
export const PICK_NTM_CROSSOVER_N = 1 << 9;

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
