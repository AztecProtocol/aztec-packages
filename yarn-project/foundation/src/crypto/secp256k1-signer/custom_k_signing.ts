import { invert, mod } from '@noble/curves/abstract/modular';
import { secp256k1 } from '@noble/curves/secp256k1';

import { Buffer32 } from '../../buffer/buffer32.js';
import { Signature } from '../../eth-signature/eth_signature.js';

/**
 * Signs a message using ECDSA with a custom k value
 *
 * WARNING: This bypasses RFC 6979 deterministic signatures.
 * Only use for testing/red-teaming purposes. Never reuse k values.
 *
 * ECDSA Algorithm:
 * 1. R = k * G (where G is the generator point)
 * 2. r = R.x mod n
 * 3. s = k^(-1) * (hash + r * privateKey) mod n
 * 4. Return (r, s, recovery)
 *
 * @param messageHash - The keccak256 hash to sign (32 bytes)
 * @param privateKey - The ECDSA private key
 * @param k - The custom k value (must be in range (0, n))
 * @returns Signature with r, s, and v (Ethereum format)
 */
export function signMessageWithCustomK(messageHash: Buffer32, privateKey: Buffer, k: bigint): Signature {
  const n = secp256k1.CURVE.n;

  // Validate k is in valid range (0, n)
  if (k <= 0n || k >= n) {
    throw new Error(`Invalid k value: must be in range (0, ${n}), got ${k}`);
  }

  // Step 1: Calculate R = k * G
  const R = secp256k1.ProjectivePoint.BASE.multiply(k);

  // Convert to affine coordinates to get x and y
  const affineR = R.toAffine();

  // Step 2: Calculate r = R.x mod n
  const r = mod(affineR.x, n);

  // Verify r is not zero (extremely rare)
  if (r === 0n) {
    throw new Error('Invalid signature: r is zero');
  }

  // Step 3: Calculate s = k^(-1) * (hash + r * privateKey) mod n
  const privateKeyBigInt = bytesToNumberBE(new Uint8Array(privateKey));
  const messageHashBigInt = bytesToNumberBE(messageHash.buffer);

  // Calculate k inverse using the invert function
  const kInv = invert(k, n);

  // Calculate s = k^(-1) * (hash + r * privateKey) mod n
  const s = mod(kInv * mod(messageHashBigInt + r * privateKeyBigInt, n), n);

  // Verify s is not zero (extremely rare)
  if (s === 0n) {
    throw new Error('Invalid signature: s is zero');
  }

  // Step 4: Determine recovery bit from y-coordinate parity
  const recovery = affineR.y & 1n;

  // Convert to Ethereum v format (27 or 28)
  const v = recovery === 0n ? 27 : 28;

  // Return signature in Ethereum format
  return new Signature(Buffer32.fromBigInt(r), Buffer32.fromBigInt(s), v);
}

/**
 * Convert byte array to bigint (big-endian)
 */
function bytesToNumberBE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}
