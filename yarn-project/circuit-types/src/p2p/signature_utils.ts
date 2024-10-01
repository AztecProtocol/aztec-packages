import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256, makeEthSignDigest } from '@aztec/foundation/crypto';

export interface Signable {
  getPayloadToSign(): Buffer;
}

/**
 * Get the hashed payload for the signature of the `Signable`
 * @param s - The `Signable` to sign
 * @returns The hashed payload for the signature of the `Signable`
 */
export function getHashedSignaturePayload(s: Signable): Buffer32 {
  return Buffer32.fromBuffer(keccak256(s.getPayloadToSign()));
}

/**
 * Get the hashed payload for the signature of the `Signable` as an Ethereum signed message EIP-712
 * @param s - the `Signable` to sign
 * @returns The hashed payload for the signature of the `Signable` as an Ethereum signed message
 */
export function getHashedSignaturePayloadEthSignedMessage(s: Signable): Buffer32 {
  const payload = getHashedSignaturePayload(s);
  return makeEthSignDigest(payload);
}
