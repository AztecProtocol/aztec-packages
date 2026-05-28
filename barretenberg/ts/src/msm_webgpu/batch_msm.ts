/// <reference types="@webgpu/types" />
// batch_msm.ts — Batched same-N MSM driver on top of MsmV2.
//
// See BATCH_MSM_DESIGN.md for the full algorithm + rationale. Brief:
//
//   * Build one "master" MsmV2Pool (uploads SRS + Montgomery-converts it +
//     compiles every pipeline). Then build B-1 "slot" pools via
//     `MsmV2Pool.fromSharedSrs`, each sharing the master's SRS GPU buffers
//     and pipeline cache but allocating its own scratch (bufA / bufB /
//     scalarsRawBuf / …).
//   * Each slot gets its own MsmV2 instance bound to its own pool. The B
//     instances can prepare in parallel (`Promise.all`) because their scratch
//     buffers are disjoint — the histogram + mapAsync waits overlap on the
//     device queue instead of serialising at the JS level.
//   * `runAll()` encodes every slot's MsmV2 pipeline into one shared command
//     encoder writing to one shared mappable staging buffer at distinct
//     offsets. One submit, one mapAsync wait, B parallel Horner-combines.
//
// This is the **Tier 1** of the two-tier batch plan in BATCH_MSM_DESIGN.md.
// Tier 2 (the virtualised B·W-window single-shader MSM that actually
// parallelises GPU compute) is documented there; this file is the
// correctness + scaffolding tier it will replace under the same API.

import { MsmV2, MsmV2Pool, type MsmConfig } from './msm_v2.js';

/** One BatchMsmV2 run's per-slot result, in canonical affine `(x, y)`. */
export interface BatchMsmResult {
  results: { x: bigint; y: bigint }[];
  /** Wall time from queue.submit to mapAsync resolution (host-side window
   *  over the whole batch's GPU compute). */
  gpuMs: number;
  /** Wall time from runAll() entry to result return — includes encode +
   *  submit + mapAsync + decode + B Horner combines. */
  wallMs: number;
}

/** Tuning for {@link BatchMsmV2.create}. Forwarded to every slot's MsmV2
 *  with sensible batch-mode defaults (no warm-up, host-combine on so the
 *  caller gets {x, y} directly, profile off). */
export interface BatchMsmConfig extends MsmConfig {
  /** Override the per-slot MsmConfig if you need to (e.g. for a profile run). */
  perSlot?: MsmConfig;
}

/**
 * Batched same-N MSM driver. Holds a master `MsmV2Pool` plus `B-1` borrowing
 * slots, and one `MsmV2` instance per slot. See file header for the algorithm.
 *
 * Lifecycle:
 *
 * ```ts
 * const batch = await BatchMsmV2.create(device, srsBytes, n, B);
 * await batch.prepareAll(scalarsList);   // B distinct Uint8Array (n × 32 LE Fr)
 * const out = await batch.runAll();      // { results, gpuMs, wallMs }
 * batch.destroy();
 * ```
 */
export class BatchMsmV2 {
  private constructor(
    readonly n: number,
    readonly B: number,
    private readonly device: GPUDevice,
    private readonly masterPool: MsmV2Pool,
    private readonly slotPools: MsmV2Pool[],
    private readonly slots: MsmV2[],
  ) {}

  /**
   * Build a batch driver for `B` same-`n` MSMs against the canonical SRS in
   * `srsCanonicalBytes` (`srsN × 64` LE bytes; `srsN ≥ n`).
   *
   * One SRS upload + Montgomery-conversion regardless of B; one shader
   * compile regardless of B (slot 0's pool owns the pipeline cache; slots
   * 1..B-1 borrow it). Per-slot scratch is allocated on first
   * `prepareAll()` call — same lazy growth pattern as `MsmV2Pool`.
   */
  static async create(
    device: GPUDevice,
    srsCanonicalBytes: Uint8Array,
    n: number,
    B: number,
    config?: BatchMsmConfig,
  ): Promise<BatchMsmV2> {
    if (B < 1) throw new Error(`BatchMsmV2.create: B must be >= 1 (got ${B})`);

    const slotConfig: MsmConfig = {
      warmupRuns: 0,
      combineOnHost: true,
      profile: false,
      ...(config ?? {}),
      ...(config?.perSlot ?? {}),
    };

    const masterPool = await MsmV2Pool.create(device, srsCanonicalBytes);
    const slotPools: MsmV2Pool[] = [masterPool];
    const slots: MsmV2[] = [];
    try {
      slots.push(await MsmV2.create(device, n, masterPool, slotConfig));
      for (let b = 1; b < B; b++) {
        const pool = MsmV2Pool.fromSharedSrs(
          device,
          masterPool.srsN,
          masterPool.poolX,
          masterPool.poolY,
          masterPool.cache,
        );
        slotPools.push(pool);
        slots.push(await MsmV2.create(device, n, pool, slotConfig));
      }
    } catch (e) {
      for (const m of slots) m.destroy();
      for (let i = slotPools.length - 1; i >= 0; i--) slotPools[i].destroy();
      throw e;
    }
    return new BatchMsmV2(n, B, device, masterPool, slotPools, slots);
  }

