import { AztecAddress } from '@aztec/foundation/aztec-address';
import { poseidon2Hash, sha512ToGrumpkinScalar } from '@aztec/foundation/crypto';
import { type Fr, type GrumpkinScalar } from '@aztec/foundation/fields';

import { Grumpkin } from '../barretenberg/crypto/grumpkin/index.js';
import { GeneratorIndex } from '../constants.gen.js';
import { type GrumpkinPrivateKey } from '../types/grumpkin_private_key.js';
import { PublicKeys } from '../types/public_keys.js';

export function computeAppNullifierSecretKey(masterNullifierSecretKey: GrumpkinPrivateKey, app: AztecAddress): Fr {
  return poseidon2Hash([masterNullifierSecretKey.high, masterNullifierSecretKey.low, app, GeneratorIndex.NSK_M]);
}

export function deriveMasterNullifierSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.NSK_M]);
}

export function deriveMasterIncomingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

export function deriveSigningKey(secretKey: Fr): GrumpkinScalar {
  // TODO(#5837): come up with a standard signing key derivation scheme instead of using ivsk_m as signing keys here
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

export function computeAddress(publicKeysHash: Fr, partialAddress: Fr) {
  const addressFr = poseidon2Hash([publicKeysHash, partialAddress, GeneratorIndex.CONTRACT_ADDRESS_V1]);
  return AztecAddress.fromField(addressFr);
}

/**
 * Computes secret and public keys and public keys hash from a secret key.
 * @param secretKey - The secret key to derive keys from.
 * @returns The derived keys.
 */
export function deriveKeys(secretKey: Fr) {
  const curve = new Grumpkin();
  // First we derive master secret keys -  we use sha512 here because this derivation will never take place
  // in a circuit
  const masterNullifierSecretKey = deriveMasterNullifierSecretKey(secretKey);
  const masterIncomingViewingSecretKey = deriveMasterIncomingViewingSecretKey(secretKey);
  const masterOutgoingViewingSecretKey = sha512ToGrumpkinScalar([secretKey, GeneratorIndex.OVSK_M]);
  const masterTaggingSecretKey = sha512ToGrumpkinScalar([secretKey, GeneratorIndex.TSK_M]);

  // Then we derive master public keys
  const publicKeys = new PublicKeys(
    curve.mul(curve.generator(), masterNullifierSecretKey),
    curve.mul(curve.generator(), masterIncomingViewingSecretKey),
    curve.mul(curve.generator(), masterOutgoingViewingSecretKey),
    curve.mul(curve.generator(), masterTaggingSecretKey),
  );

  return {
    masterNullifierSecretKey,
    masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey,
    masterTaggingSecretKey,
    publicKeys,
  };
}
