// Node-side unit tests for the Tier 2 batch MSM shaders.
//
// Two layers of coverage, neither of which needs a GPU:
//
// 1. WGSL substitution (cheap structural check). The
//    `gen_bucket_histogram_shader` / `gen_decompose_scalars_booth_shader`
//    generators bake `WINDOWS_PER_MSM` as a compile-time WGSL constant via
//    mustache. We render the shader and parse the value back, so a missed
//    template variable or an off-by-one in the new plumbing fails here
//    instead of as a silent mid-shader bucket misfire on the GPU.
//
// 2. Pure-JS reference for the per-bucket histogram. `buildInitCounts`
//    mirrors the GPU `bucket_histogram` kernel byte-for-byte (same Booth
//    recode, same `(gid.y → b, w)` virtual-window split). The single-MSM
//    and batch outputs are both checked against an independent
//    noble-/BigInt-based Booth digit oracle so the JS reference itself
//    cannot drift from the spec. The dev-page WebGPU sweep already
//    cross-checks each per-slot result against a solo MsmV2 run; if THAT
//    check fails after this one passes, we know the GPU shader has
//    diverged from the JS reference — useful for isolating the bug.

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { buildInitCounts } from './msm_v2.js';

const NUMBITS = 254;

/**
 * Independent Booth recoder. Mirrors the shader formula but written in
 * BigInt instead of the GPU's u32 truncation so a typo in the
 * `buildInitCounts` truncation/encode arithmetic surfaces as a divergence
 * vs this oracle.
 *
 * `lookback` is the bit just below window `w`'s LSB in `scalar` (0 for w=0).
 * Returns the bucket index (the digit's absolute value) in [0, 2^(c-1)].
 */
function boothBucketRef(scalar: bigint, w: number, c: number): number {
  const lo = BigInt(w * c);
  const cMask = (1n << BigInt(c)) - 1n;
  const winBits = (scalar >> lo) & cMask;
  const lookback = w === 0 ? 0n : (scalar >> (lo - 1n)) & 1n;
  const raw = (winBits << 1n) | lookback;
  const neg = (raw >> BigInt(c)) & 1n;
  const encode = (raw + 1n) >> 1n;
  // Signed-digit magnitude lives in the low c bits of `(encode - neg) XOR
  // (-neg)`, i.e. negate `encode - neg` mod 2^c when `neg == 1`.
  const valMask = (1n << BigInt(c)) - 1n;
  let bucket: bigint;
  if (neg === 1n) {
    bucket = ~(encode - 1n) & valMask;
  } else {
    bucket = encode & valMask;
  }
  return Number(bucket);
}

/** Build the expected `numWindows × BW` count grid for an array of
 *  scalars. For batch mode, the input is the concatenated `B × n` array,
 *  laid out slot-0 first. */
function expectedCounts(scalars: bigint[], n: number, c: number, batchSize: number, BW: number): Uint32Array {
  const W = Math.ceil(NUMBITS / c);
  const counts = new Uint32Array(batchSize * W * BW);
  for (let b = 0; b < batchSize; b++) {
    for (let i = 0; i < n; i++) {
      const s = scalars[b * n + i];
      for (let w = 0; w < W; w++) {
        const bucket = boothBucketRef(s, w, c);
        counts[(b * W + w) * BW + bucket]++;
      }
    }
  }
  return counts;
}

/** Convert an LE `bigint` to a 32-byte buffer slot inside `out` at byte offset
 *  `byteOff`. Mirrors the existing dev-page `biToLe32`. */
function writeLE32(out: Uint8Array, byteOff: number, v: bigint): void {
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[byteOff + i] = Number(x & 0xffn);
    x >>= 8n;
  }
}

function packScalars(scalars: bigint[]): Uint8Array {
  const buf = new Uint8Array(scalars.length * 32);
  for (let i = 0; i < scalars.length; i++) writeLE32(buf, i * 32, scalars[i]);
  return buf;
}

