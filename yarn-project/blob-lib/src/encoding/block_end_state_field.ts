import {
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BlobDeserializationError } from '../errors.js';

// Must match the implementation in `noir-protocol-circuits/crates/types/src/blob_data/block_blob_data.nr`.

export const TOTAL_MANA_USED_BIT_SIZE = 48n;

export interface BlockEndStateField {
  l1ToL2MessageNextAvailableLeafIndex: number;
  noteHashNextAvailableLeafIndex: number;
  nullifierNextAvailableLeafIndex: number;
  publicDataNextAvailableLeafIndex: number;
  totalManaUsed: bigint;
}

export function encodeBlockEndStateField(blockEndStateField: BlockEndStateField) {
  let value = BigInt(blockEndStateField.l1ToL2MessageNextAvailableLeafIndex);
  value <<= BigInt(NOTE_HASH_TREE_HEIGHT);
  value += BigInt(blockEndStateField.noteHashNextAvailableLeafIndex);
  value <<= BigInt(NULLIFIER_TREE_HEIGHT);
  value += BigInt(blockEndStateField.nullifierNextAvailableLeafIndex);
  value <<= BigInt(PUBLIC_DATA_TREE_HEIGHT);
  value += BigInt(blockEndStateField.publicDataNextAvailableLeafIndex);
  value <<= BigInt(TOTAL_MANA_USED_BIT_SIZE);
  value += BigInt(blockEndStateField.totalManaUsed);
  return new Fr(value);
}

export function decodeBlockEndStateField(field: Fr): BlockEndStateField {
  let value = field.toBigInt();
  const totalManaUsed = value & (2n ** TOTAL_MANA_USED_BIT_SIZE - 1n);
  value >>= TOTAL_MANA_USED_BIT_SIZE;
  const publicDataNextAvailableLeafIndex = Number(value & (2n ** BigInt(PUBLIC_DATA_TREE_HEIGHT) - 1n));
  value >>= BigInt(PUBLIC_DATA_TREE_HEIGHT);
  const nullifierNextAvailableLeafIndex = Number(value & (2n ** BigInt(NULLIFIER_TREE_HEIGHT) - 1n));
  value >>= BigInt(NULLIFIER_TREE_HEIGHT);
  const noteHashNextAvailableLeafIndex = Number(value & (2n ** BigInt(NOTE_HASH_TREE_HEIGHT) - 1n));
  value >>= BigInt(NOTE_HASH_TREE_HEIGHT);

  if (value > 2n ** BigInt(L1_TO_L2_MSG_TREE_HEIGHT) - 1n) {
    throw new BlobDeserializationError(`Incorrect encoding of blob fields: invalid block end state field.`);
  }
  const l1ToL2MessageNextAvailableLeafIndex = Number(value);

  return {
    l1ToL2MessageNextAvailableLeafIndex,
    noteHashNextAvailableLeafIndex,
    nullifierNextAvailableLeafIndex,
    publicDataNextAvailableLeafIndex,
    totalManaUsed,
  };
}
