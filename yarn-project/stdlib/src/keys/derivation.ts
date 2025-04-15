import { GeneratorIndex } from '@aztec/constants';
import { Grumpkin, poseidon2Hash, poseidon2HashWithSeparator, sha512ToGrumpkinScalar } from '@aztec/foundation/crypto';
import { Fq, Fr, GrumpkinScalar } from '@aztec/foundation/fields';

import { AztecAddress } from '../aztec-address/index.js';
import type { CompleteAddress } from '../contract/complete_address.js';
import type { KeyPrefix } from './key_types.js';
import { PublicKeys } from './public_keys.js';
import { getKeyGenerator } from './utils.js';

export function computeAppNullifierSecretKey(masterNullifierSecretKey: GrumpkinScalar, app: AztecAddress): Promise<Fr> {
  return computeAppSecretKey(masterNullifierSecretKey, app, 'n'); // 'n' is the key prefix for nullifier secret key
}

export function computeAppSecretKey(skM: GrumpkinScalar, app: AztecAddress, keyPrefix: KeyPrefix): Promise<Fr> {
  const generator = getKeyGenerator(keyPrefix);
  return poseidon2HashWithSeparator([skM.hi, skM.lo, app], generator);
}

export async function computeOvskApp(ovsk: GrumpkinScalar, app: AztecAddress): Promise<Fq> {
  const ovskAppFr = await computeAppSecretKey(ovsk, app, 'ov'); // 'ov' is the key prefix for outgoing viewing key
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

export async function computeAddress(publicKeys: PublicKeys, partialAddress: Fr): Promise<AztecAddress> {
  // Given public keys and a partial address, we can compute our address in the following steps.
  // 1. preaddress = poseidon2([publicKeysHash, partialAddress], GeneratorIndex.CONTRACT_ADDRESS_V1);
  // 2. addressPoint = (preaddress * G) + ivpk_m
  // 3. address = addressPoint.x
  const preaddress = await computePreaddress(await publicKeys.hash(), partialAddress);
  const address = await new Grumpkin().add(
    await derivePublicKeyFromSecretKey(new Fq(preaddress.toBigInt())),
    publicKeys.masterIncomingViewingPublicKey,
  );

  return new AztecAddress(address.x);
}

export async function computeAddressSecret(preaddress: Fr, ivsk: Fq) {
  // TLDR; P1 = (h + ivsk) * G
  // if P1.y is pos
  //   S = (h + ivsk)
  // else
  //   S = Fq.MODULUS - (h + ivsk)
  //
  // Given h (our preaddress) and our ivsk, we have two different addressSecret candidates. One encodes to a point with a positive y-coordinate
  // and the other encodes to a point with a negative y-coordinate. We take the addressSecret candidate that is a simple addition of the two Scalars.
  const addressSecretCandidate = ivsk.add(new Fq(preaddress.toBigInt()));
  // We then multiply this secretCandidate by the generator G to create an addressPoint candidate.
  const addressPointCandidate = await derivePublicKeyFromSecretKey(addressSecretCandidate);

  // Because all encryption to addresses is done using a point with the positive y-coordinate, if our addressSecret candidate derives a point with a
  // negative y-coordinate, we use the other candidate by negating the secret. This transformation of the secret simply flips the y-coordinate of the derived point while keeping the x-coordinate the same.
  if (!(addressPointCandidate.y.toBigInt() <= (Fr.MODULUS - 1n) / 2n)) {
    return new Fq(Fq.MODULUS - addressSecretCandidate.toBigInt());
  }

  return addressSecretCandidate;
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
export async function deriveKeys(secretKey: Fr) {
  // First we derive master secret keys -  we use sha512 here because this derivation will never take place
  // in a circuit
  const masterNullifierSecretKey = deriveMasterNullifierSecretKey(secretKey);
  const masterIncomingViewingSecretKey = deriveMasterIncomingViewingSecretKey(secretKey);
  const masterOutgoingViewingSecretKey = deriveMasterOutgoingViewingSecretKey(secretKey);
  const masterTaggingSecretKey = sha512ToGrumpkinScalar([secretKey, GeneratorIndex.TSK_M]);

  // Then we derive master public keys
  const masterNullifierPublicKey = await derivePublicKeyFromSecretKey(masterNullifierSecretKey);
  const masterIncomingViewingPublicKey = await derivePublicKeyFromSecretKey(masterIncomingViewingSecretKey);
  const masterOutgoingViewingPublicKey = await derivePublicKeyFromSecretKey(masterOutgoingViewingSecretKey);
  const masterTaggingPublicKey = await derivePublicKeyFromSecretKey(masterTaggingSecretKey);

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

// Returns shared tagging secret computed with Diffie-Hellman key exchange.
async function computeTaggingSecretPoint(knownAddress: CompleteAddress, ivsk: Fq, externalAddress: AztecAddress) {
  const knownPreaddress = await computePreaddress(await knownAddress.publicKeys.hash(), knownAddress.partialAddress);
  // TODO: #8970 - Computation of address point from x coordinate might fail
  const externalAddressPoint = await externalAddress.toAddressPoint();
  const curve = new Grumpkin();
  // Given A (known complete address) -> B (external address) and h == preaddress
  // Compute shared secret as S = (h_A + ivsk_A) * Addr_Point_B

  // Beware! h_a + ivsk_a (also known as the address secret) can lead to an address point with a negative y-coordinate, since there's two possible candidates
  // computeAddressSecret takes care of selecting the one that leads to a positive y-coordinate, which is the only valid address point
  return curve.mul(externalAddressPoint, await computeAddressSecret(knownPreaddress, ivsk));
}

export async function computeAppTaggingSecret(
  knownAddress: CompleteAddress,
  ivsk: Fq,
  externalAddress: AztecAddress,
  app: AztecAddress,
) {
  const taggingSecretPoint = await computeTaggingSecretPoint(knownAddress, ivsk, externalAddress);
  return poseidon2Hash([taggingSecretPoint.x, taggingSecretPoint.y, app]);
}
