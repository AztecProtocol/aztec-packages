import {
  BN254_BASE_FIELD,
  BN254_JACOBIAN_ZERO,
  BN254_ZERO,
  Bn254Jacobian,
  Bn254Point,
  addBn254Jacobian,
  doubleBn254Jacobian,
  isBn254Zero,
  modInverse,
  toAffineBn254Jacobian,
} from "../cuzk/bn254.js";
import {
  BOOTH_ENDO_LOOKUP_SIZE,
  BOOTH_ENDO_NUM_WINDOWS,
  BOOTH_ENDO_WINDOW_BITS,
  boothPackedDigit,
} from "./booth.js";
import { FR_ORDER, splitIntoEndomorphismScalars } from "./glv.js";

const TWO_256 = 1n << 256n;

const FQ_CUBE_ROOT_MONT_LIMBS: readonly bigint[] = [
  0x71930c11d782e155n,
  0xa6bb947cffbe3323n,
  0xaa303344d4741444n,
  0x2c3b3f0d26594943n,
];

function limbsToBigInt(limbs: readonly bigint[]): bigint {
  let v = 0n;
  for (let i = limbs.length - 1; i >= 0; i--) {
    v = (v << 64n) | limbs[i];
  }
  return v;
}

const FQ_R_INV = modInverse(TWO_256 % BN254_BASE_FIELD, BN254_BASE_FIELD);

/**
 * Fq's cube root of unity (the on-curve endomorphism eigenvalue β), in
 * non-Montgomery form. Derived at module load from the Montgomery-form
 * limbs in `barretenberg/cpp/src/barretenberg/ecc/curves/bn254/fq.hpp`.
 * See STRAUS_REFERENCE.md §3.
 */
export const FQ_CUBE_ROOT_OF_UNITY =
  (limbsToBigInt(FQ_CUBE_ROOT_MONT_LIMBS) * FQ_R_INV) % BN254_BASE_FIELD;

function modQ(a: bigint): bigint {
  const r = a % BN254_BASE_FIELD;
  return r >= 0n ? r : r + BN254_BASE_FIELD;
}

function affineToJacobian(p: Bn254Point): Bn254Jacobian {
  if (isBn254Zero(p)) return BN254_JACOBIAN_ZERO;
  return { x: p.x, y: p.y, z: 1n };
}

interface ActiveScalar {
  lookup: Bn254Jacobian[];
  k1: bigint;
  k2: bigint;
}

/**
 * Pure-TS port of `element<...>::straus_msm` for BN254 G1. Mirrors the
 * algorithm in `barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp`
 * lines 712-794 — endomorphism-Booth Straus with a per-point `[1·P, …, 8·P]`
 * Jacobian lookup table, 32 windows × 2 halves (h=0 → k1·P, h=1 → k2·φ(P)),
 * 4 doublings between windows. Active filtering (skip infinity points and
 * zero scalars) is performed here to match the C++ semantics.
 *
 * Scalars must already be reduced to `[0, r)`; non-canonical inputs are
 * reduced before splitting.
 *
 * @returns the affine representation of `Σ scalars[i] · points[i]`.
 */
export function referenceStrausMsm(
  points: readonly Bn254Point[],
  scalars: readonly bigint[],
): Bn254Point {
  const n = Math.min(points.length, scalars.length);
  if (n === 0) return BN254_ZERO;

  const beta = FQ_CUBE_ROOT_OF_UNITY;

  const active: ActiveScalar[] = [];
  for (let i = 0; i < n; i++) {
    if (isBn254Zero(points[i])) continue;
    const s = ((scalars[i] % FR_ORDER) + FR_ORDER) % FR_ORDER;
    if (s === 0n) continue;
    const pt = affineToJacobian(points[i]);
    const lookup: Bn254Jacobian[] = new Array(BOOTH_ENDO_LOOKUP_SIZE);
    lookup[0] = pt;
    for (let k = 1; k < BOOTH_ENDO_LOOKUP_SIZE; k++) {
      lookup[k] = addBn254Jacobian(lookup[k - 1], pt);
    }
    const { k1, k2 } = splitIntoEndomorphismScalars(s);
    active.push({ lookup, k1, k2 });
  }
  if (active.length === 0) return BN254_ZERO;

  let acc: Bn254Jacobian = BN254_JACOBIAN_ZERO;
  for (let w = BOOTH_ENDO_NUM_WINDOWS - 1; w >= 0; w--) {
    for (let h = 0; h < 2; h++) {
      for (const a of active) {
        const half = h === 0 ? a.k1 : a.k2;
        const digit = boothPackedDigit(half, w);
        const magnitude = digit & 0x7fffffff;
        if (magnitude === 0) continue;
        const sign = (digit >>> 31) & 1;
        const entry = a.lookup[magnitude - 1];
        const negate = (sign ^ (h === 1 ? 1 : 0)) === 1;
        let y = entry.y;
        if (negate) y = modQ(BN254_BASE_FIELD - y);
        let x = entry.x;
        if (h === 1) x = modQ(x * beta);
        acc = addBn254Jacobian(acc, { x, y, z: entry.z });
      }
    }
    if (w !== 0) {
      for (let d = 0; d < BOOTH_ENDO_WINDOW_BITS; d++) {
        acc = doubleBn254Jacobian(acc);
      }
    }
  }
  return toAffineBn254Jacobian(acc);
}
