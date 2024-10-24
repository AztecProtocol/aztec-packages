import { AztecAddress } from '@aztec/foundation/aztec-address';
import { poseidon2HashWithSeparator, sha512ToGrumpkinScalar } from '@aztec/foundation/crypto';
import { Fq, Fr, GrumpkinScalar, Point } from '@aztec/foundation/fields';

import { Grumpkin } from '../barretenberg/crypto/grumpkin/index.js';
import { GeneratorIndex } from '../constants.gen.js';
import { PublicKeys } from '../types/public_keys.js';
import { type KeyPrefix } from './key_types.js';
import { getKeyGenerator } from './utils.js';

export function computeAppNullifierSecretKey(masterNullifierSecretKey: GrumpkinScalar, app: AztecAddress): Fr {
  return computeAppSecretKey(masterNullifierSecretKey, app, 'n'); // 'n' is the key prefix for nullifier secret key
}

export function computeAppSecretKey(skM: GrumpkinScalar, app: AztecAddress, keyPrefix: KeyPrefix): Fr {
  const generator = getKeyGenerator(keyPrefix);
  return poseidon2HashWithSeparator([skM.hi, skM.lo, app], generator);
}

export function computeOvskApp(ovsk: GrumpkinScalar, app: AztecAddress) {
  const ovskAppFr = computeAppSecretKey(ovsk, app, 'ov'); // 'ov' is the key prefix for outgoing viewing key
  // Here we are intentionally converting Fr (output of poseidon) to Fq. This is fine even though a distribution of
  // P = s * G will not be uniform because 2 * (q - r) / q is small.
  return GrumpkinScalar.fromBuffer(ovskAppFr.toBuffer());
}

export function deriveMasterNullifierSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.NSK_M]);
}

export function deriveMasterIncomingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

export function deriveMasterOutgoingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.OVSK_M]);
}

export function deriveSigningKey(secretKey: Fr): GrumpkinScalar {
  // TODO(#5837): come up with a standard signing key derivation scheme instead of using ivsk_m as signing keys here
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

export function computePreaddress(publicKeysHash: Fr, partialAddress: Fr) {
  return poseidon2HashWithSeparator([publicKeysHash, partialAddress], GeneratorIndex.CONTRACT_ADDRESS_V1);
}

export function computeAddress(publicKeys: PublicKeys, partialAddress: Fr) {
  const preaddress = computePreaddress(publicKeys.hash(), partialAddress);
  const address = computeAddressFromPreaddressAndIvpkM(preaddress, publicKeys.masterIncomingViewingPublicKey);

  return address;
}

export function computeAddressFromPreaddressAndIvpkM(preaddress: Fr, ivpkM: Point) {
  const addressPoint = computeAddressPointFromPreaddressAndIvpkM(preaddress, ivpkM);

  return AztecAddress.fromField(addressPoint.x);
}

export function computeAddressPointFromPreaddressAndIvpkM(preaddress: Fr, ivpkM: Point) {
  const preaddressPoint = derivePublicKeyFromSecretKey(new Fq(preaddress.toBigInt()));
  const addressPoint = new Grumpkin().add(preaddressPoint, ivpkM);

  return addressPoint;
}

export function computeAddressSecret(preaddress: Fr, ivsk: Fq) {
  const addressSecretCandidate = ivsk.add(new Fq(preaddress.toBigInt()));
  const addressPointCandidate = derivePublicKeyFromSecretKey(addressSecretCandidate);

  // If our secret computes a point with a negative y-coordinate, we then negate the secret to produce the secret
  // that can decrypt payloads encrypted with the point having a positive y-coordinate.
  if (!(addressPointCandidate.y.toBigInt() <= (Fr.MODULUS - 1n) / 2n)) {
    return new Fq(Fq.MODULUS - addressSecretCandidate.toBigInt());
  }

  return addressSecretCandidate;
}

export function computePoint(address: AztecAddress) {
  return Point.fromXAndSign(address, true);
}

export function derivePublicKeyFromSecretKey(secretKey: Fq) {
  const curve = new Grumpkin();
  return curve.mul(curve.generator(), secretKey);
}

/**
 * Computes secret and public keys and public keys hash from a secret key.
 * @param secretKey - The secret key to derive keys from.
 * @returns The derived keys.
 */
export function deriveKeys(secretKey: Fr) {
  // First we derive master secret keys -  we use sha512 here because this derivation will never take place
  // in a circuit
  const masterNullifierSecretKey = deriveMasterNullifierSecretKey(secretKey);
  const masterIncomingViewingSecretKey = deriveMasterIncomingViewingSecretKey(secretKey);
  const masterOutgoingViewingSecretKey = deriveMasterOutgoingViewingSecretKey(secretKey);
  const masterTaggingSecretKey = sha512ToGrumpkinScalar([secretKey, GeneratorIndex.TSK_M]);

  // Then we derive master public keys
  const masterNullifierPublicKey = derivePublicKeyFromSecretKey(masterNullifierSecretKey);
  const masterIncomingViewingPublicKey = derivePublicKeyFromSecretKey(masterIncomingViewingSecretKey);
  const masterOutgoingViewingPublicKey = derivePublicKeyFromSecretKey(masterOutgoingViewingSecretKey);
  const masterTaggingPublicKey = derivePublicKeyFromSecretKey(masterTaggingSecretKey);

  // We hash the public keys to get the public keys hash
  const publicKeys = new PublicKeys(
    masterNullifierPublicKey,
    masterIncomingViewingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey,
  );

  return {
    masterNullifierSecretKey,
    masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey,
    masterTaggingSecretKey,
    publicKeys,
  };
}
