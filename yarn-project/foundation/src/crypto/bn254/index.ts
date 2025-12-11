import { Fr } from '../../curves/bn254/field.js';
import { Bn254G1Point, Bn254G2Point } from '../../curves/bn254/point.js';

/**
 * BN254 utility functions for point operations.
 * Provides compression, decompression, and public key generation for the BN254 curve.
 * Uses the bb.js Barretenberg backend for point operations.
 */

/**
 * Generate a compressed BN254 G1 public key from a private key.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns Compressed G1 point (32 bytes with sign bit in MSB)
 */
export async function computeBn254G1PublicKeyCompressed(privateKeyHex: string): Promise<string> {
  const sk = BigInt(privateKeyHex);
  const skReduced = sk % Fr.MODULUS;

  // Generate G1 point on BN254 curve using bb.js
  const scalar = Fr.fromString(skReduced.toString());
  const pk1 = await Bn254G1Point.generator(scalar);

  // Compress the point using the primitive method
  return '0x' + pk1.compress().toString('hex');
}

/**
 * Generate uncompressed BN254 G1 public key from a private key.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns G1 point in affine coordinates
 */
export async function computeBn254G1PublicKey(privateKeyHex: string): Promise<{ x: bigint; y: bigint }> {
  const sk = BigInt(privateKeyHex);
  const skReduced = sk % Fr.MODULUS;

  const scalar = Fr.fromString(skReduced.toString());
  const pk1 = await Bn254G1Point.generator(scalar);

  return { x: pk1.x.toBigInt(), y: pk1.y.toBigInt() };
}

/**
 * Generate BN254 G2 public key from a private key.
 *
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns G2 point in affine coordinates
 */
export async function computeBn254G2PublicKey(privateKeyHex: string): Promise<{
  x: { c0: bigint; c1: bigint };
  y: { c0: bigint; c1: bigint };
}> {
  const sk = BigInt(privateKeyHex);
  const skReduced = sk % Fr.MODULUS;

  const scalar = Fr.fromString(skReduced.toString());
  const pk2 = await Bn254G2Point.generator(scalar);

  return {
    x: { c0: pk2.x[0].toBigInt(), c1: pk2.x[1].toBigInt() },
    y: { c0: pk2.y[0].toBigInt(), c1: pk2.y[1].toBigInt() },
  };
}
