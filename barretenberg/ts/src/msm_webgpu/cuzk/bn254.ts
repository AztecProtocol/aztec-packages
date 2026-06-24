export type Bn254Point = {
  x: bigint;
  y: bigint;
  infinity?: boolean;
};

export const BN254_BASE_FIELD = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583",
);

export const BN254_SCALAR_FIELD = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

export const BN254_ZERO: Bn254Point = {
  x: BigInt(0),
  y: BigInt(1),
  infinity: true,
};

const mod = (value: bigint, modulus = BN254_BASE_FIELD): bigint => {
  const result = value % modulus;
  return result >= BigInt(0) ? result : result + modulus;
};

export const modInverse = (
  value: bigint,
  modulus = BN254_BASE_FIELD,
): bigint => {
  let t = BigInt(0);
  let newT = BigInt(1);
  let r = modulus;
  let newR = mod(value, modulus);

  while (newR !== BigInt(0)) {
    const quotient = r / newR;
    [t, newT] = [newT, t - quotient * newT];
    [r, newR] = [newR, r - quotient * newR];
  }

  if (r > BigInt(1)) {
    throw new Error("value is not invertible");
  }

  return mod(t, modulus);
};

export const bn254BaseField = {
  add: (a: bigint, b: bigint) => mod(a + b, BN254_BASE_FIELD),
  sub: (a: bigint, b: bigint) => mod(a - b, BN254_BASE_FIELD),
  mul: (a: bigint, b: bigint) => mod(a * b, BN254_BASE_FIELD),
  inv: (a: bigint) => modInverse(a, BN254_BASE_FIELD),
  neg: (a: bigint) => mod(-a, BN254_BASE_FIELD),
};

export const bn254ScalarField = {
  add: (a: bigint, b: bigint) => mod(a + b, BN254_SCALAR_FIELD),
  sub: (a: bigint, b: bigint) => mod(a - b, BN254_SCALAR_FIELD),
  mul: (a: bigint, b: bigint) => mod(a * b, BN254_SCALAR_FIELD),
  inv: (a: bigint) => modInverse(a, BN254_SCALAR_FIELD),
  neg: (a: bigint) => mod(-a, BN254_SCALAR_FIELD),
};

export const createBn254AffinePoint = (
  x: bigint,
  y: bigint,
  z = BigInt(1),
): Bn254Point => {
  if (mod(z) === BigInt(0)) {
    return BN254_ZERO;
  }

  const zInv = modInverse(z);
  return {
    x: mod(x * zInv),
    y: mod(y * zInv),
  };
};

// Convert a Jacobian point (X, Y, Z) where affine = (X/Z^2, Y/Z^3) to affine.
// Used by the GPU readback path when the WebGPU shader produces Jacobian
// coordinates (the BN254 path — see src/submission/implementation/wgsl/curve/
// ec_bn254.template.wgsl). The projective variant is createBn254AffinePoint.
export const createBn254AffinePointFromJacobian = (
  x: bigint,
  y: bigint,
  z: bigint,
): Bn254Point => {
  if (mod(z) === BigInt(0)) {
    return BN254_ZERO;
  }

  const zInv = modInverse(z);
  const zInv2 = mod(zInv * zInv);
  const zInv3 = mod(zInv2 * zInv);
  return {
    x: mod(x * zInv2),
    y: mod(y * zInv3),
  };
};

/**
 * Jacobian point representation: (X : Y : Z) with affine = (X/Z^2, Y/Z^3).
 * Identity has Z == 0.
 *
 * Used by the post-GPU-readback Horner loop in submission.ts to avoid the
 * 4096 modular inversions per MSM call that the original affine path
 * required (one per Jacobian→affine conversion, plus one per affine add).
 * Keeping the entire CPU side of the MSM in Jacobian drops that to a
 * single inversion at the very end.
 */
export type Bn254Jacobian = {
  x: bigint;
  y: bigint;
  z: bigint;
};

export const BN254_JACOBIAN_ZERO: Bn254Jacobian = {
  x: BigInt(0),
  y: BigInt(1),
  z: BigInt(0),
};

// EFD: g1p/auto-shortw-jacobian-0/doubling/dbl-2009-l (a = 0). 2M + 5S.
export const doubleBn254Jacobian = (p: Bn254Jacobian): Bn254Jacobian => {
  if (p.z === BigInt(0)) return p;
  const { x: X, y: Y, z: Z } = p;

  const A = mod(X * X);
  const B = mod(Y * Y);
  const C = mod(B * B);

  const XpB = X + B;
  const D = mod(BigInt(2) * mod(mod(XpB * XpB) - A - C));
  const E = BigInt(3) * A;
  const F = mod(E * E);

  const X3 = mod(F - BigInt(2) * D);
  const Y3 = mod(E * mod(D - X3) - BigInt(8) * C);
  const Z3 = mod(BigInt(2) * Y * Z);

  return { x: X3, y: Y3, z: Z3 };
};

