import { type AztecAddress, type GrumpkinScalar, type Point, type PublicKey } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';

/**
 * Derive an Elliptic Curve Diffie-Hellman (ECDH) Shared Secret.
 * The function takes in an ECDH public key, a private key, and a Grumpkin instance to compute
 * the shared secret.
 *
 * @param secretKey - The secret key used to derive shared secret.
 * @param publicKey - The public key used to derive shared secret.
 * @returns A derived shared secret.
 * @throws If the publicKey is zero.
 */
export function deriveEcdhSharedSecret(secretKey: GrumpkinScalar, publicKey: PublicKey): Point {
  if (publicKey.isZero()) {
    throw new Error(
      `Attempting to derive a shared secret with a zero public key. You have probably passed a zero public key in your Noir code somewhere thinking that the note won't be broadcast... but it was.`,
    );
  }
  const curve = new Grumpkin();
  const sharedSecret = curve.mul(publicKey, secretKey);
  return sharedSecret;
}

export async function deriveEcdhSharedSecretUsingAztecAddress(
  secretKey: GrumpkinScalar,
  address: AztecAddress,
): Promise<Point> {
  const addressPoint = await address.toAddressPoint();
  return deriveEcdhSharedSecret(secretKey, addressPoint);
}
