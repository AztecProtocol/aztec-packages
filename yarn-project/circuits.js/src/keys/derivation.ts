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
  // Given h, our preaddress, and our ivpk_m, we can derive our address point.
  // All we need to do is:
  // First, take our preaddress, and multiply it by the generator G
  const preaddressPoint = derivePublicKeyFromSecretKey(new Fq(preaddress.toBigInt()));
  // Then we add our ivpk_m to it. Tada !
  const addressPoint = new Grumpkin().add(preaddressPoint, ivpkM);

  return addressPoint;
}

export function computeAddressSecret(preaddress: Fr, ivsk: Fq) {
  // TLDR; (h + ivsk) * G = P1
  // if P1.y is pos
  //   S = (h + ivsk)
  // else
  //   S = Fq.MODULUS - (h + ivsk)
  //
  // Given h, our preaddress, and our ivsk, we have two different addressSecret candidates. One encodes to a point with a positive y-coordinate
  // and the other encodes to a point with a negative y-coordinate. We take the addressSecret candidate that is a simple addition of the two Scalars.
  const addressSecretCandidate = ivsk.add(new Fq(preaddress.toBigInt()));
  // We then multiply this secretCandidate by the generator G to create an addressPoint candidate.
  const addressPointCandidate = derivePublicKeyFromSecretKey(addressSecretCandidate);

  // Because all encryption to addresses is done using a point with the positive y-coordinate, if our addressSecret candidate derives a point with a
  // negative y-coordinate, we use the other candidate by negating the secret. This transformation of the secret simply flips the y-coordinate of the derived point while keeping the x-coordinate the same.
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
