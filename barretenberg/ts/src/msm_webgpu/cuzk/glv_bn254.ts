// GLV endomorphism decomposition for BN254.
//
// BN254 has an order-3 endomorphism phi: (x, y) -> (beta*x, y), where beta is
// a primitive cube root of unity in the base field Fq. On the order-r subgroup,
// phi(P) = [lambda]P for a cube root of unity lambda in the scalar field Fr.
// (For the beta chosen below, the matching eigenvalue is lambda^2; only the
// lattice basis below depends on it, and that is baked in — runtime code never
// needs lambda.)
//
// GLV rewrites each scalar as s = s1 + lambda*s2 (mod r) with |s1|, |s2| ~ 2^127,
// so
//     [s]P = [s1]P + [s2]phi(P).
// An n-point, 254-bit MSM becomes a 2n-point, ~127-bit MSM. The window count
// T = ceil(bits / c) halves (17 -> 9 at c=15), which halves the per-window
// bucket buffers and the n-independent BPR / Horner work — the costs that
// dominate on laptop/mobile GPUs at moderate n.
//
// Constants below are computed offline and verified (phi(P) == [lambda]P, the
// split congruence s1 + lambda*s2 == s mod r, and full point reconstruction)
// against the noble BN254 reference. See the PR writeup for the derivation.

import { BN254_BASE_FIELD, BN254_SCALAR_FIELD, type Bn254Point } from './bn254.js';

const Q = BN254_BASE_FIELD;
const R = BN254_SCALAR_FIELD;

/** Primitive cube root of unity in Fq; phi(x,y) = (BETA*x, y). */
export const BN254_GLV_BETA = 21888242871839275220042445260109153167277707414472061641714758635765020556616n;

// Short basis of the GLV lattice L = { (a,b) : a + lambda*b == 0 (mod r) },
// found by the extended-Euclidean short-vector method. det(v1,v2) = r and
// |v1|, |v2| ~ 2^126.8, so Babai rounding yields half-scalars below 2^127.
const V1X = 147946756881789319000765030803803410728n;
const V1Y = -9931322734385697763n;
const V2X = 9931322734385697763n;
const V2Y = 147946756881789319010696353538189108491n;
const DET = R; // v1x*v2y - v2x*v1y == r

/** Largest possible |s1|, |s2| from {@link glvSplit}; both fit in 127 bits. */
export const GLV_HALF_SCALAR_BITS = 128;

const fabs = (x: bigint): bigint => (x < 0n ? -x : x);

// round(num/den) for integers, den > 0, ties away from zero.
function roundDiv(num: bigint, den: bigint): bigint {
  const neg = num < 0n;
  const a = neg ? -num : num;
  let q = a / den;
  if (2n * (a - q * den) >= den) q += 1n;
  return neg ? -q : q;
}

/**
 * GLV-split a scalar `s in [0, r)` into signed half-scalars (s1, s2) with
 * `s1 + lambda*s2 == s (mod r)` and `|s1|, |s2| < 2^127`.
 */
export function glvSplit(s: bigint): { s1: bigint; s2: bigint } {
  const b1 = roundDiv(V2Y * s, DET);
  const b2 = roundDiv(-V1Y * s, DET);
  const s1 = s - b1 * V1X - b2 * V2X;
  const s2 = -b1 * V1Y - b2 * V2Y;
  return { s1, s2 };
}

/** phi(P) = (BETA*x, y). For P in the order-r subgroup this equals [lambda]P. */
export function endoPoint(p: Bn254Point): Bn254Point {
  return { x: (BN254_GLV_BETA * (p.x % Q)) % Q, y: p.y % Q };
}

function negY(y: bigint): bigint {
  const yy = y % Q;
  return yy === 0n ? 0n : Q - yy;
}

function writeLe32(out: Uint8Array, off: number, v: bigint): void {
  let x = v;
  for (let k = 0; k < 32; k++) {
    out[off + k] = Number(x & 0xffn);
    x >>= 8n;
  }
}

