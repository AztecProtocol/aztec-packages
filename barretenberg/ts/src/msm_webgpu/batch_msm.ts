/// <reference types="@webgpu/types" />
// batch_msm.ts — Batched same-N MSM driver (Tier 2: virtualised B·W-window
// single-shader fusion).
//
// See MSM_IMPL.md §3.4 for how this fits the batch routing; the full design
// doc (BATCH_MSM_DESIGN.md) lives in git history. Brief:
//
//   The batch driver wraps ONE `MsmV2` instance configured with
//   `batchSize = B`. The bucket-histogram and decompose-scalars shaders
//   take `WINDOWS_PER_MSM` as a compile-time constant and treat `gid.y` as
//   a virtual window index spanning B·W effective windows; each thread
//   splits y_eff into `(b = y_eff / W, w = y_eff mod W)` and reads scalar
//   `b · n + p`. The rest of the pipeline (planner, transpose, fused
//   affine-add, reduce) iterates over `numWindows = B · W` obliviously —
//   no per-MSM identity downstream of the leaf data shaders.
//
//   Caller hands `prepareAll` an array of B `Uint8Array` scalar buffers
//   (each `n × 32` LE Fr). `prepareAll` concatenates them into one
//   `B × n × 32`-byte buffer and feeds it to `msm.prepare`. `runAll`
//   triggers one full MSM dispatch over B·W windows and returns the
//   B·W per-window sums; the host splits into B groups of W and
//   Horner-combines each independently.
//
// Tier 1 (a B-pool slot design with per-pool scratch + per-slot MsmV2)
// was committed earlier but turned out to be slower than the simpler
// B-serial-solo baseline at most sizes — see MSM_IMPL.md §7 and the
// commit message for `feat(bb/msm): BatchMsmV2 scaffolding + ...`.
// This rewrite drops the slot-pool design entirely; the public API
// (`BatchMsmV2.create / prepareAll / runAll / destroy`) is unchanged so
// the dev page and tests don't need updates.

import { MsmV2, MsmV2Pool, type MsmConfig } from './msm_v2.js';

/** One BatchMsmV2 run's per-slot result, in canonical affine `(x, y)`. */
export interface BatchMsmResult {
  results: { x: bigint; y: bigint }[];
  /** Wall time from queue.submit to mapAsync resolution. */
  gpuMs: number;
  /** Wall time from runAll() entry to result return. */
  wallMs: number;
}

/** Tuning for {@link BatchMsmV2.create}. */
export interface BatchMsmConfig extends MsmConfig {
  /** Reserved for future profile-mode tunables; currently unused. */
  perSlot?: MsmConfig;
}

/**
 * Batched same-N MSM driver. Wraps one `MsmV2` configured for Tier 2 batch
 * mode (`batchSize = B`) — see file header.
 *
 * ```ts
 * const batch = await BatchMsmV2.create(device, srsBytes, n, B);
 * await batch.prepareAll(scalarsList);   // B Uint8Array, each n × 32 LE Fr
 * const out = await batch.runAll();      // { results, gpuMs, wallMs }
 * batch.destroy();
 * ```
 */
export class BatchMsmV2 {
  // Holds the concatenated `B × n × 32`-byte scalar buffer across
  // prepareAll → runAll. Reused (in-place writes) on every prepareAll
  // call so the per-call allocation cost is amortized; reallocated only
  // if `B × n` grows.
  private concat: Uint8Array;

  private constructor(
    readonly n: number,
    readonly B: number,
    private readonly device: GPUDevice,
    readonly pool: MsmV2Pool,
    private readonly msm: MsmV2,
  ) {
    this.concat = new Uint8Array(B * n * 32);
  }

