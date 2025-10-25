/**
 * BN254 elliptic curve operations using barretenberg bbapi.
 * All operations use barretenberg for performance.
 */

import { BarretenbergSync } from '../../barretenberg/index.js';

// BN254 field constants
const BN254_FR_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const BN254_FP_ORDER = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

/**
 * BN254 G1 point in affine coordinates
 */
export interface Bn254G1Point {
  x: bigint;
  y: bigint;
}

/**
 * BN254 G2 point in affine coordinates (extension field)
 */
export interface Bn254G2Point {
  x: { c0: bigint; c1: bigint };
  y: { c0: bigint; c1: bigint };
}

/**
 * Convert bigint to 32-byte buffer (big-endian)
 */
function bigintToBuffer(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
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
 * Compute modular square root for BN254 field.
 * BN254 has p ≡ 3 (mod 4), so we can use the simple formula: sqrt(a) = a^((p+1)/4) mod p
 *
 * @param a - Value to find square root of
 * @returns Square root or null if not a quadratic residue
 */
function modularSqrt(a: bigint): bigint | null {
  if (a === 0n) {
    return 0n;
  }

  const p = BN254_FP_ORDER;

  // For BN254, p ≡ 3 (mod 4), so sqrt(a) = a^((p+1)/4) mod p
  const exponent = (p + 1n) / 4n;
  const y = modPow(a, exponent, p);

  // Verify it's actually a square root
  if ((y * y) % p !== a % p) {
    return null;
  }

  return y;
}

// BN254 G1 generator point (hardcoded)
const BN254_G1_GENERATOR: Bn254G1Point = { x: 1n, y: 2n };

/**
 * Generate uncompressed BN254 G1 public key from a private key.
 * Multiplies the G1 generator by the scalar.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns G1 point in affine coordinates
 */
export async function computeG1PublicKey(privateKeyHex: string): Promise<Bn254G1Point> {
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();

  const sk = BigInt(privateKeyHex);
  const skReduced = sk % BN254_FR_ORDER;

  const scalarHex = skReduced.toString(16).padStart(64, '0');
  const scalarBuffer = Uint8Array.from(Buffer.from(scalarHex, 'hex'));

  const generatorX = bigintToBuffer(BN254_G1_GENERATOR.x);
  const generatorY = bigintToBuffer(BN254_G1_GENERATOR.y);

  const response = api.bn254G1Mul({
    point: { x: generatorX, y: generatorY },
    scalar: scalarBuffer,
  });

  const x = BigInt('0x' + Buffer.from(response.point.x).toString('hex'));
  const y = BigInt('0x' + Buffer.from(response.point.y).toString('hex'));

  return { x, y };
}

/**
 * Generate BN254 G2 public key from a private key.
 * Uses barretenberg for efficient scalar multiplication.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns G2 point in affine coordinates
 */
export async function computeG2PublicKey(privateKeyHex: string): Promise<Bn254G2Point> {
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();

  const sk = BigInt(privateKeyHex);
  const skReduced = sk % BN254_FR_ORDER;

  const scalarHex = skReduced.toString(16).padStart(64, '0');
  const scalarBuffer = Uint8Array.from(Buffer.from(scalarHex, 'hex'));

  // BN254 G2 generator (hardcoded, matching C++ implementation)
  // x = (c0, c1) and y = (c0, c1) where each is 32 bytes
  const generatorX = new Uint8Array([
    0x24, 0x00, 0xde, 0xef, 0x12, 0x1f, 0x1e, 0x76, 0x42, 0x6a, 0x00, 0x66, 0x5e, 0x5c, 0x44, 0x79, 0x67, 0x43, 0x22,
    0xd4, 0xf7, 0x5e, 0xda, 0xdd, 0x46, 0xde, 0xbd, 0x5c, 0xd9, 0x92, 0xf6, 0xed, 0x19, 0x8e, 0x93, 0x93, 0x92, 0x0d,
    0x48, 0x3a, 0x72, 0x60, 0xbf, 0xb7, 0x31, 0xfb, 0x5d, 0x25, 0xf1, 0xaa, 0x49, 0x33, 0x35, 0xa9, 0xe7, 0x12, 0x97,
    0xe4, 0x85, 0xb7, 0xae, 0xf3, 0x12, 0xc2,
  ]);
  const generatorY = new Uint8Array([
    0x12, 0xc8, 0x5e, 0xa5, 0xdb, 0x8c, 0x6d, 0xeb, 0x4a, 0xab, 0x71, 0x80, 0x8d, 0xcb, 0x40, 0x8f, 0xe3, 0xd1, 0xe7,
    0x69, 0x0c, 0x43, 0xd3, 0x7b, 0x4c, 0xe6, 0xcc, 0x01, 0x66, 0xfa, 0x7d, 0xaa, 0x09, 0x06, 0x89, 0xd0, 0x58, 0x5f,
    0xf0, 0x75, 0xec, 0x9e, 0x99, 0xad, 0x69, 0x0c, 0x33, 0x95, 0xbc, 0x4b, 0x31, 0x33, 0x70, 0xb3, 0x8e, 0xf3, 0x55,
    0xac, 0xda, 0xdc, 0xd1, 0x22, 0x97, 0x5b,
  ]);

  const response = api.bn254G2Mul({
    point: { x: generatorX, y: generatorY },
    scalar: scalarBuffer,
  });

  // For G2, x and y are field2 elements serialized as 64-byte buffers (c0 || c1)
  const xBuf = new Uint8Array(response.point.x);
  const yBuf = new Uint8Array(response.point.y);

  const xC0 = BigInt('0x' + Buffer.from(xBuf.subarray(0, 32)).toString('hex'));
  const xC1 = BigInt('0x' + Buffer.from(xBuf.subarray(32, 64)).toString('hex'));
  const yC0 = BigInt('0x' + Buffer.from(yBuf.subarray(0, 32)).toString('hex'));
  const yC1 = BigInt('0x' + Buffer.from(yBuf.subarray(32, 64)).toString('hex'));

  return {
    x: { c0: xC0, c1: xC1 },
    y: { c0: yC0, c1: yC1 },
  };
}

/**
 * Compress a BN254 G1 point to 32 bytes.
 * Format: x-coordinate (32 bytes) with MSB indicating y parity
 *
 * @param point - BN254 G1 point in affine coordinates
 * @returns Compressed point as 0x-prefixed hex string (32 bytes)
 */
export function compressG1Point(point: Bn254G1Point): string {
  const xBytes = new Uint8Array(32);

  // Write x coordinate in big-endian format
  for (let i = 0; i < 32; i++) {
    xBytes[31 - i] = Number((point.x >> BigInt(8 * i)) & 0xffn);
  }

  // Set MSB if y is odd (following standard point compression)
  if (point.y & 1n) {
    xBytes[0] |= 0x80;
  }

  return '0x' + Buffer.from(xBytes).toString('hex');
}

/**
 * Compute compressed BN254 G1 public key from a private key.
 * Combines public key computation and point compression.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns Compressed G1 point (32 bytes with sign bit in MSB) as 0x-prefixed hex string
 */
export async function computeBn254G1PublicKeyCompressed(privateKeyHex: string): Promise<string> {
  const point = await computeG1PublicKey(privateKeyHex);
  return compressG1Point(point);
}

/**
 * Decompress a BN254 G1 point from 32 bytes.
 *
 * @param compressed - Compressed point as 0x-prefixed hex string (32 bytes)
 * @returns BN254 G1 point in affine coordinates
 */
export function decompressG1Point(compressed: string): Bn254G1Point {
  const bytes = Uint8Array.from(Buffer.from(compressed.replace(/^0x/i, ''), 'hex'));
  if (bytes.length !== 32) {
    throw new Error(`Compressed point must be 32 bytes, got ${bytes.length}`);
  }

  // Extract y parity from MSB
  const yParity = (bytes[0] & 0x80) !== 0;

  // Clear the parity bit to get x
  bytes[0] &= 0x7f;
  const x = BigInt('0x' + Buffer.from(bytes).toString('hex'));

  if (x >= BN254_FP_ORDER) {
    throw new Error('x-coordinate out of field range');
  }

  // Compute y from curve equation: y² = x³ + 3 (BN254: b=3, a=0)
  const xSquared = (x * x) % BN254_FP_ORDER;
  const xCubed = (xSquared * x) % BN254_FP_ORDER;
  const ySquared = (xCubed + 3n) % BN254_FP_ORDER;

  const y = modularSqrt(ySquared);
  if (y === null) {
    throw new Error('Point not on BN254 curve');
  }

  // Select y with correct parity
  const yIsOdd = (y & 1n) === 1n;
  const yFinal = yIsOdd === yParity ? y : BN254_FP_ORDER - y;

  return { x, y: yFinal };
}

/**
 * Verify that a point is on the BN254 curve.
 *
 * @param point - Point to verify
 * @returns True if the point is on the curve
 */
export async function isOnCurve(point: Bn254G1Point): Promise<boolean> {
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();

  const pointX = bigintToBuffer(point.x);
  const pointY = bigintToBuffer(point.y);

  const response = api.bn254G1IsOnCurve({ point: { x: pointX, y: pointY } });
  return response.isOnCurve;
}
