import { BLOCK_END_PREFIX } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BlobDeserializationError } from '../errors.js';

// Must match the implementation in `noir-protocol-circuits/crates/types/src/blob_data/block_blob_data.nr`.

const BLOCK_NUMBER_BIT_SIZE = 32n;
const TIMESTAMP_BIT_SIZE = 64n;
const NUM_TXS_BIT_SIZE = 16n;

export interface BlockEndMarker {
  timestamp: bigint;
  blockNumber: BlockNumber;
  numTxs: number;
}

export function encodeBlockEndMarker(blockEndMarker: BlockEndMarker) {
  let value = BigInt(BLOCK_END_PREFIX);
  value <<= TIMESTAMP_BIT_SIZE;
  value += blockEndMarker.timestamp;
  value <<= BLOCK_NUMBER_BIT_SIZE;
  value += BigInt(blockEndMarker.blockNumber);
  value <<= NUM_TXS_BIT_SIZE;
  value += BigInt(blockEndMarker.numTxs);
  return new Fr(value);
}

export function decodeBlockEndMarker(field: Fr): BlockEndMarker {
  let value = field.toBigInt();
  const numTxs = Number(value & (2n ** NUM_TXS_BIT_SIZE - 1n));
  value >>= NUM_TXS_BIT_SIZE;
  const blockNumber = BlockNumber(Number(value & (2n ** BLOCK_NUMBER_BIT_SIZE - 1n)));
  value >>= BLOCK_NUMBER_BIT_SIZE;
  const timestamp = value & (2n ** TIMESTAMP_BIT_SIZE - 1n);
  value >>= TIMESTAMP_BIT_SIZE;

  const prefix = value;
  if (prefix !== BigInt(BLOCK_END_PREFIX)) {
    throw new BlobDeserializationError(`Incorrect encoding of blob fields: invalid block end marker.`);
  }

  return {
    blockNumber,
    timestamp,
    numTxs,
  };
}

// Check if a field is a block end marker. Used before decoding to check if it has reached the end of the block.
export function isBlockEndMarker(field: Fr): boolean {
  const prefix = field.toBigInt() >> (NUM_TXS_BIT_SIZE + BLOCK_NUMBER_BIT_SIZE + TIMESTAMP_BIT_SIZE);
  return prefix === BigInt(BLOCK_END_PREFIX);
}
