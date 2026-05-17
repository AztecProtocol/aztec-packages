// Jest unit tests for the multi-window batched-Pippenger host
// reference (sub-step 2.1 of the WebGPU MSM rewrite plan).
//
// What this validates (the WASM cross-window batched-inverse pattern
// the GPU shaders will emulate in Phase 2):
//
//   1. windowsPerBatch=1 with the new signed-Booth path equals the
//      existing unsigned-digit `batchAffineMSM`. Asserts that the
//      signed-digit recoding plus 32-bit schedule encoding produces a
//      mathematically identical MSM result.
//
//   2. windowsPerBatch=2 and =4 agree with windowsPerBatch=1 on the
//      same inputs. Confirms the cross-window pooled batched-inverse
//      is associativity-correct (changing inversion batch size never
//      changes the result).
//
//   3. Edge cases: all-zero scalars, single non-zero scalar, scalars
//      at p-1, scalars at c-bit boundary values (2^k - 1, 2^k, 2^k + 1).
//
//   4. Schedule encoding round-trip: encode → decode is identity;
//      dedup bits (29|30) round-trip as zero (the consumer rejects
//      non-zero dedup bits).
//
//   5. Signed-Booth recoding identity: reassembling the recoded digits
//      via Σ_w (sign[w] ? -mag[w] : mag[w]) * 2^(c*w) == scalar.

import {
  batchAffineMSM,
  batchAffineMSMMultiWindow,
  decodeScheduleEntry,
  encodeScheduleEntry,
  SCHEDULE_INDEX_MASK,
  SCHEDULE_SIGN_BIT,
  _testOnly,
} from "./batch_affine_bn254.js";
import {
  BN254_SCALAR_FIELD,
  BN254_ZERO,
  bn254ScalarField,
  doubleBn254Point,
  msmBn254,
  scalarMultBn254Point,
  type Bn254Point,
} from "./bn254.js";

// Reproducible RNG (mirrors bench-field-mul.ts / bernstein_yang.test.ts).
const makeRng = (seed: number): (() => number) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
};

// Random scalar in [0, p) via 8 × 32-bit limbs (>= 254 bits of entropy)
// then reduced mod p. Plenty above the scalar field size.
const randomScalar = (rng: () => number): bigint => {
  let s = 0n;
  for (let i = 0; i < 8; i++) {
    s = (s << 32n) | BigInt(rng() >>> 0);
  }
  return s % BN254_SCALAR_FIELD;
};

// BN254 generator (matches the canonical hex used by other tests in
// this directory: G_x = 1, G_y = 2).
const BN254_G: Bn254Point = { x: 1n, y: 2n };

// Build N test points as small multiples of G — cheap to construct,
// and the random scalars we sample never collide with these multiples
// modulo p (sampling space is ~2^254 vs N up to a few hundred).
const buildPoints = (n: number, rng: () => number): Bn254Point[] => {
  const pts: Bn254Point[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Use a fixed small offset + scalar from rng. Avoids ever passing
    // identity by choosing scalars from [1, 2^31).
    const k = BigInt((rng() & 0x7fffffff) + 1);
    pts[i] = scalarMultBn254Point(BN254_G, k);
  }
  return pts;
};

const pointEq = (a: Bn254Point, b: Bn254Point): boolean => {
  const aZ = a.infinity === true;
  const bZ = b.infinity === true;
  if (aZ && bZ) return true;
  if (aZ || bZ) return false;
  return a.x === b.x && a.y === b.y;
};

describe("Schedule entry encoding (32-bit layout)", () => {
  it("encode/decode identity for positive sign", () => {
    const entry = encodeScheduleEntry(42, 0);
    expect(entry).toBe(42);
    const dec = decodeScheduleEntry(entry);
    expect(dec.scalarIdx).toBe(42);
    expect(dec.sign).toBe(0);
  });

  it("encode/decode identity for negative sign", () => {
    const entry = encodeScheduleEntry(42, 1);
    // bit 31 set + scalarIdx = 42. As unsigned 32-bit:
    expect(entry).toBe((SCHEDULE_SIGN_BIT | 42) >>> 0);
    const dec = decodeScheduleEntry(entry);
    expect(dec.scalarIdx).toBe(42);
    expect(dec.sign).toBe(1);
  });

  it("encode/decode at 29-bit index boundary", () => {
    const entry = encodeScheduleEntry(SCHEDULE_INDEX_MASK, 1);
    const dec = decodeScheduleEntry(entry);
    expect(dec.scalarIdx).toBe(SCHEDULE_INDEX_MASK);
    expect(dec.sign).toBe(1);
  });

  it("encode throws on out-of-range scalarIdx", () => {
    expect(() =>
      encodeScheduleEntry(SCHEDULE_INDEX_MASK + 1, 0),
    ).toThrow();
  });

  it("decode throws when dedup bit 29 is set", () => {
    const entry = (1 << 29) | 7;
    expect(() => decodeScheduleEntry(entry)).toThrow();
  });

  it("decode throws when dedup bit 30 is set", () => {
    const entry = (1 << 30) | 7;
    expect(() => decodeScheduleEntry(entry)).toThrow();
  });

  it("zero entry decodes to (0, 0)", () => {
    const dec = decodeScheduleEntry(0);
    expect(dec.scalarIdx).toBe(0);
    expect(dec.sign).toBe(0);
  });
});