  /**
   * Build a batch driver for `B` same-`n` MSMs against the canonical SRS in
   * `srsCanonicalBytes` (`srsN × 64` LE bytes; `srsN ≥ n`).
   *
   * One SRS upload + Montgomery-conversion, one shader compile, one
   * `MsmV2` configured for `batchSize = B`. The two leaf-data shaders bake
   * `WINDOWS_PER_MSM = ceil(254 / pickC(n))` as a compile-time constant,
   * so changing `B` does not require a recompile (only `n` and `c` do).
   */
  static async create(
    device: GPUDevice,
    srsCanonicalBytes: Uint8Array,
    n: number,
    B: number,
    config?: BatchMsmConfig,
  ): Promise<BatchMsmV2> {
    if (!Number.isInteger(B) || B < 1) throw new Error(`BatchMsmV2.create: B must be a positive integer (got ${B})`);

    // batchSize is the load-bearing knob the shaders + scratch dimensions
    // both depend on. combineOnHost must be false because MsmV2's built-in
    // Horner combine assumes one MSM's worth of windows; we Horner-combine
    // per slot in `runAll` below.
    //
    // The GPU bucket_histogram shader takes WINDOWS_PER_MSM as a compile-
    // time constant and splits gid.y into (b, w) for batch mode; its
    // output matches the JS `buildInitCounts` reference byte-for-byte
    // (see batch_msm_shader.test.ts). Earlier revs forced
    // `useHostHistogram: true` as a correctness-isolation measure while
    // tracking down a planner bug (NUM_WINDOWS hardcoded to W instead of
    // B·W); now that's fixed, the GPU histogram is the production path
    // and the host fallback is back to being an A/B diagnostic.
    const msmConfig: MsmConfig = {
      warmupRuns: 0,
      profile: false,
      ...(config ?? {}),
      batchSize: B,
      combineOnHost: false,
    };

    const pool = await MsmV2Pool.create(device, srsCanonicalBytes);
    let msm: MsmV2;
    try {
      msm = await MsmV2.create(device, n, pool, msmConfig);
    } catch (e) {
      pool.destroy();
      throw e;
    }
    return new BatchMsmV2(n, B, device, pool, msm);
  }

  /**
   * Concatenate the B scalar buffers and prepare the underlying MsmV2 for
   * a virtualised B·W-window dispatch. `scalarsList[b]` must be `n × 32`
   * LE Fr bytes for slot `b`. `srsOffset` is the *common* point-index
   * offset into the SRS pool shared by every slot — Tier 2's single
   * MsmV2 instance binds one pool prefix [srsOffset, srsOffset + n), so
   * all B same-N MSMs must agree on this. Defaults to 0 (the original
   * caller contract). The chonk bridge passes through the per-batch
   * srs_offset from the C++ side here so common-offset same-N batches
   * (e.g. W_L/W_R/W_O at srs_offset=1) can route through this path.
   */
  async prepareAll(scalarsList: Uint8Array[], srsOffset: number = 0): Promise<void> {
    if (scalarsList.length !== this.B) {
      throw new Error(`BatchMsmV2.prepareAll: expected ${this.B} scalar buffers, got ${scalarsList.length}`);
    }
    const slotBytes = this.n * 32;
    for (let b = 0; b < this.B; b++) {
      const sb = scalarsList[b];
      if (sb.byteLength !== slotBytes) {
        throw new Error(`BatchMsmV2.prepareAll: slot ${b} has ${sb.byteLength} bytes, expected ${slotBytes}`);
      }
      this.concat.set(sb, b * slotBytes);
    }
    // Fresh `Uint8Array` view over the in-place buffer so MsmV2.prepare's
    // identity cache (keyed on the Uint8Array reference) misses and the
    // real prepare runs. The underlying ArrayBuffer is the same;
    // `this.concat` reuses storage across calls.
    const view = new Uint8Array(this.concat.buffer, this.concat.byteOffset, this.concat.byteLength);
    await this.msm.prepare(view, srsOffset);
  }

  /**
   * Trigger one full MSM dispatch over B·W virtual windows. Returns B
   * affine results — `runAll` Horner-combines each slot's W window sums
   * independently. `gpuMs` is the queue.submit → mapAsync wall; `wallMs`
   * includes the encode + the per-slot Horner combines.
   */
  async runAll(): Promise<BatchMsmResult> {
    const wallT0 = performance.now();
    const submitT0 = performance.now();
    // MsmV2.run() yields the per-window sums in encode order (slot 0's W
    // sums first). With `combineOnHost: false` the `x`/`y` it returns are
    // the all-zero sentinel — we ignore that and Horner-combine below.
    const r = await this.msm.run();
    const gpuMs = performance.now() - submitT0;

    const W = this.msm.windowsPerMsm;
    const c = this.msm.c;
    if (r.windowSums.length !== this.B * W) {
      throw new Error(`BatchMsmV2.runAll: expected ${this.B * W} window sums (B·W), got ${r.windowSums.length}`);
    }

    const results: { x: bigint; y: bigint }[] = new Array(this.B);
    for (let b = 0; b < this.B; b++) {
      const slotSums = r.windowSums.slice(b * W, (b + 1) * W);
      results[b] = hostHornerCombine(slotSums, c);
    }

    return { results, gpuMs, wallMs: performance.now() - wallT0 };
  }

