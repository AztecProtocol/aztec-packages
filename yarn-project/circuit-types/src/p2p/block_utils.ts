import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256, makeEthSignDigest } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';

import { encodeAbiParameters, parseAbiParameters } from 'viem';

import { type TxHash } from '../tx/tx_hash.js';

/**
 * Get the payload for the signature of the block proposal
 * @param archive - The archive of the block
 * @param txs - The transactions in the block
 * @returns The payload for the signature of the block proposal
 */
export function getSignaturePayload(archive: Fr, txs: TxHash[]) {
  const abi = parseAbiParameters('bytes32, bytes32[]');
  const txArray = txs.map(tx => tx.to0xString());
  const encodedData = encodeAbiParameters(abi, [archive.toString(), txArray] as const);

  return Buffer.from(encodedData.slice(2), 'hex');
}

/**
 * Get the hashed payload for the signature of the block proposal
 * @param archive - The archive of the block
 * @param txs - The transactions in the block
 * @returns The hashed payload for the signature of the block proposal
 */
export function getHashedSignaturePayload(archive: Fr, txs: TxHash[]): Buffer32 {
  return Buffer32.fromBuffer(keccak256(getSignaturePayload(archive, txs)));
}

/**
 * Get the hashed payload for the signature of the block proposal as an Ethereum signed message EIP-712
 * @param archive - The archive of the block
 * @param txs - The transactions in the block
 * @returns The hashed payload for the signature of the block proposal as an Ethereum signed message
 */
export function getHashedSignaturePayloadEthSignedMessage(archive: Fr, txs: TxHash[]): Buffer32 {
  const payload = getHashedSignaturePayload(archive, txs);
  return makeEthSignDigest(payload);
}
