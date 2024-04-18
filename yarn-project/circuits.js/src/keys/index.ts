import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { pedersenHash, poseidon2Hash, sha512ToGrumpkinScalar } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';

import { Grumpkin } from '../barretenberg/crypto/grumpkin/index.js';
import { GeneratorIndex } from '../constants.gen.js';
import { type GrumpkinPrivateKey } from '../types/grumpkin_private_key.js';

export function computeAppNullifierSecretKey(masterNullifierSecretKey: GrumpkinPrivateKey, app: AztecAddress): Fr {
  return poseidon2Hash([masterNullifierSecretKey.high, masterNullifierSecretKey.low, app, GeneratorIndex.NSK_M]);
}

export function deriveMasterIncomingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

// TODO(#5726): nuke all that follows?
/**
 *  Derives the public key of a secret key.
 */
export function derivePublicKey(secretKey: GrumpkinPrivateKey) {
  const grumpkin = new Grumpkin();
  return grumpkin.mul(grumpkin.generator(), secretKey);
}

/**
 * Derives a new secret key from a secret key and an index.
 */
function deriveSecretKey(secretKey: GrumpkinPrivateKey, index: Fr): GrumpkinPrivateKey {
  // TODO: Temporary hack. Should replace it with a secure way to derive the secret key.
  // Match the way keys are derived in noir-protocol-circuits/crates/types/src/keys.nr
  const hash = pedersenHash([secretKey.high, secretKey.low, index]);
  return new GrumpkinScalar(hash.toBuffer());
}

/**
 * Computes the nullifier secret key from seed secret key.
 */
export function computeNullifierSecretKey(seedSecretKey: GrumpkinPrivateKey): GrumpkinPrivateKey {
  return deriveSecretKey(seedSecretKey, new Fr(1));
}

/**
 * Computes the nullifier secret key for a contract.
 */
export function computeSiloedNullifierSecretKey(
  nullifierSecretKey: GrumpkinPrivateKey,
  contractAddress: AztecAddress,
): GrumpkinPrivateKey {
  return deriveSecretKey(nullifierSecretKey, contractAddress);
}
