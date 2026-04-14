import { DomainSeparator } from '@aztec/constants';
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';

import type { AztecAddress } from '../aztec-address/index.js';
import type { PublicKey } from '../keys/public_key.js';

/**
 * Derives an app-siloed ECDH shared secret.
 *
 * Computes the raw ECDH shared secret `S = secretKey * publicKey`, then app-silos it:
 * `s_app = h(DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET, S.x, S.y, contractAddress)`
 *
 * @param secretKey - The secret key used to derive shared secret.
 * @param publicKey - The public key used to derive shared secret.
 * @param contractAddress - The address of the calling contract, used for app-siloing.
 * @returns The app-siloed shared secret as a Field.
 * @throws If the publicKey is zero.
 */
export async function deriveAppSiloedSharedSecret(
  secretKey: GrumpkinScalar,
  publicKey: PublicKey,
  contractAddress: AztecAddress,
): Promise<Fr> {
  if (publicKey.isZero()) {
    throw new Error(
      `Attempting to derive a shared secret with a zero public key. You have probably passed a zero public key in your Noir code somewhere thinking that the note won't be broadcast... but it was.`,
    );
  }
  const rawSharedSecret = await Grumpkin.mul(publicKey, secretKey);
  return poseidon2HashWithSeparator(
    [rawSharedSecret.x, rawSharedSecret.y, contractAddress],
    DomainSeparator.APP_SILOED_ECDH_SHARED_SECRET,
  );
}
