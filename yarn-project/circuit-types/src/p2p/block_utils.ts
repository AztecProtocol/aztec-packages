import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 as keccak256Buffer } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/foundation/serialize';

import { keccak256 as keccak2560xString } from 'viem';

import { type TxHash } from '../tx/tx_hash.js';

/**
 * Get the payload for the signature of the block proposal
 * @param archive - The archive of the block
 * @param txs - The transactions in the block
 * @returns The payload for the signature of the block proposal
 */
export function getSignaturePayload(archive: Fr, txs: TxHash[]) {
  return serializeToBuffer([archive, Buffer32.fromNumber(txs.length), txs]);
}

/**
 * Get the hashed payload for the signature of the block proposal
 * @param archive - The archive of the block
 * @param txs - The transactions in the block
 * @returns The hashed payload for the signature of the block proposal
 */
export function getHashedSignaturePayload(archive: Fr, txs: TxHash[]): Buffer {
  return keccak256Buffer(getSignaturePayload(archive, txs));
}

export function get0xStringHashedSignaturePayload(archive: Fr, txs: TxHash[]): `0x${string}` {
  return keccak2560xString(getSignaturePayload(archive, txs));
}
