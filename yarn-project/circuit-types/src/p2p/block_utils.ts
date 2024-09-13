import { keccak256 as keccak256Buffer } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';
import { Buffer32 } from '@aztec/foundation/buffer';

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
  return Buffer32.fromBuffer(keccak256Buffer(getSignaturePayload(archive, txs)));
}
