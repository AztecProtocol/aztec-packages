import { Fr } from '@aztec/foundation/fields';
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

export interface BlockEndBlobData {
  blockEndMarker: BlockEndMarker;
  blockEndStateField: BlockEndStateField;
  lastArchiveRoot: Fr;
  noteHashRoot: Fr;
  nullifierRoot: Fr;
  publicDataRoot: Fr;
  l1ToL2MessageRoot: Fr | undefined;
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
    ...(blockEndBlobData.l1ToL2MessageRoot ? [blockEndBlobData.l1ToL2MessageRoot] : []),
  ];
}

export function decodeBlockEndBlobData(fields: Fr[] | FieldReader, isFirstBlock: boolean): BlockEndBlobData {
  const reader = FieldReader.asReader(fields);

  const numBlockEndData = isFirstBlock ? 7 : 6;
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
    l1ToL2MessageRoot: isFirstBlock ? reader.readField() : undefined,
  };
}

export function encodeBlockBlobData(blockBlobData: BlockBlobData): Fr[] {
  return [...blockBlobData.txs.map(tx => encodeTxBlobData(tx)).flat(), ...encodeBlockEndBlobData(blockBlobData)];
}

export function decodeBlockBlobData(fields: Fr[] | FieldReader, isFirstBlock: boolean): BlockBlobData {
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

  const blockEndBlobData = decodeBlockEndBlobData(reader, isFirstBlock);

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
