import type { AztecAddress } from '@aztec/foundation/aztec-address';
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import type { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';
import { Fr } from '@aztec/foundation/fields';

import { DomainSeparator } from '../constants.gen.js';
import type { PublicKey } from '../keys/public_key.js';

/**
 * Derive an Elliptic Curve Diffie-Hellman (ECDH) Shared Secret.
 *
 * @param secretKey - The secret key used to derive shared secret.
 * @param publicKey - The public key used to derive shared secret.
 * @returns The raw ECDH shared secret point (before app-siloing).
 * @throws If the publicKey is zero.
 */
export function deriveEcdhSharedSecret(secretKey: GrumpkinScalar, publicKey: PublicKey): Promise<Point> {
  if (publicKey.isZero()) {
    throw new Error(
      `Attempting to derive a shared secret with a zero public key. You have probably passed a zero public key in your Noir code somewhere thinking that the note won't be broadcast... but it was.`,
    );
  }
  return Grumpkin.mul(publicKey, secretKey);
}

/**
 * Computes an app-siloed shared secret from a raw ECDH shared secret point and a contract address.
 *
 * `s_app = h(DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET, S.x, S.y, contractAddress)`
 *
 * Without app-siloing, a malicious contract developer could collect all public ephemeral keys (Epks) and
 * write a contract that calls the `get_shared_secret` oracle for each one. If they trick a user into running
 * their contract, it gains access to the user's oracle and can compute candidate shared secrets for all Epks
 * using the user's address secret key. Some of those will be correct (when the Epk was intended for that user),
 * allowing the attacker to decrypt the associated ciphertexts. By including the contract address in the hash,
 * the oracle returns a different `s_app` for each contract, preventing cross-contract decryption.
 *
 * @param sharedSecret - The raw ECDH shared secret point.
 * @param contractAddress - The address of the calling contract.
 * @returns The app-siloed shared secret as a Field.
 */
export function computeAppSiloedSharedSecret(sharedSecret: Point, contractAddress: AztecAddress): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [sharedSecret.x, sharedSecret.y, contractAddress],
    DomainSeparator.APP_SILOED_ECDH_SHARED_SECRET,
  );
}
