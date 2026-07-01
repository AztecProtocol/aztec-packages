// Equivalence proof for the Adreno-740 (Galaxy S23) hardening of `read_bits`.
//
// The S23 returns a wrong WebGPU MSM from n=2^10 up; the leading hypothesis is
// that Adreno 740's WGSL compiler miscompiles the *runtime-variable* bit-shift
// amounts in `read_bits` (`>> off`, `<< (32-off)`, `>> c`, `1u << c`) — the one
// hot-path shift site the team never hardened, while the newer S26U Adreno
// compiles it correctly. The fix expresses every variable shift as a
// barrel-shifter ladder of <=5 *constant-amount* shifts, which Tint folds
// cleanly on every driver.
//
// This test does NOT prove Adreno 740 compiles the ladder correctly — only a
// physical 740 can confirm that. It proves the part we control: that the ladder
// and the hardened `read_bits` compute the IDENTICAL value to the original on a
// conformant target, across every shift amount and the full Booth-window
// parameter space. So the only remaining unknown when applying the fix is the
// driver, not the algorithm.
//
// The functions below mirror the WGSL line-for-line (WORD_BITS=32, BN254
// scalar_words=8). JS masks shift counts to [0,31], so `x >>> s` / `(x << s)>>>0`
// are the correct conformant references for s in [0,31].

import { describe, expect, it } from '@jest/globals';

const WORD_BITS = 32;
const SCALAR_WORDS = 8; // BN254: 256-bit scalars as 8 LE u32 words

const u32 = (x: number): number => x >>> 0;

// --- Proposed Adreno-safe variable shifts (mirror the proposed WGSL) ---------

function shrVar(x: number, s: number): number {
  let r = u32(x);
  if (s & 16) r = r >>> 16;
  if (s & 8) r = r >>> 8;
  if (s & 4) r = r >>> 4;
  if (s & 2) r = r >>> 2;
  if (s & 1) r = r >>> 1;
  return u32(r);
}

function shlVar(x: number, s: number): number {
  let r = u32(x);
  if (s & 16) r = u32(r << 16);
  if (s & 8) r = u32(r << 8);
  if (s & 4) r = u32(r << 4);
  if (s & 2) r = u32(r << 2);
  if (s & 1) r = u32(r << 1);
  return u32(r);
}

// --- read_bits: current (plain) vs hardened (barrel-shift) -------------------
// Both keep the identical guards from the production WGSL, so neither performs
// an out-of-range shift; the only difference is HOW the in-range variable shift
// is realised.

function readBitsPlain(words: number[], s: number, bitOff: number, count: number): number {
  const base = s * SCALAR_WORDS;
  const word = Math.floor(bitOff / WORD_BITS);
  const off = bitOff % WORD_BITS;
  let v = 0;
  if (word < SCALAR_WORDS) {
    v = words[base + word] >>> off;
  }
  if (off + count > WORD_BITS && word + 1 < SCALAR_WORDS) {
    v = u32(v | u32(words[base + word + 1] << (WORD_BITS - off)));
  }
  if (count >= WORD_BITS) {
    return u32(v);
  }
  return u32(v & u32((1 << count) - 1));
}

function readBitsSafe(words: number[], s: number, bitOff: number, count: number): number {
  const base = s * SCALAR_WORDS;
  const word = Math.floor(bitOff / WORD_BITS);
  const off = bitOff % WORD_BITS;
  let v = 0;
  if (word < SCALAR_WORDS) {
    v = shrVar(words[base + word], off);
  }
  if (off + count > WORD_BITS && word + 1 < SCALAR_WORDS) {
    v = u32(v | shlVar(words[base + word + 1], WORD_BITS - off));
  }
  if (count >= WORD_BITS) {
    return u32(v);
  }
  return u32(v & u32(shlVar(1, count) - 1));
}

// --- Ground-truth bit extraction via BigInt ---------------------------------

