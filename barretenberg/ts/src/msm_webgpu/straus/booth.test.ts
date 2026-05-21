import {
  BOOTH_ENDO_LOOKUP_SIZE,
  BOOTH_ENDO_NUM_LIMBS_U64,
  BOOTH_ENDO_NUM_WINDOWS,
  BOOTH_ENDO_SLICE_PARAMS,
  BOOTH_ENDO_WINDOW_BITS,
  boothPackedDigit,
  computeBoothSliceParams,
  decodeBoothDigit,
} from "./booth.js";
import { splitIntoEndomorphismScalars } from "./glv.js";

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomU64(rand: () => number): bigint {
  return BigInt(rand()) | (BigInt(rand()) << 32n);
}

function randomHalfBelow(rand: () => number, maxBits: number): bigint {
  let v = 0n;
  for (let bits = 0; bits < maxBits; bits += 32) {
    v |= BigInt(rand()) << BigInt(bits);
  }
  return v & ((1n << BigInt(maxBits)) - 1n);
}

const TWO_128 = 1n << 128n;

describe("straus/booth: constants", () => {
  it("matches the C++ endo-Booth constants", () => {
    expect(BOOTH_ENDO_WINDOW_BITS).toBe(4);
    expect(BOOTH_ENDO_NUM_WINDOWS).toBe(32);
    expect(BOOTH_ENDO_LOOKUP_SIZE).toBe(8);
    expect(BOOTH_ENDO_NUM_LIMBS_U64).toBe(2);
  });

  it("exposes 32 materialised slice-param rows", () => {
    expect(BOOTH_ENDO_SLICE_PARAMS.length).toBe(32);
  });
});

describe("straus/booth: computeBoothSliceParams", () => {
  it("special-cases bit_offset == 0", () => {
    const sp = computeBoothSliceParams(0, 4, 2);
    expect(sp).toEqual({
      loMask: 0,
      hiMask: 15,
      loLimb: 0,
      hiLimb: 0,
      loOff: 63,
      loBits: 1,
    });
  });

  it("mid-limb window (w=1)", () => {
    const sp = computeBoothSliceParams(4, 4, 2);
    expect(sp.loLimb).toBe(0);
    expect(sp.loOff).toBe(3);
    expect(sp.loBits).toBe(5);
    expect(sp.loMask).toBe(31);
    expect(sp.hiLimb).toBe(1);
    expect(sp.hiMask).toBe(0);
  });

  it("limb-crossing window", () => {
    // lookback bit 63 lands at the boundary of limb 0; the upper limb
    // must contribute the spillover bits.
    const sp = computeBoothSliceParams(64, 4, 2);
    expect(sp.loLimb).toBe(0);
    expect(sp.loOff).toBe(63);
    expect(sp.loBits).toBe(1);
    expect(sp.hiLimb).toBe(1);
    expect(sp.hiMask).toBe((1 << 4) - 1);
  });

  it("top window caps hi_limb at lo_limb when no more limbs are available", () => {
    const sp = computeBoothSliceParams(124, 4, 2);
    expect(sp.loLimb).toBe(1);
    expect(sp.hiLimb).toBe(1);
    expect(sp.hiMask).toBe(0);
  });
});

describe("straus/booth: boothPackedDigit", () => {
  it("returns (sign=0, magnitude=0) for half == 0", () => {
    for (let w = 0; w < BOOTH_ENDO_NUM_WINDOWS; w++) {
      expect(boothPackedDigit(0n, w)).toBe(0);
    }
  });

  it("returns (sign=0, magnitude=1) at w=0 for half == 1, zero elsewhere", () => {
    expect(boothPackedDigit(1n, 0)).toBe(1);
    for (let w = 1; w < BOOTH_ENDO_NUM_WINDOWS; w++) {
      expect(boothPackedDigit(1n, w)).toBe(0);
    }
  });

  it("magnitude is always in [0, 8]", () => {
    const rand = makeRng(0xb007);
    for (let i = 0; i < 256; i++) {
      const half = randomHalfBelow(rand, 128);
      for (let w = 0; w < BOOTH_ENDO_NUM_WINDOWS; w++) {
        const d = boothPackedDigit(half, w);
        const mag = d & 0x7fffffff;
        expect(mag).toBeGreaterThanOrEqual(0);
        expect(mag).toBeLessThanOrEqual(BOOTH_ENDO_LOOKUP_SIZE);
      }
    }
  });

  it("round-trips: sum over 32 windows reconstructs half (halves < 2^127)", () => {
    const rand = makeRng(7);
    for (let i = 0; i < 128; i++) {
      const half = randomHalfBelow(rand, 127);
      let sum = 0n;
      for (let w = 0; w < BOOTH_ENDO_NUM_WINDOWS; w++) {
        const d = decodeBoothDigit(boothPackedDigit(half, w));
        sum += BigInt(d) << BigInt(BOOTH_ENDO_WINDOW_BITS * w);
      }
      expect(sum).toBe(half);
    }
  });

  it("round-trips on tiny boundary halves", () => {
    const cases = [
      0n,
      1n,
      7n,
      8n,
      15n,
      16n,
      0xffn,
      0x100n,
      (1n << 32n) - 1n,
      1n << 32n,
      (1n << 63n) - 1n,
      1n << 63n,
      (1n << 64n) - 1n,
      1n << 64n,
      (1n << 96n) - 1n,
      1n << 96n,
      (1n << 127n) - 1n,
    ];
    for (const half of cases) {
      let sum = 0n;
      for (let w = 0; w < BOOTH_ENDO_NUM_WINDOWS; w++) {
        sum +=
          BigInt(decodeBoothDigit(boothPackedDigit(half, w))) <<
          BigInt(BOOTH_ENDO_WINDOW_BITS * w);
      }
      expect(sum).toBe(half);
    }
  });

  it("round-trips on actual GLV outputs from random scalars", () => {
    const rand = makeRng(0xc0c0a);
    for (let i = 0; i < 100; i++) {
      const k =
        ((randomU64(rand) | (randomU64(rand) << 64n) | (randomU64(rand) << 128n) |
          (randomU64(rand) << 192n)) %
          ((1n << 256n) - 1n)) %
        21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      const { k1, k2 } = splitIntoEndomorphismScalars(k);
      for (const half of [k1, k2]) {
        expect(half < TWO_128).toBe(true);
        let sum = 0n;
        for (let w = 0; w < BOOTH_ENDO_NUM_WINDOWS; w++) {
          sum +=
            BigInt(decodeBoothDigit(boothPackedDigit(half, w))) <<
            BigInt(BOOTH_ENDO_WINDOW_BITS * w);
        }
        expect(sum).toBe(half);
      }
    }
  });
});