  /** GPU bytes this batch instance owns: its dedicated SRS pool + scratch plus
   *  the single virtualised MsmV2's working set. */
  statsBytes(): number {
    return this.pool.statsBytes() + this.msm.statsBytes();
  }

  /** Release the underlying MsmV2 and the SRS pool. */
  destroy(): void {
    try {
      this.msm.destroy();
    } catch {
      /* idempotent */
    }
    try {
      this.pool.destroy();
    } catch {
      /* idempotent */
    }
  }

  /** The single underlying MsmV2 — kept as a length-1 array so the dev
   *  page's existing `batch.instances[0].c` etc. lookups still work. */
  get instances(): readonly MsmV2[] {
    return [this.msm];
  }
}

// --- Pure helpers (BN254 host-side Horner combine, mirroring msm_v2.ts). ---
//
// Duplicated here rather than re-exported from msm_v2.ts to avoid widening
// the public API. The function is small and self-contained.

const FP = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let r = 1n;
  let b = ((base % m) + m) % m;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

function modInv(a: bigint, m: bigint): bigint {
  return modPow(a, m - 2n, m);
}

const fadd = (a: bigint, b: bigint): bigint => (a + b) % FP;
const fsub = (a: bigint, b: bigint): bigint => (a - b + FP) % FP;
const fmul = (a: bigint, b: bigint): bigint => (a * b) % FP;

/**
 * Horner combine of W per-window sums into the final MSM point. Mirrors
 * the private `hostWindowCombine` in msm_v2.ts (which we cannot import
 * because it is not exported). Jacobian accumulator → one final inverse
 * to affine.
 *
 * Exported so the Node-side test suite can verify the combine math
 * against an in-process noble reference without spinning up a GPU.
 */
export function hostHornerCombine(L: { x: bigint; y: bigint }[], c: number): { x: bigint; y: bigint } {
  let X = L[L.length - 1].x;
  let Y = L[L.length - 1].y;
  let Z = 1n;
  for (let w = L.length - 2; w >= 0; w--) {
    for (let d = 0; d < c; d++) {
      const A = fmul(X, X);
      const B = fmul(Y, Y);
      const Bsq = fmul(B, B);
      const xB = fadd(X, B);
      const s = fsub(fmul(xB, xB), fadd(A, Bsq));
      const D = fadd(s, s);
      const E = fadd(fadd(A, A), A);
      const X3 = fsub(fmul(E, E), fadd(D, D));
      const Bsq4 = fadd(fadd(Bsq, Bsq), fadd(Bsq, Bsq));
      const yz = fmul(Y, Z);
      Y = fsub(fmul(E, fsub(D, X3)), fadd(Bsq4, Bsq4));
      Z = fadd(yz, yz);
      X = X3;
    }
    const Z1Z1 = fmul(Z, Z);
    const U2 = fmul(L[w].x, Z1Z1);
    const S2 = fmul(fmul(L[w].y, Z), Z1Z1);
    const H = fsub(U2, X);
    const HH = fmul(H, H);
    const I = fadd(fadd(HH, HH), fadd(HH, HH));
    const J = fmul(H, I);
    const r = fadd(fsub(S2, Y), fsub(S2, Y));
    const V = fmul(X, I);
    const X3 = fsub(fsub(fmul(r, r), J), fadd(V, V));
    const yJ = fmul(Y, J);
    const zH = fadd(Z, H);
    Y = fsub(fmul(r, fsub(V, X3)), fadd(yJ, yJ));
    Z = fsub(fsub(fmul(zH, zH), Z1Z1), HH);
    X = X3;
  }
  const zInv = modInv(Z, FP);
  const zInv2 = fmul(zInv, zInv);
  return { x: fmul(X, zInv2), y: fmul(Y, fmul(zInv2, zInv)) };
}