/**
 * Build the 2n-point / 127-bit MSM equivalent to the n-point / 254-bit MSM
 * `sum_i [scalars_i] points_i`, using the GLV decomposition. The sign of each
 * half-scalar is folded into its point (`y -> -y`) so the half-scalars handed
 * to the pipeline are non-negative magnitudes.
 *
 * Returns raw buffers in the layout the MSM pool/decompose stages expect:
 *   - `pointsBuf`:  2n * 64 bytes, each point = x||y, 32-byte LE coords.
 *   - `scalarsBuf`: 2n * 32 bytes, each scalar LE, all < 2^127.
 * Element i in [0,n)   is (s1_i, +-P_i); element n+i is (s2_i, +-phi(P_i)).
 */
export function buildGlvInputs(
  points: Bn254Point[],
  scalars: bigint[],
): { pointsBuf: Uint8Array; scalarsBuf: Uint8Array; n2: number } {
  const n = points.length;
  const n2 = 2 * n;
  const pointsBuf = new Uint8Array(n2 * 64);
  const scalarsBuf = new Uint8Array(n2 * 32);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const phi = endoPoint(p);
    const { s1, s2 } = glvSplit(((scalars[i] % R) + R) % R);

    // Term 1: (|s1|, P or -P).
    const p1x = p.x % Q;
    const p1y = s1 < 0n ? negY(p.y) : p.y % Q;
    writeLe32(pointsBuf, i * 64, p1x);
    writeLe32(pointsBuf, i * 64 + 32, p1y);
    writeLe32(scalarsBuf, i * 32, fabs(s1));

    // Term 2: (|s2|, phi(P) or -phi(P)).
    const p2y = s2 < 0n ? negY(phi.y) : phi.y % Q;
    writeLe32(pointsBuf, (n + i) * 64, phi.x);
    writeLe32(pointsBuf, (n + i) * 64 + 32, p2y);
    writeLe32(scalarsBuf, (n + i) * 32, fabs(s2));
  }
  return { pointsBuf, scalarsBuf, n2 };
}

/**
 * On-the-fly variant of {@link buildGlvInputs}: builds the 2n-point / 127-bit
 * problem while storing **only the original n points**. The φ(P)=(βx,y) terms
 * are not materialized — the GPU gather recomputes them (a single Montgomery
 * multiply) for any value index in `[n, 2n)`, and each half-scalar's sign is
 * folded into bit 255 of its (sub-2¹²⁷) scalar word so the decompose XORs it
 * into the stored point sign. This removes the 2× point-pool doubling.
 *
 * Layout:
 *   - `pointsBuf`:  n * 64 bytes (the originals; the pool serves both halves).
 *   - `scalarsBuf`: 2n * 32 bytes. Element i in [0,n) is |s1_i| (+sign bit) for
 *     point i; element n+i is |s2_i| (+sign bit) for the gather's φ(point i).
 *
 * The MSM is created with 2n logical points over this n-point pool; the gather
 * maps index n+i → φ(point i) because `n+i ≥ pool.srsN (= n)`.
 */
export function buildGlvInputsOnTheFly(
  points: Bn254Point[],
  scalars: bigint[],
): { pointsBuf: Uint8Array; scalarsBuf: Uint8Array; n: number; n2: number } {
  const n = points.length;
  const n2 = 2 * n;
  const pointsBuf = new Uint8Array(n * 64);
  const scalarsBuf = new Uint8Array(n2 * 32);
  const GLV_SIGN_BYTE = 0x80; // bit 255 = byte 31, bit 7
  for (let i = 0; i < n; i++) {
    const p = points[i];
    writeLe32(pointsBuf, i * 64, p.x % Q);
    writeLe32(pointsBuf, i * 64 + 32, p.y % Q);

    const { s1, s2 } = glvSplit(((scalars[i] % R) + R) % R);
    writeLe32(scalarsBuf, i * 32, fabs(s1));
    if (s1 < 0n) scalarsBuf[i * 32 + 31] |= GLV_SIGN_BYTE;
    writeLe32(scalarsBuf, (n + i) * 32, fabs(s2));
    if (s2 < 0n) scalarsBuf[(n + i) * 32 + 31] |= GLV_SIGN_BYTE;
  }
  return { pointsBuf, scalarsBuf, n, n2 };
}