function referenceExtract(words: number[], s: number, bitOff: number, count: number): number {
  let scalar = 0n;
  for (let i = 0; i < SCALAR_WORDS; i++) {
    scalar |= BigInt(u32(words[s * SCALAR_WORDS + i])) << BigInt(32 * i);
  }
  const mask = (1n << BigInt(count)) - 1n;
  return Number((scalar >> BigInt(bitOff)) & mask) >>> 0;
}

// Deterministic LCG so the test never depends on the (unavailable) Math.random.
function makeScalars(numScalars: number, seed: number): number[] {
  const words = new Array<number>(numScalars * SCALAR_WORDS);
  let state = u32(seed || 1);
  for (let i = 0; i < words.length; i++) {
    state = u32(Math.imul(state, 1664525) + 1013904223);
    words[i] = state;
  }
  return words;
}

describe('shrVar / shlVar barrel-shifter ladders', () => {
  const samples = [0, 1, 0xffffffff, 0x80000001, 0x7fffffff, 0xdeadbeef, 0x00010001, 0xaaaaaaaa];

  it('shrVar(x, s) === x >>> s for every shift amount in [0,31]', () => {
    for (const x of samples) {
      for (let s = 0; s < 32; s++) {
        expect(shrVar(x, s)).toBe(x >>> s);
      }
    }
  });

  it('shlVar(x, s) === (x << s)>>>0 for every shift amount in [0,31]', () => {
    for (const x of samples) {
      for (let s = 0; s < 32; s++) {
        expect(shlVar(x, s)).toBe(u32(x << s));
      }
    }
  });

  it('shlVar(1, c) builds the same power-of-two mask base as 1<<c for c in [0,31]', () => {
    for (let c = 0; c < 32; c++) {
      expect(shlVar(1, c)).toBe(u32(1 << c));
    }
  });
});

describe('hardened read_bits is identical to the current read_bits', () => {
  // The Booth decomposition reads c+1-bit windows at offsets w*c (and the
  // w*c-1 lookback bit). Cover every production window width and span the full
  // 254-bit scalar.
  const PRODUCTION_C = [8, 10, 13, 15];

  it('matches the plain path and the BigInt reference across all Booth windows', () => {
    const NUM_SCALARS = 64;
    const words = makeScalars(NUM_SCALARS, 0xc0ffee);

    for (const c of PRODUCTION_C) {
      const numWindows = Math.ceil(254 / c);
      for (let s = 0; s < NUM_SCALARS; s++) {
        for (let w = 0; w < numWindows; w++) {
          // window bits
          const winOff = w * c;
          expect(readBitsSafe(words, s, winOff, c)).toBe(readBitsPlain(words, s, winOff, c));
          expect(readBitsSafe(words, s, winOff, c)).toBe(referenceExtract(words, s, winOff, c));
          // lookback bit (1 bit at w*c - 1), only for w > 0
          if (w > 0) {
            const lbOff = w * c - 1;
            expect(readBitsSafe(words, s, lbOff, 1)).toBe(readBitsPlain(words, s, lbOff, 1));
            expect(readBitsSafe(words, s, lbOff, 1)).toBe(referenceExtract(words, s, lbOff, 1));
          }
        }
      }
    }
  });

  it('matches at word-boundary offsets (off==0) and word-crossing offsets', () => {
    const words = makeScalars(8, 0x1234);
    // off==0 is the case where a naive `<< (32-off)` would be a shift-by-32;
    // both paths must agree (the guard suppresses that branch).
    for (let s = 0; s < 8; s++) {
      for (const bitOff of [0, 31, 32, 33, 63, 64, 200, 224, 240]) {
        for (const count of [1, 8, 13, 15, 16]) {
          expect(readBitsSafe(words, s, bitOff, count)).toBe(readBitsPlain(words, s, bitOff, count));
          expect(readBitsSafe(words, s, bitOff, count)).toBe(referenceExtract(words, s, bitOff, count));
        }
      }
    }
  });
});