describe("Signed-Booth digit recoding identity", () => {
  const CS = [2, 4, 8, 15, 16];
  const SCALAR_BITS = 254;

  for (const c of CS) {
    it(`c=${c}: reassembled digits equal scalar (random + edge cases)`, () => {
      // Match `batchAffineMSMMultiWindow`'s formula (+2 headroom for
      // the signed-Booth carry). Without this the top window's sign
      // bit can fall inside the scalar's MSB region at small c values
      // (e.g. c=2 with scalar = p-1, MSB = bit 253 ⇒ top window sign
      // bit = bit 253 ⇒ phantom carry past num_windows).
      const numWindows = Math.ceil((SCALAR_BITS + 2) / c);
      const rng = makeRng(0xc001 + c);
      const samples: bigint[] = [
        0n,
        1n,
        2n,
        (1n << BigInt(c)) - 1n,
        1n << BigInt(c),
        (1n << BigInt(c)) + 1n,
        (1n << BigInt(c - 1)) - 1n,
        1n << BigInt(c - 1),
        BN254_SCALAR_FIELD - 1n,
        BN254_SCALAR_FIELD - 7n,
      ];
      for (let i = 0; i < 32; i++) samples.push(randomScalar(rng));

      for (const s of samples) {
        const { magnitudes, signs } = _testOnly.recodeScalarBooth(
          s,
          c,
          numWindows,
        );
        // Reassemble digit_w * 2^(c*w). All magnitudes fit in [0, 2^(c-1)].
        let recon = 0n;
        const shifts: bigint[] = new Array(numWindows);
        for (let w = 0; w < numWindows; w++) {
          shifts[w] = BigInt(c * w);
        }
        for (let w = 0; w < numWindows; w++) {
          const mag = BigInt(magnitudes[w]);
          const signed = signs[w] === 1 ? -mag : mag;
          recon += signed << shifts[w];
          // Magnitude bound check.
          expect(magnitudes[w]).toBeGreaterThanOrEqual(0);
          expect(magnitudes[w]).toBeLessThanOrEqual(1 << (c - 1));
        }
        expect(recon).toBe(s);
      }
    });
  }
});

describe("batchAffineMSMMultiWindow vs batchAffineMSM (windowsPerBatch=1)", () => {
  // c=16 is the production chunk_size, but the unsigned-digit
  // batchAffineMSM allocates 2^c = 65536 buckets per window — fine but
  // slow in pure-bigint at large c. We use c=8 here so the test fixture
  // stays under a second per case.
  const C = 8;
  const NS = [16, 64, 256];

  for (const n of NS) {
    it(`n=${n}, c=${C}: signed-Booth (wpb=1) == unsigned baseline`, () => {
      const rng = makeRng(0xdead + n);
      const points = buildPoints(n, rng);
      const scalars: bigint[] = new Array(n);
      for (let i = 0; i < n; i++) scalars[i] = randomScalar(rng);

      const expected = batchAffineMSM(points, scalars, C);
      const actual = batchAffineMSMMultiWindow(points, scalars, C, 1);
      expect(pointEq(actual, expected)).toBe(true);

      // Defence-in-depth: also cross-check against the brute-force MSM
      // in bn254.ts. Both helpers above could be wrong in the same way
      // (the signed-Booth recoder + bucket math is bespoke), so this
      // third independent path locks down the truth.
      const truth = msmBn254(points, scalars);
      expect(pointEq(actual, truth)).toBe(true);
    });
  }

  it("5 random seeds for n=64 all agree", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rng = makeRng(0xa11ce + seed);
      const points = buildPoints(64, rng);
      const scalars: bigint[] = new Array(64);
      for (let i = 0; i < 64; i++) scalars[i] = randomScalar(rng);

      const expected = batchAffineMSM(points, scalars, C);
      const actual = batchAffineMSMMultiWindow(points, scalars, C, 1);
      expect(pointEq(actual, expected)).toBe(true);
    }
  });
});

describe("batchAffineMSMMultiWindow: windowsPerBatch invariance", () => {
  const C = 8;
  const NS = [16, 64, 256];

  for (const n of NS) {
    it(`n=${n}, c=${C}: wpb=2 == wpb=1`, () => {
      const rng = makeRng(0xb0b + n);
      const points = buildPoints(n, rng);
      const scalars: bigint[] = new Array(n);
      for (let i = 0; i < n; i++) scalars[i] = randomScalar(rng);

      const ref1 = batchAffineMSMMultiWindow(points, scalars, C, 1);
      const ref2 = batchAffineMSMMultiWindow(points, scalars, C, 2);
      expect(pointEq(ref2, ref1)).toBe(true);
    });

    it(`n=${n}, c=${C}: wpb=4 == wpb=1`, () => {
      const rng = makeRng(0xfee1 + n);
      const points = buildPoints(n, rng);
      const scalars: bigint[] = new Array(n);
      for (let i = 0; i < n; i++) scalars[i] = randomScalar(rng);

      const ref1 = batchAffineMSMMultiWindow(points, scalars, C, 1);
      const ref4 = batchAffineMSMMultiWindow(points, scalars, C, 4);
      expect(pointEq(ref4, ref1)).toBe(true);
    });
  }
});

