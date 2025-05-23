import { Grumpkin } from '@aztec/foundation/crypto';
import type { GrumpkinScalar, Point } from '@aztec/foundation/fields';

import type { PublicKey } from '../keys/public_key.js';

/**
 * Derive an Elliptic Curve Diffie-Hellman (ECDH) Shared Secret.
 * The function takes in an ECDH public key, a private key, and a Grumpkin instance to compute
 * the shared secret.
 *
 * @param secretKey - The secret key used to derive shared secret.
 * @param publicKey - The public key used to derive shared secret.
 * @returns A derived shared secret.
 * @throws If the publicKey is zero.
 *
 * TODO(#12656): This function is kept around because of the getSharedSecret oracle. Nuke this once returning
 * the app-siloed secret.
 */
export async function deriveEcdhSharedSecret(secretKey: GrumpkinScalar, publicKey: PublicKey): Promise<Point> {
  if (publicKey.isZero()) {
    throw new Error(
      `Attempting to derive a shared secret with a zero public key. You have probably passed a zero public key in your Noir code somewhere thinking that the note won't be broadcast... but it was.`,
    );
  }
  const curve = new Grumpkin();
  const sharedSecret = await curve.mul(publicKey, secretKey);
  return sharedSecret;
}