// EFD: g1p/auto-shortw-jacobian-0/addition/add-2007-bl. 11M + 5S. NOT
// strongly unified — hits (0,0,0) when p1 == p2, so we fall back to
// double_point on collision.
export const addBn254Jacobian = (
  p1: Bn254Jacobian,
  p2: Bn254Jacobian,
): Bn254Jacobian => {
  if (p1.z === BigInt(0)) return p2;
  if (p2.z === BigInt(0)) return p1;

  const { x: X1, y: Y1, z: Z1 } = p1;
  const { x: X2, y: Y2, z: Z2 } = p2;

  const Z1Z1 = mod(Z1 * Z1);
  const Z2Z2 = mod(Z2 * Z2);
  const U1 = mod(X1 * Z2Z2);
  const U2 = mod(X2 * Z1Z1);
  const S1 = mod(mod(Y1 * Z2) * Z2Z2);
  const S2 = mod(mod(Y2 * Z1) * Z1Z1);

  // Collision: affine-X match iff U1 == U2. Affine-Y match iff S1 == S2.
  if (U1 === U2) {
    if (S1 === S2) return doubleBn254Jacobian(p1);
    return BN254_JACOBIAN_ZERO;
  }

  const H = mod(U2 - U1);
  const twoH = BigInt(2) * H;
  const I = mod(twoH * twoH);
  const J = mod(H * I);
  const r = mod(BigInt(2) * mod(S2 - S1));
  const V = mod(U1 * I);

  const X3 = mod(mod(r * r) - J - BigInt(2) * V);
  const Y3 = mod(mod(r * mod(V - X3)) - BigInt(2) * mod(S1 * J));
  const ZpZ = Z1 + Z2;
  const Z3 = mod(mod(mod(ZpZ * ZpZ) - Z1Z1 - Z2Z2) * H);

  return { x: X3, y: Y3, z: Z3 };
};

// Scalar multiplication on Jacobian points (double-and-add). Used in the
// CPU-side Horner combine over T subtask sums — T is small (≤ 16 in the
// BN254 pipeline), so this ends up being ≤ 16 × 128 point operations.
export const scalarMultBn254Jacobian = (
  p: Bn254Jacobian,
  k: bigint,
): Bn254Jacobian => {
  let result = BN254_JACOBIAN_ZERO;
  let addend = p;
  let remaining = k;
  while (remaining > BigInt(0)) {
    if ((remaining & BigInt(1)) === BigInt(1)) {
      result = addBn254Jacobian(result, addend);
    }
    addend = doubleBn254Jacobian(addend);
    remaining >>= BigInt(1);
  }
  return result;
};

// Jacobian → affine. One modular inversion (amortised across as many
// adds as you piled up before calling this).
export const toAffineBn254Jacobian = (p: Bn254Jacobian): Bn254Point => {
  if (p.z === BigInt(0)) return BN254_ZERO;
  const zInv = modInverse(p.z);
  const zInv2 = mod(zInv * zInv);
  const zInv3 = mod(zInv2 * zInv);
  return {
    x: mod(p.x * zInv2),
    y: mod(p.y * zInv3),
  };
};

export const isBn254Zero = (point: Bn254Point): boolean =>
  point.infinity === true;

export const isBn254OnCurve = (point: Bn254Point): boolean => {
  if (isBn254Zero(point)) {
    return true;
  }

  return (
    mod(point.y * point.y - point.x * point.x * point.x - BigInt(3)) ===
    BigInt(0)
  );
};

export const negateBn254Point = (point: Bn254Point): Bn254Point => {
  if (isBn254Zero(point)) {
    return point;
  }

  return { x: point.x, y: mod(-point.y) };
};

export const doubleBn254Point = (point: Bn254Point): Bn254Point => {
  if (isBn254Zero(point) || point.y === BigInt(0)) {
    return BN254_ZERO;
  }

  const slope = mod(
    BigInt(3) * point.x * point.x * modInverse(BigInt(2) * point.y),
  );
  const x = mod(slope * slope - BigInt(2) * point.x);
  const y = mod(slope * (point.x - x) - point.y);
  return { x, y };
};

export const addBn254Points = (
  left: Bn254Point,
  right: Bn254Point,
): Bn254Point => {
  if (isBn254Zero(left)) {
    return right;
  }
  if (isBn254Zero(right)) {
    return left;
  }

  if (left.x === right.x) {
    if (mod(left.y + right.y) === BigInt(0)) {
      return BN254_ZERO;
    }

    return doubleBn254Point(left);
  }

  const slope = mod((right.y - left.y) * modInverse(right.x - left.x));
  const x = mod(slope * slope - left.x - right.x);
  const y = mod(slope * (left.x - x) - left.y);
  return { x, y };
};

export const scalarMultBn254Point = (
  point: Bn254Point,
  scalar: bigint,
): Bn254Point => {
  let result = BN254_ZERO;
  let addend = point;
  let remaining = scalar;

  while (remaining > BigInt(0)) {
    if ((remaining & BigInt(1)) === BigInt(1)) {
      result = addBn254Points(result, addend);
    }

    addend = doubleBn254Point(addend);
    remaining >>= BigInt(1);
  }

  return result;
};

export const msmBn254 = (
  points: Bn254Point[],
  scalars: bigint[],
): Bn254Point => {
  if (points.length !== scalars.length) {
    throw new Error("points and scalars length mismatch");
  }

  let result = BN254_ZERO;
  for (let i = 0; i < points.length; i++) {
    result = addBn254Points(
      result,
      scalarMultBn254Point(points[i], scalars[i]),
    );
  }

  return result;
};

export const getBn254BigIntXY = (
  point: Bn254Point,
): { x: bigint; y: bigint } => ({
  x: point.x,
  y: point.y,
});