  /**
   * Prepare every slot in parallel. `scalarsList[b]` is the `n × 32` LE Fr
   * scalar buffer for slot `b`; must have length `B`. Each slot's prepare()
   * issues its own histogram + mapAsync on its own scratch — the device
   * queue serialises the GPU work but Chrome's mapAsync polling overlaps,
   * collapsing B × ~10ms of host idle into the single longest one.
   */
  async prepareAll(scalarsList: Uint8Array[]): Promise<void> {
    if (scalarsList.length !== this.B) {
      throw new Error(`BatchMsmV2.prepareAll: expected ${this.B} scalar buffers, got ${scalarsList.length}`);
    }
    for (let b = 0; b < this.B; b++) {
      const sb = scalarsList[b];
      if (sb.byteLength !== this.n * 32) {
        throw new Error(`BatchMsmV2.prepareAll: slot ${b} has ${sb.byteLength} bytes, expected ${this.n * 32}`);
      }
    }
    // Parallel prepares (rev 3): each slot's MsmV2.prepare submits its own
    // histogram + waits for mapAsync to read per-bucket counts back. The
    // device queue is FIFO and each slot's scratch is disjoint (per-pool
    // bufA/B/scalarsRawBuf/histogramBuf), so the GPU work is correctly
    // ordered AND the Chrome mapAsync polling waits overlap into a single
    // host idle window — this is the main Tier 1 host-side win.
    //
    // Rev 2 ran these sequentially as a defensive measure while we tracked
    // down a correctness regression that turned out to be unrelated (the
    // caller was passing the same Uint8Array identity across prepares,
    // tripping MsmV2.prepare's identity cache so the second prepare
    // no-op'd — see the dev page's `genScalars` for the fix).
    await Promise.all(this.slots.map((m, b) => m.prepare(scalarsList[b])));
  }

  /**
   * Encode every slot's pipeline into ONE command encoder writing to ONE
   * shared mappable staging buffer, submit once, mapAsync once, decode +
   * Horner-combine every slot in parallel JS. Caller is responsible for
   * having called {@link prepareAll} first.
   */
  async runAll(): Promise<BatchMsmResult> {
    const wallT0 = performance.now();
    const offsets: number[] = new Array(this.B);
    let totalBytes = 0;
    for (let b = 0; b < this.B; b++) {
      offsets[b] = totalBytes;
      totalBytes += this.slots[b].windowSumsByteLength;
    }
    const staging = this.device.createBuffer({
      size: Math.max(4, totalBytes),
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const enc = this.device.createCommandEncoder();
    for (let b = 0; b < this.B; b++) this.slots[b].encodeIntoBatch(enc, staging, offsets[b]);

    const submitT0 = performance.now();
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const gpuMs = performance.now() - submitT0;

    const mapped = staging.getMappedRange();
    const stagingBytes = new Uint8Array(mapped.slice(0));
    staging.unmap();
    staging.destroy();

    const results: { x: bigint; y: bigint }[] = new Array(this.B);
    for (let b = 0; b < this.B; b++) {
      const L = this.slots[b].decodeWindowSumsFromBytes(stagingBytes, offsets[b]);
      results[b] = hostHornerCombine(L, this.slots[b].c);
    }

    return { results, gpuMs, wallMs: performance.now() - wallT0 };
  }

  /** Release every slot's MsmV2 and pool. The borrowed-SRS slots no-op on
   *  poolX / poolY; only the master pool actually frees the SRS GPU memory. */
  destroy(): void {
    for (const m of this.slots) {
      try {
        m.destroy();
      } catch {
        /* idempotent */
      }
    }
    for (let i = this.slotPools.length - 1; i >= 0; i--) {
      try {
        this.slotPools[i].destroy();
      } catch {
        /* idempotent */
      }
    }
  }

  /** Direct access to the master pool (e.g. for shared-SRS lookups). */
  get pool(): MsmV2Pool {
    return this.masterPool;
  }

  /** The B underlying MsmV2 instances. Exposed so callers can read per-slot
   *  profile data, MsmConfig knobs, etc. Do NOT prepare them out of band —
   *  use {@link prepareAll} so the cache invariants stay coherent. */
  get instances(): readonly MsmV2[] {
    return this.slots;
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
 * Horner combine of W per-window sums into the final MSM point. Mirrors the
 * private `hostWindowCombine` in msm_v2.ts (which we cannot import because
 * it is not exported). Jacobian accumulator → one final inverse to affine.
 *
 * Exported so the Node-side test suite can verify the combine math against
 * an in-process noble reference without spinning up a GPU.
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
