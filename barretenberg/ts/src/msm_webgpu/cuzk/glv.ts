// BN254 GLV endomorphism scalar decomposition.
//
// BN254 admits the efficiently-computable endomorphism
//     φ(x, y) = (β·x, y)
// which acts on the prime-order subgroup as multiplication by an eigenvalue λ:
//     φ(P) = [λ] P,   λ² + λ + 1 ≡ 0 (mod r),   β² + β + 1 ≡ 0 (mod q).
//
// Every 254-bit scalar k splits as k ≡ k₁ + λ·k₂ (mod r) with |k₁|, |k₂| ≲ √r
// (≈ 2¹²⁷). So a length-n, 254-bit MSM  Σ kᵢ Pᵢ  becomes a length-2n, 128-bit
// MSM  Σ k₁ᵢ Pᵢ + Σ k₂ᵢ φ(Pᵢ).  Halving the scalar bit length halves the
// Pippenger window count T = ceil(λ_bits / c), which halves the
// bucket-reduction work and the `bucket_sums` buffer — a memory and time win
// that is identical across Apple / Adreno / Mali because φ is just one Fq
// multiply by β plus a free coordinate copy.
//
// Constants below were derived by Tonelli-Shanks (cube roots of unity) and
// Gauss lattice reduction, and the β↔λ pairing was verified against the group
// law (φ(P) == [λ]P) offline. The module asserts their algebraic identities at
// load so a bad transcription fails loudly rather than silently corrupting an
// MSM.

/** BN254 scalar field order r. */
export const BN254_FR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
/** BN254 base field order q. */
export const BN254_FQ = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
/** Endomorphism eigenvalue λ ∈ Fr: φ(P) = [λ]P. */
export const GLV_LAMBDA = 21888242871839275217838484774961031246154997185409878258781734729429964517155n;
/** Endomorphism coefficient β ∈ Fq: φ(x, y) = (β·x, y). */
export const GLV_BETA = 21888242871839275220042445260109153167277707414472061641714758635765020556616n;

// Gauss-reduced short basis of the GLV lattice { (a, b) : a + b·λ ≡ 0 (mod r) }.
const V1: readonly [bigint, bigint] = [147946756881789319000765030803803410728n, -9931322734385697763n];
const V2: readonly [bigint, bigint] = [-9931322734385697763n, -147946756881789319010696353538189108491n];
const DET = V1[0] * V2[1] - V1[1] * V2[0]; // = -r

function mod(a: bigint, p: bigint): bigint {
  const r = a % p;
  return r < 0n ? r + p : r;
}

// Load-time sanity: the eigenvalue/coefficient identities and the lattice.
if (mod(GLV_LAMBDA * GLV_LAMBDA + GLV_LAMBDA + 1n, BN254_FR) !== 0n) {
  throw new Error('[glv] λ² + λ + 1 ≢ 0 mod r');
}
if (mod(GLV_BETA * GLV_BETA + GLV_BETA + 1n, BN254_FQ) !== 0n) {
  throw new Error('[glv] β² + β + 1 ≢ 0 mod q');
}
if (DET !== -BN254_FR) {
  throw new Error('[glv] lattice basis determinant != -r');
}

function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

// Round num/den to the nearest integer, ties away from zero. BigInt `/`
// truncates toward zero, so we correct by inspecting the remainder.
function roundDiv(num: bigint, den: bigint): bigint {
  let q = num / den;
  const rem = num - q * den;
  if (2n * absBig(rem) >= absBig(den)) {
    q += num < 0n === den < 0n ? 1n : -1n;
  }
  return q;
}

export interface GlvSplit {
  /** Signed short scalars with k ≡ k1 + λ·k2 (mod r), |k1|,|k2| ≲ 2^127. */
  k1: bigint;
  k2: bigint;
}

/**
 * Split a scalar k ∈ [0, r) into (k1, k2) via Babai rounding on the reduced
 * lattice basis. Both magnitudes are < 2^127 for every BN254 scalar.
 */
export function glvSplit(k: bigint): GlvSplit {
  const kk = mod(k, BN254_FR);
  // Solve (k, 0) = b1·V1 + b2·V2 over the rationals, then round.
  const b1 = roundDiv(kk * V2[1], DET);
  const b2 = roundDiv(-kk * V1[1], DET);
  const k1 = kk - (b1 * V1[0] + b2 * V2[0]);
  const k2 = -(b1 * V1[1] + b2 * V2[1]);
  return { k1, k2 };
}

function readLe(buf: Uint8Array, off: number, len: number): bigint {
  let v = 0n;
  for (let i = len - 1; i >= 0; i--) v = (v << 8n) | BigInt(buf[off + i]);
  return v;
}

function writeLe32(buf: Uint8Array, off: number, v: bigint): void {
  let x = v;
  for (let i = 0; i < 32; i++) {
    buf[off + i] = Number(x & 0xffn);
    x >>= 8n;
  }
}

/**
 * Build the doubled (point, scalar) buffers for a GLV MSM. Given the original
 * n affine points (`pointsLE`: n × 64 LE bytes, x‖y, non-Montgomery) and n
 * scalars (`scalarsLE`: n × 32 LE bytes, Fr), produces 2n points and 2n
 * non-negative <2^127 scalars suitable for `MsmV2` with `scalarBits = 128`:
 *
 *   slot 2i:    (sign(k1) · Pᵢ,        |k1ᵢ|)
 *   slot 2i+1:  (sign(k2) · φ(Pᵢ),     |k2ᵢ|)
 *
 * φ(Pᵢ) = (β·xᵢ, yᵢ); negation flips y → q − y (free in affine). The result of
 * the 2n-pair MSM equals Σ kᵢ Pᵢ.
 */
export function buildGlvInputs(
  pointsLE: Uint8Array,
  scalarsLE: Uint8Array,
  n: number,
): { pointsBuf: Uint8Array; scalarsBuf: Uint8Array; maxBits: number } {
  const pointsBuf = new Uint8Array(2 * n * 64);
  const scalarsBuf = new Uint8Array(2 * n * 32);
  let maxBits = 0;

  for (let i = 0; i < n; i++) {
    const x = readLe(pointsLE, i * 64, 32);
    const y = readLe(pointsLE, i * 64 + 32, 32);
    const k = readLe(scalarsLE, i * 32, 32);
    const { k1, k2 } = glvSplit(k);

    const negY = mod(-y, BN254_FQ); // -P / -φ(P) y-coordinate
    const phiX = mod(GLV_BETA * x, BN254_FQ);

    // slot 2i: ±P with |k1|
    const a = 2 * i;
    writeLe32(pointsBuf, a * 64, x);
    writeLe32(pointsBuf, a * 64 + 32, k1 < 0n ? negY : y);
    const m1 = absBig(k1);
    writeLe32(scalarsBuf, a * 32, m1);

    // slot 2i+1: ±φ(P) with |k2|
    const b = 2 * i + 1;
    writeLe32(pointsBuf, b * 64, phiX);
    writeLe32(pointsBuf, b * 64 + 32, k2 < 0n ? negY : y);
    const m2 = absBig(k2);
    writeLe32(scalarsBuf, b * 32, m2);

    const bits = Math.max(m1.toString(2).length, m2.toString(2).length);
    if (bits > maxBits) maxBits = bits;
  }

  return { pointsBuf, scalarsBuf, maxBits };
}
