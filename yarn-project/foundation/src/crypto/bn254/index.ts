import { BarretenbergSync } from '@aztec/bb.js';

/**
 * BN254 elliptic curve operations.
 * All operations use barretenberg bbapi for performance.
 */

// BN254 field constants (hardcoded from @noble/curves/bn254)
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

export class Bn254 {
  /**
   * Generate a compressed BN254 G1 public key from a private key.
   *
   * @param privateKeyHex - Private key as 0x-prefixed hex string
   * @returns Compressed G1 point (32 bytes with sign bit in MSB)
   */
  public async computeG1PublicKeyCompressed(privateKeyHex: string): Promise<string> {
    const pk1 = await this.computeG1PublicKey(privateKeyHex);
    return this.compressG1Point(pk1);
  }

  /**
   * Generate uncompressed BN254 G1 public key from a private key.
   * Uses barretenberg for efficient scalar multiplication.
   *
   * @param privateKeyHex - Private key as 0x-prefixed hex string
   * @returns G1 point in affine coordinates
   */
  public async computeG1PublicKey(privateKeyHex: string): Promise<Bn254G1Point> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();

    const sk = BigInt(privateKeyHex);
    const skReduced = sk % BN254_FR_ORDER;

    // Convert scalar to 32-byte buffer (big-endian)
    const scalarHex = skReduced.toString(16).padStart(64, '0');
    const scalarBuffer = Buffer.from(scalarHex, 'hex');

    // Call barretenberg for G1 generator scalar multiplication
    const response = api.bn254G1GeneratorScalarMul({ scalar: scalarBuffer });

    // Convert response buffers back to bigints
    const x = BigInt('0x' + Buffer.from(response.point.x).toString('hex'));
    const y = BigInt('0x' + Buffer.from(response.point.y).toString('hex'));

    return { x, y };
  }

  /**
   * Convert bigint to 32-byte buffer (big-endian)
   */
  private bigintToBuffer(value: bigint): Buffer {
    const hex = value.toString(16).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }

  /**
   * Generate BN254 G2 public key from a private key.
   * Uses barretenberg for efficient scalar multiplication.
   *
   * @param privateKeyHex - Private key as 0x-prefixed hex string
   * @returns G2 point in affine coordinates
   */
  public async computeG2PublicKey(privateKeyHex: string): Promise<Bn254G2Point> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();

    const sk = BigInt(privateKeyHex);
    const skReduced = sk % BN254_FR_ORDER;

    // Convert scalar to 32-byte buffer (big-endian)
    const scalarHex = skReduced.toString(16).padStart(64, '0');
    const scalarBuffer = Buffer.from(scalarHex, 'hex');

    // Call barretenberg for G2 generator scalar multiplication
    const response = api.bn254G2GeneratorScalarMul({ scalar: scalarBuffer });

    // For G2, x and y are field2 elements serialized as 64-byte buffers (c0 || c1)
    const xBuf = Buffer.from(response.point.x);
    const yBuf = Buffer.from(response.point.y);

    // Extract c0 and c1 components (32 bytes each)
    const xC0 = BigInt('0x' + xBuf.subarray(0, 32).toString('hex'));
    const xC1 = BigInt('0x' + xBuf.subarray(32, 64).toString('hex'));
    const yC0 = BigInt('0x' + yBuf.subarray(0, 32).toString('hex'));
    const yC1 = BigInt('0x' + yBuf.subarray(32, 64).toString('hex'));

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
  public compressG1Point(point: Bn254G1Point): string {
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
  public decompressG1Point(compressed: string): Bn254G1Point {
    const bytes = Buffer.from(compressed.replace(/^0x/i, ''), 'hex');
    if (bytes.length !== 32) {
      throw new Error(`Compressed point must be 32 bytes, got ${bytes.length}`);
    }

    // Extract y parity from MSB
    const yParity = (bytes[0] & 0x80) !== 0;

    // Clear the parity bit to get x
    bytes[0] &= 0x7f;
    const x = BigInt('0x' + bytes.toString('hex'));

    if (x >= BN254_FP_ORDER) {
      throw new Error('x-coordinate out of field range');
    }

    // Compute y from curve equation: y² = x³ + 3 (BN254: b=3, a=0)
    const xSquared = (x * x) % BN254_FP_ORDER;
    const xCubed = (xSquared * x) % BN254_FP_ORDER;
    const ySquared = (xCubed + 3n) % BN254_FP_ORDER;

    // Compute square root using BN254-specific formula
    const y = this.modularSqrt(ySquared);
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
  public async isOnCurve(point: Bn254G1Point): Promise<boolean> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();

    const pointX = this.bigintToBuffer(point.x);
    const pointY = this.bigintToBuffer(point.y);

    const response = api.bn254G1IsOnCurve({ point: { x: pointX, y: pointY } });
    return response.isOnCurve;
  }

  /**
   * Compute modular square root for BN254 field.
   * BN254 has p ≡ 3 (mod 4), so we can use the simple formula: sqrt(a) = a^((p+1)/4) mod p
   *
   * @param a - Value to find square root of
   * @returns Square root or null if not a quadratic residue
   */
  private modularSqrt(a: bigint): bigint | null {
    if (a === 0n) {
      return 0n;
    }

    const p = BN254_FP_ORDER;

    // For BN254, p ≡ 3 (mod 4), so sqrt(a) = a^((p+1)/4) mod p
    const exponent = (p + 1n) / 4n;
    const y = this.modPow(a, exponent, p);

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
  private modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
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
}
