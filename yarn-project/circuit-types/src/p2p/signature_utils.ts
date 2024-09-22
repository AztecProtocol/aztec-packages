import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256, makeEthSignDigest } from '@aztec/foundation/crypto';

export interface Signable {
  getPayloadToSign(): Buffer;
}

/**
 * Get the hashed payload for the signature of the block proposal
 * @param archive - The archive of the block
 * @param txs - The transactions in the block
 * @returns The hashed payload for the signature of the block proposal
 */
export function getHashedSignaturePayload(s: Signable): Buffer32 {
  return Buffer32.fromBuffer(keccak256(s.getPayloadToSign()));
}

/**
 * Get the hashed payload for the signature of the block proposal as an Ethereum signed message EIP-712
 * @param archive - The archive of the block
 * @param txs - The transactions in the block
 * @returns The hashed payload for the signature of the block proposal as an Ethereum signed message
 */
export function getHashedSignaturePayloadEthSignedMessage(s: Signable): Buffer32 {
  const payload = getHashedSignaturePayload(s);
  return makeEthSignDigest(payload);
}
