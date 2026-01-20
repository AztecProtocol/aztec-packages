import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader } from '@aztec/foundation/serialize';

import { BlobDeserializationError } from '../errors.js';
import {
  type BlockBlobData,
  NUM_BLOCK_END_BLOB_FIELDS,
  NUM_CHECKPOINT_END_MARKER_FIELDS,
  NUM_FIRST_BLOCK_END_BLOB_FIELDS,
  decodeBlockBlobData,
  encodeBlockBlobData,
} from './block_blob_data.js';
import {
  type CheckpointEndMarker,
  decodeCheckpointEndMarker,
  encodeCheckpointEndMarker,
  isCheckpointEndMarker,
} from './checkpoint_end_marker.js';
import type { TxStartMarker } from './tx_start_marker.js';

export interface CheckpointBlobData {
  checkpointEndMarker: CheckpointEndMarker;
  blocks: BlockBlobData[];
}

export function encodeCheckpointBlobData(checkpointBlobData: CheckpointBlobData): Fr[] {
  return [
    ...checkpointBlobData.blocks.map(block => encodeBlockBlobData(block)).flat(),
    encodeCheckpointEndMarker(checkpointBlobData.checkpointEndMarker),
  ];
}

export function encodeCheckpointBlobDataFromBlocks(blocks: BlockBlobData[]): Fr[] {
  const blocksBlobFields = blocks.map(block => encodeBlockBlobData(block)).flat();
  const numBlobFields = blocksBlobFields.length + NUM_CHECKPOINT_END_MARKER_FIELDS;
  return blocksBlobFields.concat(encodeCheckpointEndMarker({ numBlobFields }));
}

export function decodeCheckpointBlobData(fields: Fr[] | FieldReader): CheckpointBlobData {
  const reader = FieldReader.asReader(fields);

  if (reader.isFinished()) {
    throw new BlobDeserializationError(`Cannot decode empty blob data.`);
  }

  const blocks = [];
  let checkpointEndMarker: CheckpointEndMarker | undefined;
  while (!reader.isFinished() && !checkpointEndMarker) {
    blocks.push(decodeBlockBlobData(reader, blocks.length === 0 /* isFirstBlock */));

    // After reading a block, the next item must be either a checkpoint end marker or another block.
    // The first field of a block is always a tx start marker. So if the provided fields are valid, it's not possible to
    // misinterpret a tx start marker as checkpoint end marker, or vice versa.
    const nextField = reader.peekField();
    if (isCheckpointEndMarker(nextField)) {
      checkpointEndMarker = decodeCheckpointEndMarker(reader.readField());
      const numFieldsRead = reader.cursor;
      if (numFieldsRead !== checkpointEndMarker.numBlobFields) {
        throw new BlobDeserializationError(
          `Incorrect encoding of blob fields: mismatch number of blob fields. Expected ${checkpointEndMarker.numBlobFields} fields, got ${numFieldsRead}.`,
        );
      }
    }
  }

  if (!checkpointEndMarker) {
    throw new BlobDeserializationError(`Incorrect encoding of blob fields: checkpoint end marker does not exist.`);
  }

  const remainingFields = reader.readFieldArray(reader.remainingFields());
  if (!remainingFields.every(f => f.isZero())) {
    throw new BlobDeserializationError(
      `Incorrect encoding of blob fields: unexpected non-zero field after checkpoint end marker.`,
    );
  }

  return {
    checkpointEndMarker,
    blocks,
  };
}

export function decodeCheckpointBlobDataFromBuffer(buf: Buffer): CheckpointBlobData {
  const reader = BufferReader.asReader(buf);
  const totalFieldsInBuffer = Math.floor(buf.length / Fr.SIZE_IN_BYTES);
  const blobFields = reader.readArray(totalFieldsInBuffer, Fr);
  return decodeCheckpointBlobData(blobFields);
}

export function getTotalNumBlobFieldsFromTxs(txsPerBlock: TxStartMarker[][]): number {
  const numBlocks = txsPerBlock.length;
  if (!numBlocks) {
    return 0;
  }

  return (
    (numBlocks ? NUM_FIRST_BLOCK_END_BLOB_FIELDS - NUM_BLOCK_END_BLOB_FIELDS : 0) + // l1ToL2Messages root in the first block
    numBlocks * NUM_BLOCK_END_BLOB_FIELDS + // 6 fields for each block end blob data.
    txsPerBlock.reduce((total, txs) => total + txs.reduce((total, tx) => total + tx.numBlobFields, 0), 0) +
    NUM_CHECKPOINT_END_MARKER_FIELDS // checkpoint end marker
  );
}
