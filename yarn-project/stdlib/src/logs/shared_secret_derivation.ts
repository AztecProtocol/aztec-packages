import { DomainSeparator } from '@aztec/constants';
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';

import type { AztecAddress } from '../aztec-address/index.js';
import type { PublicKey } from '../keys/public_key.js';

/**
 * Derives the raw ECDH shared secret point `S = secretKey * publicKey`.
 *
 * @throws If the publicKey is zero.
 */
export function deriveEcdhSharedSecretPoint(secretKey: GrumpkinScalar, publicKey: PublicKey): Promise<Point> {
  if (publicKey.isZero()) {
    throw new Error(
      `Attempting to derive a shared secret with a zero public key. You have probably passed a zero public key in your Noir code somewhere thinking that the note won't be broadcast... but it was.`,
    );
  }
  return Grumpkin.mul(publicKey, secretKey);
}

/**
 * Derives an app-siloed ECDH shared secret from keys: ECDHs `S = secretKey * publicKey` via
 * {@link deriveEcdhSharedSecretPoint}, then app-silos it via {@link appSiloEcdhSharedSecretPoint}.
 *
 * @param secretKey - The secret key used to derive shared secret.
 * @param publicKey - The public key used to derive shared secret.
 * @param contractAddress - The address of the calling contract, used for app-siloing.
 * @returns The app-siloed shared secret as a Field.
 * @throws If the publicKey is zero.
 */
export async function appSiloEcdhSharedSecret(
  secretKey: GrumpkinScalar,
  publicKey: PublicKey,
  contractAddress: AztecAddress,
): Promise<Fr> {
  const rawSharedSecret = await deriveEcdhSharedSecretPoint(secretKey, publicKey);
  return appSiloEcdhSharedSecretPoint(rawSharedSecret, contractAddress);
}

/**
 * App-silos a shared secret point: `s_app = h(DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET, S.x, S.y, app)`.
 *
 * Mirrors `compute_app_siloed_shared_secret` in aztec-nr.
 *
 * @param point - The raw shared secret point `S`.
 * @param app - The contract address to silo to.
 */
export function appSiloEcdhSharedSecretPoint(point: Point, app: AztecAddress): Promise<Fr> {
  return poseidon2HashWithSeparator([point.x, point.y, app], DomainSeparator.APP_SILOED_ECDH_SHARED_SECRET);
}
