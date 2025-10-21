import { bn254 } from '@noble/curves/bn254';

/**
 * BN254 G1 point operations for BLS signatures.
 * Provides compression, decompression, and public key generation for the BN254 curve.
 */

/**
 * Generate a compressed BN254 G1 public key from a private key.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns Compressed G1 point (32 bytes with sign bit in MSB)
 */
export function computeBn254G1PublicKeyCompressed(privateKeyHex: string): string {
  const sk = BigInt(privateKeyHex);
  const skReduced = sk % bn254.fields.Fr.ORDER;

  // Generate G1 point on BN254 curve
  const pk1 = bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();

  // Compress the point: 32 bytes of x-coordinate with y parity in MSB
  return compressBn254G1Point(pk1);
}

/**
 * Generate uncompressed BN254 G1 public key from a private key.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns G1 point in affine coordinates
 */
export function computeBn254G1PublicKey(privateKeyHex: string): { x: bigint; y: bigint } {
  const sk = BigInt(privateKeyHex);
  const skReduced = sk % bn254.fields.Fr.ORDER;

  return bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();
}

/**
 * Generate BN254 G2 public key from a private key.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns G2 point in affine coordinates
 */
export function computeBn254G2PublicKey(privateKeyHex: string): {
  x: { c0: bigint; c1: bigint };
  y: { c0: bigint; c1: bigint };
} {
  const sk = BigInt(privateKeyHex);
  const skReduced = sk % bn254.fields.Fr.ORDER;

  return bn254.G2.ProjectivePoint.BASE.multiply(skReduced).toAffine();
}

/**
 * Compress a BN254 G1 point to 32 bytes.
 * Format: x-coordinate (32 bytes) with MSB indicating y parity
 *
 * @param point - BN254 G1 point in affine coordinates
 * @returns Compressed point as 0x-prefixed hex string (32 bytes)
 */
export function compressBn254G1Point(point: { x: bigint; y: bigint }): string {
  const xBytes = new Uint8Array(32);
  const xBigInt = point.x;

  // Write x coordinate in big-endian format
  for (let i = 0; i < 32; i++) {
    xBytes[31 - i] = Number((xBigInt >> BigInt(8 * i)) & 0xffn);
  }

  // Set MSB if y is odd (following standard point compression)
  const yParity = point.y & 1n;
  if (yParity) {
    xBytes[0] |= 0x80;
  }

  return '0x' + Buffer.from(xBytes).toString('hex');
}

/**
 * Decompress a BN254 G1 point from 32 bytes.
 *
 * @param compressed - Compressed point as 0x-prefixed hex string (32 bytes)
 * @returns BN254 G1 point in affine coordinates
 */
export function decompressBn254G1Point(compressed: string): { x: bigint; y: bigint } {
  const bytes = Buffer.from(compressed.replace(/^0x/i, ''), 'hex');
  if (bytes.length !== 32) {
    throw new Error(`Compressed point must be 32 bytes, got ${bytes.length}`);
  }

  // Extract y parity from MSB
  const yParity = (bytes[0] & 0x80) !== 0;

  // Clear the parity bit to get x
  bytes[0] &= 0x7f;
  const x = BigInt('0x' + bytes.toString('hex'));

  if (x >= bn254.fields.Fp.ORDER) {
    throw new Error('x-coordinate out of field range');
  }

  // Compute y from curve equation: y² = x³ + 3 (BN254: b=3, a=0)
  const xSquared = (x * x) % bn254.fields.Fp.ORDER;
  const xCubed = (xSquared * x) % bn254.fields.Fp.ORDER;
  const ySquared = (xCubed + 3n) % bn254.fields.Fp.ORDER;

  // Compute square root using BN254-specific formula
  const y = modularSqrtBn254(ySquared);
  if (y === null) {
    throw new Error('Point not on BN254 curve');
  }

  // Select y with correct parity
  const yIsOdd = (y & 1n) === 1n;
  const yFinal = yIsOdd === yParity ? y : bn254.fields.Fp.ORDER - y;

  return { x, y: yFinal };
}

/**
 * Compute modular square root for BN254 field.
 * BN254 has p ≡ 3 (mod 4), so we can use the simple formula: sqrt(a) = a^((p+1)/4) mod p
 *
 * @param a - Value to find square root of
 * @returns Square root or null if not a quadratic residue
 */
function modularSqrtBn254(a: bigint): bigint | null {
  if (a === 0n) {
    return 0n;
  }

  const p = bn254.fields.Fp.ORDER;

  // For BN254, p ≡ 3 (mod 4), so sqrt(a) = a^((p+1)/4) mod p
  const exponent = (p + 1n) / 4n;
  const y = modPow(a, exponent, p);

  // Verify it's actually a square root
  if ((y * y) % p !== a % p) {
    return null;
  }

  return y;
}

/**
 * Modular exponentiation: base^exp mod modulus
 * Uses square-and-multiply algorithm for efficiency
 */
function modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
  let result = 1n;
  base = base % modulus;

  while (exp > 0n) {
    if (exp & 1n) {
      result = (result * base) % modulus;
    }
    exp = exp >> 1n;
    base = (base * base) % modulus;
  }

  return result;
}

/**
 * Verify that a point is on the BN254 curve.
 *
 * @param point - Point to verify
 * @returns True if the point is on the curve
 */
export function isOnBn254Curve(point: { x: bigint; y: bigint }): boolean {
  // Check curve equation: y² = x³ + 3
  const lhs = (point.y * point.y) % bn254.fields.Fp.ORDER;
  const xSquared = (point.x * point.x) % bn254.fields.Fp.ORDER;
  const xCubed = (xSquared * point.x) % bn254.fields.Fp.ORDER;
  const rhs = (xCubed + 3n) % bn254.fields.Fp.ORDER;

  return lhs === rhs;
}