describe('Tier 2 batch MSM shader plumbing', () => {
  const sm = new ShaderManager(4, 1 << 15, BN254_CURVE_CONFIG, false);

  it('bucket_histogram shader bakes WINDOWS_PER_MSM as the rendered constant', () => {
    const src = sm.gen_bucket_histogram_shader(128, 256, 20);
    const m = src.match(/const\s+WINDOWS_PER_MSM:\s*u32\s*=\s*(\d+)u;/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('20');
    // Sanity: the BW constant is still rendered, unchanged.
    expect(src).toMatch(/const\s+BW:\s*u32\s*=\s*256u;/);
  });

  it('decompose_scalars_booth shader bakes WINDOWS_PER_MSM as the rendered constant', () => {
    const src = sm.gen_decompose_scalars_booth_shader(128, 17);
    const m = src.match(/const\s+WINDOWS_PER_MSM:\s*u32\s*=\s*(\d+)u;/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('17');
  });

  it('bucket_histogram shader includes the (b, w) split formula', () => {
    const src = sm.gen_bucket_histogram_shader(128, 256, 20);
    expect(src).toMatch(/let\s+b\s*=\s*y_eff\s*\/\s*WINDOWS_PER_MSM;/);
    expect(src).toMatch(/let\s+w\s*=\s*y_eff\s*%\s*WINDOWS_PER_MSM;/);
    expect(src).toMatch(/let\s+scalar_idx\s*=\s*b\s*\*\s*input_size\s*\+\s*p;/);
    expect(src).toMatch(/atomicAdd\(&counts\[y_eff\s*\*\s*BW\s*\+\s*bucket\]/);
  });

  it('decompose shader uses scalar_idx (b·n + p) instead of a raw point id', () => {
    const src = sm.gen_decompose_scalars_booth_shader(128, 20);
    expect(src).toMatch(/let\s+scalar_idx\s*=\s*b\s*\*\s*input_size\s*\+\s*p;/);
    expect(src).toMatch(/read_bits\(scalar_idx,\s*scalar_words,\s*w\s*\*\s*c/);
  });
});

describe('buildInitCounts — pure-JS bucket histogram reference', () => {
  it('single-MSM (batchSize=1) at c=13 matches the boothBucketRef oracle', () => {
    const c = 13;
    const W = Math.ceil(NUMBITS / c); // 20
    const n = 32;
    const BW = 4352; // matches MsmV2.create's c=13 BW (ceil(4097/256)*256)
    const scalars: bigint[] = [];
    let s = 0xdeadbeefn;
    for (let i = 0; i < n; i++) {
      // Mix-and-mask 254-bit scalars deterministically.
      s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 254n) - 1n);
      scalars.push(s);
    }
    const buf = packScalars(scalars);
    const got = buildInitCounts(buf, n, c, W, BW);
    const want = expectedCounts(scalars, n, c, 1, BW);
    expect(got.length).toBe(want.length);
    for (let i = 0; i < got.length; i++) {
      if (got[i] !== want[i]) {
        throw new Error(`single-MSM count mismatch at index ${i}: got=${got[i]} want=${want[i]}`);
      }
    }
  });

  it('batch mode (B=3, c=13) lays out counts as B·W × BW with correct per-slot offsets', () => {
    const c = 13;
    const W = Math.ceil(NUMBITS / c);
    const B = 3;
    const n = 8;
    const BW = 4352;
    const scalars: bigint[] = [];
    let s = 0x123456789abcdef0n;
    for (let i = 0; i < B * n; i++) {
      s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 254n) - 1n);
      scalars.push(s);
    }
    const buf = packScalars(scalars); // [slot0 || slot1 || slot2]
    const got = buildInitCounts(buf, n, c, B * W, BW, /* windowsPerMsm */ W);
    const want = expectedCounts(scalars, n, c, B, BW);
    expect(got.length).toBe(B * W * BW);
    expect(got.length).toBe(want.length);

    // Per-slot sanity: each slot's `n` scalars contribute exactly `n`
    // increments across its W windows (one per (i, w) pair, summed across
    // all buckets). This catches a class of bugs where the scalar index
    // gets the wrong `b` and increments land in the wrong slot's grid.
    for (let b = 0; b < B; b++) {
      let slotTotal = 0;
      for (let w = 0; w < W; w++) {
        for (let bucket = 0; bucket < BW; bucket++) {
          slotTotal += got[(b * W + w) * BW + bucket];
        }
      }
      expect(slotTotal).toBe(W * n);
    }

    // Full grid equality vs the independent oracle.
    for (let i = 0; i < got.length; i++) {
      if (got[i] !== want[i]) {
        const idx = i;
        const w_eff = Math.floor(idx / BW);
        const b = Math.floor(w_eff / W);
        const w = w_eff % W;
        const bucket = idx % BW;
        throw new Error(`batch count mismatch at (b=${b}, w=${w}, bucket=${bucket}): got=${got[i]} want=${want[i]}`);
      }
    }
  });

  it('batch mode (B=10, c=15) handles the translator-range-constraint shape', () => {
    const c = 15;
    const W = Math.ceil(NUMBITS / c); // 17
    const B = 10;
    const n = 16;
    const BW = 16640; // matches MsmV2.create's c=15 BW (ceil(16385/256)*256)
    const scalars: bigint[] = [];
    let s = 0x7777777777777777n;
    for (let i = 0; i < B * n; i++) {
      s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 254n) - 1n);
      scalars.push(s);
    }
    const buf = packScalars(scalars);
    const got = buildInitCounts(buf, n, c, B * W, BW, W);
    const want = expectedCounts(scalars, n, c, B, BW);
    for (let i = 0; i < got.length; i++) {
      if (got[i] !== want[i]) {
        throw new Error(`batch count mismatch at index ${i}: got=${got[i]} want=${want[i]}`);
      }
    }
  });

  it('rejects numWindows / windowsPerMsm mismatches', () => {
    const buf = packScalars([1n, 2n, 3n]);
    expect(() => buildInitCounts(buf, 3, 13, /* numWindows */ 21, /* BW */ 4352, /* windowsPerMsm */ 20)).toThrow(
      /not a positive multiple/,
    );
  });
});
