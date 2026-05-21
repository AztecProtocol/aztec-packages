import {
  FR_CUBE_ROOT_OF_UNITY,
  FR_ORDER,
  packHalfToU32Limbs,
  splitIntoEndomorphismScalars,
} from "./glv.js";

const TWO_128 = 1n << 128n;

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomScalar(rand: () => number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v = (v << 32n) | BigInt(rand());
  }
  return v % FR_ORDER;
}

const ENDO_G2 = 0x2d91d232ec7e0b3d7n;

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

describe("straus/glv: FR_CUBE_ROOT_OF_UNITY", () => {
  it("λ is a primitive cube root of unity in Fr", () => {
    const lambda = FR_CUBE_ROOT_OF_UNITY;
    expect(lambda).not.toBe(1n);
    expect((lambda * lambda * lambda) % FR_ORDER).toBe(1n);
    expect((lambda * lambda + lambda + 1n) % FR_ORDER).toBe(0n);
  });
});

describe("straus/glv: splitIntoEndomorphismScalars identity", () => {
  const lambda = FR_CUBE_ROOT_OF_UNITY;

  function checkIdentity(k: bigint): void {
    const { k1, k2 } = splitIntoEndomorphismScalars(k);
    expect(k1 < TWO_128).toBe(true);
    expect(k2 < TWO_128).toBe(true);
    expect(k1 >= 0n).toBe(true);
    expect(k2 >= 0n).toBe(true);
    const reconstructed = (k1 - k2 * lambda) % FR_ORDER;
    const normalised = reconstructed < 0n ? reconstructed + FR_ORDER : reconstructed;
    expect(normalised).toBe(k);
  }

  it("holds on 200 seeded-LCG random scalars", () => {
    const rand = makeRng(0xc0ffee);
    for (let i = 0; i < 200; i++) {
      checkIdentity(randomScalar(rand));
    }
  });

  it("handles k = 0", () => {
    const { k1, k2 } = splitIntoEndomorphismScalars(0n);
    expect(k1).toBe(0n);
    expect(k2).toBe(0n);
  });

  it("handles k = 1", () => {
    const { k1, k2 } = splitIntoEndomorphismScalars(1n);
    expect(k1).toBe(1n);
    expect(k2).toBe(0n);
  });

  it("handles k = r - 1", () => {
    checkIdentity(FR_ORDER - 1n);
  });

  it("handles k = r - 2", () => {
    checkIdentity(FR_ORDER - 2n);
  });

  it("handles k = 2^127 - 1 (just below short-circuit boundary)", () => {
    const k = (1n << 127n) - 1n;
    const { k1, k2 } = splitIntoEndomorphismScalars(k);
    expect(k1).toBe(k);
    expect(k2).toBe(0n);
  });

  it("handles k = 2^127 (just above short-circuit boundary)", () => {
    checkIdentity(1n << 127n);
  });

  it("handles k = 2^128 (forces lattice path)", () => {
    checkIdentity(1n << 128n);
  });

  it("handles k = 2^192", () => {
    checkIdentity(1n << 192n);
  });

  it("handles k = 2^253 (the largest power of 2 below r)", () => {
    checkIdentity(1n << 253n);
  });

  it("holds on boundary scalars k = ⌈m · 2^256 / g2⌉ for m ∈ [1, 10]", () => {
    for (let m = 1n; m <= 10n; m++) {
      const k = ceilDiv(m * (1n << 256n), ENDO_G2) % FR_ORDER;
      checkIdentity(k);
    }
  });

  it("holds on boundary scalars k = ⌊m · 2^256 / g2⌋ for m ∈ [1, 10]", () => {
    for (let m = 1n; m <= 10n; m++) {
      const k = ((m * (1n << 256n)) / ENDO_G2) % FR_ORDER;
      checkIdentity(k);
    }
  });

  it("rejects scalars outside [0, r)", () => {
    expect(() => splitIntoEndomorphismScalars(-1n)).toThrow();
    expect(() => splitIntoEndomorphismScalars(FR_ORDER)).toThrow();
    expect(() => splitIntoEndomorphismScalars(FR_ORDER + 1n)).toThrow();
  });

  it("short-circuit returns (k, 0) for every k < 2^127", () => {
    const rand = makeRng(0xdeadbeef);
    for (let i = 0; i < 50; i++) {
      const k = randomScalar(rand) % (1n << 127n);
      const { k1, k2 } = splitIntoEndomorphismScalars(k);
      expect(k1).toBe(k);
      expect(k2).toBe(0n);
    }
  });

  it("exercises the negative-k2 correction path", () => {
    // Search for inputs that take the t1 >= 2^128 branch by inspecting
    // outputs. The correction is rare (~2^-64) for uniform random k, so
    // we use a tight grid near the lattice boundary k = m·2^256/g2 + δ.
    let triggered = 0;
    for (let m = 1n; m <= 200n; m++) {
      const base = (m * (1n << 256n)) / ENDO_G2;
      for (let delta = -3n; delta <= 3n; delta++) {
        const k = ((base + delta) % FR_ORDER + FR_ORDER) % FR_ORDER;
        const { k1, k2 } = splitIntoEndomorphismScalars(k);
        const lhs = (k1 - k2 * FR_CUBE_ROOT_OF_UNITY) % FR_ORDER;
        const normalised = lhs < 0n ? lhs + FR_ORDER : lhs;
        expect(normalised).toBe(k);
        expect(k1 < TWO_128).toBe(true);
        expect(k2 < TWO_128).toBe(true);
        if (k2 !== 0n) triggered++;
      }
    }
    expect(triggered).toBeGreaterThan(0);
  });
});

describe("straus/glv: packHalfToU32Limbs", () => {
  it("round-trips for 0", () => {
    expect(packHalfToU32Limbs(0n)).toEqual([0, 0, 0, 0]);
  });

  it("round-trips for 1", () => {
    expect(packHalfToU32Limbs(1n)).toEqual([1, 0, 0, 0]);
  });

  it("round-trips for 2^128 - 1", () => {
    expect(packHalfToU32Limbs((1n << 128n) - 1n)).toEqual([
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);
  });

  it("round-trips arbitrary 128-bit halves", () => {
    const rand = makeRng(42);
    for (let i = 0; i < 50; i++) {
      const half =
        (BigInt(rand()) |
          (BigInt(rand()) << 32n) |
          (BigInt(rand()) << 64n) |
          (BigInt(rand()) << 96n)) &
        ((1n << 128n) - 1n);
      const limbs = packHalfToU32Limbs(half);
      const reconstructed =
        BigInt(limbs[0]) |
        (BigInt(limbs[1]) << 32n) |
        (BigInt(limbs[2]) << 64n) |
        (BigInt(limbs[3]) << 96n);
      expect(reconstructed).toBe(half);
    }
  });

  it("rejects negative and >= 2^128 inputs", () => {
    expect(() => packHalfToU32Limbs(-1n)).toThrow();
    expect(() => packHalfToU32Limbs(1n << 128n)).toThrow();
  });
});
