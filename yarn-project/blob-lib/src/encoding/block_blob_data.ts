import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';

import { BlobDeserializationError } from '../errors.js';
import {
  type BlockEndMarker,
  decodeBlockEndMarker,
  encodeBlockEndMarker,
  isBlockEndMarker,
} from './block_end_marker.js';
import {
  type BlockEndStateField,
  decodeBlockEndStateField,
  encodeBlockEndStateField,
} from './block_end_state_field.js';
import { type TxBlobData, decodeTxBlobData, encodeTxBlobData } from './tx_blob_data.js';

// Must match the implementation in `noir-protocol-circuits/crates/types/src/blob_data/block_blob_data.nr`.

// Every block carries the L1-to-L2 message tree root: once any block can insert its own
// message bundle, the root is per-block, so blob-syncing nodes reconstruct each block's message-tree root from the
// blob alone.
export const NUM_BLOCK_END_BLOB_FIELDS = 7;
export const NUM_CHECKPOINT_END_MARKER_FIELDS = 1;

/** Returns the number of blob fields used for block end data. */
export function getNumBlockEndBlobFields(): number {
  return NUM_BLOCK_END_BLOB_FIELDS;
}

export interface BlockEndBlobData {
  blockEndMarker: BlockEndMarker;
  blockEndStateField: BlockEndStateField;
  lastArchiveRoot: Fr;
  noteHashRoot: Fr;
  nullifierRoot: Fr;
  publicDataRoot: Fr;
  l1ToL2MessageRoot: Fr;
}

export interface BlockBlobData extends BlockEndBlobData {
  txs: TxBlobData[];
}

export function encodeBlockEndBlobData(blockEndBlobData: BlockEndBlobData): Fr[] {
  return [
    encodeBlockEndMarker(blockEndBlobData.blockEndMarker),
    encodeBlockEndStateField(blockEndBlobData.blockEndStateField),
    blockEndBlobData.lastArchiveRoot,
    blockEndBlobData.noteHashRoot,
    blockEndBlobData.nullifierRoot,
    blockEndBlobData.publicDataRoot,
    blockEndBlobData.l1ToL2MessageRoot,
  ];
}

export function decodeBlockEndBlobData(fields: Fr[] | FieldReader): BlockEndBlobData {
  const reader = FieldReader.asReader(fields);

  const numBlockEndData = getNumBlockEndBlobFields();
  if (numBlockEndData > reader.remainingFields()) {
    throw new BlobDeserializationError(
      `Incorrect encoding of blob fields: not enough fields for block end data. Expected ${numBlockEndData} fields, only ${reader.remainingFields()} remaining.`,
    );
  }

  return {
    blockEndMarker: decodeBlockEndMarker(reader.readField()),
    blockEndStateField: decodeBlockEndStateField(reader.readField()),
    lastArchiveRoot: reader.readField(),
    noteHashRoot: reader.readField(),
    nullifierRoot: reader.readField(),
    publicDataRoot: reader.readField(),
    l1ToL2MessageRoot: reader.readField(),
  };
}

export function encodeBlockBlobData(blockBlobData: BlockBlobData): Fr[] {
  return [...blockBlobData.txs.map(tx => encodeTxBlobData(tx)).flat(), ...encodeBlockEndBlobData(blockBlobData)];
}

export function decodeBlockBlobData(fields: Fr[] | FieldReader): BlockBlobData {
  const reader = FieldReader.asReader(fields);

  const txs: TxBlobData[] = [];
  let hasReachedBlockEnd = false;
  while (!hasReachedBlockEnd) {
    if (reader.isFinished()) {
      throw new BlobDeserializationError(`Incorrect encoding of blob fields: not enough fields for block end marker.`);
    }

    const currentField = reader.peekField();
    if (isBlockEndMarker(currentField)) {
      hasReachedBlockEnd = true;
    } else {
      txs.push(decodeTxBlobData(reader));
    }
  }

  const blockEndBlobData = decodeBlockEndBlobData(reader);

  const blockEndMarker = blockEndBlobData.blockEndMarker;
  if (blockEndMarker.numTxs !== txs.length) {
    throw new BlobDeserializationError(
      `Incorrect encoding of blob fields: expected ${blockEndMarker.numTxs} txs, but got ${txs.length}.`,
    );
  }

  return {
    txs,
    ...blockEndBlobData,
  };
}
