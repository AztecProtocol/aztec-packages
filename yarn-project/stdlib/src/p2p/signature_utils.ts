import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256, makeEthSignDigest } from '@aztec/foundation/crypto';

export enum SignatureDomainSeparator {
  blockProposal = 0,
  blockAttestation = 1,
}

export interface Signable {
  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer;
}

/**
 * Get the hashed payload for the signature of the `Signable`
 * @param s - The `Signable` to sign
 * @returns The hashed payload for the signature of the `Signable`
 */
export function getHashedSignaturePayload(s: Signable, domainSeparator: SignatureDomainSeparator): Buffer32 {
  return Buffer32.fromBuffer(keccak256(s.getPayloadToSign(domainSeparator)));
}

/**
 * Get the hashed payload for the signature of the `Signable` as an Ethereum signed message EIP-712
 * @param s - the `Signable` to sign
 * @returns The hashed payload for the signature of the `Signable` as an Ethereum signed message
 */
export function getHashedSignaturePayloadEthSignedMessage(
  s: Signable,
  domainSeparator: SignatureDomainSeparator,
): Buffer32 {
  const payload = getHashedSignaturePayload(s, domainSeparator);
  return makeEthSignDigest(payload);
}
