export const BOOTH_ENDO_WINDOW_BITS = 4;
export const BOOTH_ENDO_NUM_WINDOWS = 32;
export const BOOTH_ENDO_LOOKUP_SIZE = 1 << (BOOTH_ENDO_WINDOW_BITS - 1);
export const BOOTH_ENDO_NUM_LIMBS_U64 = 2;

const LIMB_BITS = 64;
const U64_MASK = (1n << 64n) - 1n;

export interface BoothSliceParams {
  loMask: number;
  hiMask: number;
  loLimb: number;
  hiLimb: number;
  loOff: number;
  loBits: number;
}

/**
 * Port of `detail::compute_booth_slice_params` from
 * `barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp` lines
 * 550-581. See STRAUS_REFERENCE.md §1.2.
 */
export function computeBoothSliceParams(
  bitOffset: number,
  windowBits: number,
  numU64Limbs: number,
): BoothSliceParams {
  if (bitOffset === 0) {
    return {
      loMask: 0,
      hiMask: (1 << windowBits) - 1,
      loLimb: 0,
      hiLimb: 0,
      loOff: LIMB_BITS - 1,
      loBits: 1,
    };
  }
  const lookbackBit = bitOffset - 1;
  const bitsToRead = windowBits + 1;
  const loLimb = Math.floor(lookbackBit / LIMB_BITS);
  const loOff = lookbackBit & (LIMB_BITS - 1);
  const loBits =
    LIMB_BITS - loOff < bitsToRead ? LIMB_BITS - loOff : bitsToRead;
  const hiBits = bitsToRead - loBits;
  const loMask = (1 << loBits) - 1;
  if (loLimb + 1 >= numU64Limbs) {
    return {
      loMask,
      hiMask: 0,
      loLimb,
      hiLimb: loLimb,
      loOff,
      loBits,
    };
  }
  return {
    loMask,
    hiMask: (1 << hiBits) - 1,
    loLimb,
    hiLimb: loLimb + 1,
    loOff,
    loBits,
  };
}

/**
 * Materialised slice-param table for `straus_msm`'s endo-Booth recoding
 * (window_bits=4, num_windows=32, num_u64_limbs=2). Mirrors
 * `detail::make_endo_booth_slice_params()` from element_impl.hpp §1.5.
 */
export const BOOTH_ENDO_SLICE_PARAMS: readonly BoothSliceParams[] = (() => {
  const sp: BoothSliceParams[] = [];
  for (let w = 0; w < BOOTH_ENDO_NUM_WINDOWS; w++) {
    sp.push(
      computeBoothSliceParams(
        w * BOOTH_ENDO_WINDOW_BITS,
        BOOTH_ENDO_WINDOW_BITS,
        BOOTH_ENDO_NUM_LIMBS_U64,
      ),
    );
  }
  return sp;
})();

function getLimb(half: bigint, limbIndex: number): bigint {
  return (half >> BigInt(limbIndex * LIMB_BITS)) & U64_MASK;
}

/**
 * Signed-Booth packed digit for window `w` of a 128-bit scalar half.
 * Returns `(sign << 31) | magnitude` (magnitude in `[0, 8]`, sign in `{0,1}`;
 * magnitude `0` means the window contributes nothing). Direct port of
 * `detail::booth_packed_digit` from element_impl.hpp §1.3.
 *
 * @param half 128-bit non-negative scalar in `[0, 2^128)`.
 * @param w Window index in `[0, BOOTH_ENDO_NUM_WINDOWS)`.
 */
export function boothPackedDigit(half: bigint, w: number): number {
  const sp = BOOTH_ENDO_SLICE_PARAMS[w];
  const sLo = getLimb(half, sp.loLimb);
  const sHi = getLimb(half, sp.hiLimb);
  const loPart = (sLo >> BigInt(sp.loOff)) & BigInt(sp.loMask);
  const hiPart = (sHi & BigInt(sp.hiMask)) << BigInt(sp.loBits);
  const raw = Number((loPart | hiPart) & 0xffffffffn);
  const windowBits = BOOTH_ENDO_WINDOW_BITS;
  const neg = (raw >>> windowBits) & 1;
  const negMask = (0 - neg) >>> 0;
  const valMask = (1 << windowBits) - 1;
  const encode = (raw + 1) >>> 1;
  const magnitude = (((encode + negMask) >>> 0) ^ negMask) & valMask;
  return ((neg << 31) | magnitude) >>> 0;
}

/**
 * Decode a packed digit (sign << 31 | magnitude) into a signed integer in
 * `[-8, 8]`. Convenience for tests and the host-side reference MSM.
 */
export function decodeBoothDigit(digit: number): number {
  const sign = (digit >>> 31) & 1;
  const magnitude = digit & 0x7fffffff;
  return sign ? -magnitude : magnitude;
}