describe("batchAffineMSMMultiWindow: edge cases", () => {
  const C = 8;
  const N = 32;

  it("all-zero scalars → identity", () => {
    const rng = makeRng(0xc0de);
    const points = buildPoints(N, rng);
    const scalars: bigint[] = new Array(N).fill(0n);
    for (const wpb of [1, 2, 4]) {
      const r = batchAffineMSMMultiWindow(points, scalars, C, wpb);
      expect(r.infinity).toBe(true);
    }
  });

  it("single non-zero scalar agrees with scalar mult", () => {
    const rng = makeRng(0x5eed);
    const points = buildPoints(N, rng);
    const idx = 7;
    const k = 123456789n;
    const scalars: bigint[] = new Array(N).fill(0n);
    scalars[idx] = k;
    const expected = scalarMultBn254Point(points[idx], k);
    for (const wpb of [1, 2, 4]) {
      const r = batchAffineMSMMultiWindow(points, scalars, C, wpb);
      expect(pointEq(r, expected)).toBe(true);
    }
  });

  it("scalar = p - 1 (maximum valid scalar)", () => {
    const rng = makeRng(0xbeef);
    const points = buildPoints(N, rng);
    const scalars: bigint[] = new Array(N);
    for (let i = 0; i < N; i++) scalars[i] = BN254_SCALAR_FIELD - 1n;
    const truth = msmBn254(points, scalars);
    for (const wpb of [1, 2, 4]) {
      const r = batchAffineMSMMultiWindow(points, scalars, C, wpb);
      expect(pointEq(r, truth)).toBe(true);
    }
  });

  it("scalars at c-bit boundary values (2^k - 1, 2^k, 2^k + 1)", () => {
    const rng = makeRng(0xface);
    const points = buildPoints(8, rng);
    // 8 scalars: covers 2^(c-1) - 1, 2^(c-1), 2^(c-1) + 1, 2^c - 1,
    // 2^c, 2^c + 1, 2^(2c) - 1, 2^(2c).
    const cBI = BigInt(C);
    const scalars: bigint[] = [
      (1n << (cBI - 1n)) - 1n,
      1n << (cBI - 1n),
      (1n << (cBI - 1n)) + 1n,
      (1n << cBI) - 1n,
      1n << cBI,
      (1n << cBI) + 1n,
      (1n << (cBI * 2n)) - 1n,
      1n << (cBI * 2n),
    ];
    const truth = msmBn254(points, scalars);
    for (const wpb of [1, 2, 4]) {
      const r = batchAffineMSMMultiWindow(points, scalars, C, wpb);
      expect(pointEq(r, truth)).toBe(true);
    }
  });

  it("mixed (zero + nonzero + p-1) and wpb=1/2/4 agree", () => {
    const rng = makeRng(0xface5);
    const N2 = 16;
    const points = buildPoints(N2, rng);
    const scalars: bigint[] = new Array(N2);
    for (let i = 0; i < N2; i++) {
      if (i % 4 === 0) scalars[i] = 0n;
      else if (i % 4 === 1) scalars[i] = BN254_SCALAR_FIELD - 1n;
      else scalars[i] = randomScalar(rng);
    }
    const truth = msmBn254(points, scalars);
    for (const wpb of [1, 2, 4]) {
      const r = batchAffineMSMMultiWindow(points, scalars, C, wpb);
      expect(pointEq(r, truth)).toBe(true);
    }
  });
});

describe("batchAffineMSMMultiWindow: c=16 (production chunk size)", () => {
  // Smoke test at c=16 to confirm the production chunk_size works.
  // Limit n=16 to keep the 2^15-bucket-per-window per-batch allocation
  // pure-bigint cost under a second.
  it("c=16, n=16, wpb=1/2/4 agree with msmBn254 truth", () => {
    const rng = makeRng(0x16);
    const points = buildPoints(16, rng);
    const scalars: bigint[] = new Array(16);
    for (let i = 0; i < 16; i++) scalars[i] = randomScalar(rng);
    const truth = msmBn254(points, scalars);
    for (const wpb of [1, 2, 4]) {
      const r = batchAffineMSMMultiWindow(points, scalars, 16, wpb);
      expect(pointEq(r, truth)).toBe(true);
    }
  });
});

// Silence unused-import warnings: bn254ScalarField, doubleBn254Point,
// BN254_ZERO are imported for future-proofing tests that exercise the
// pooled-inverse boundary cases; the linter is otherwise vocal.
void bn254ScalarField;
void doubleBn254Point;
void BN254_ZERO;
