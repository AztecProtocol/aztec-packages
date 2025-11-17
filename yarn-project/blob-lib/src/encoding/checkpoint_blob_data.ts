import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader } from '@aztec/foundation/serialize';

import { BlobDeserializationError } from '../errors.js';
import { type BlockBlobData, decodeBlockBlobData, encodeBlockBlobData } from './block_blob_data.js';
import type { TxStartMarker } from './tx_start_marker.js';

export interface CheckpointBlobData {
  totalNumBlobFields: number;
  blocks: BlockBlobData[];
}

export function encodeCheckpointBlobData(checkpointBlobData: CheckpointBlobData): Fr[] {
  return [
    new Fr(checkpointBlobData.totalNumBlobFields),
    ...checkpointBlobData.blocks.map(block => encodeBlockBlobData(block)).flat(),
  ];
}

export function decodeCheckpointBlobData(fields: Fr[] | FieldReader): CheckpointBlobData {
  const reader = FieldReader.asReader(fields);

  if (reader.isFinished()) {
    throw new BlobDeserializationError(`Cannot decode empty blob data.`);
  }

  const firstField = reader.readField();
  // Use toBigInt instead of toNumber so that we can catch it and throw a more descriptive error if the first field is
  // larger than a javascript integer.
  const totalNumBlobFields = firstField.toBigInt();
  if (totalNumBlobFields > BigInt(reader.remainingFields() + 1)) {
    // +1 because we already read the first field.
    throw new BlobDeserializationError(
      `Incorrect encoding of blob fields: not enough fields for checkpoint blob data. Expected ${totalNumBlobFields} fields, got ${reader.remainingFields() + 1}.`,
    );
  }

  const blocks = [];
  while (reader.cursor < totalNumBlobFields) {
    blocks.push(decodeBlockBlobData(reader, blocks.length === 0 /* isFirstBlock */));
  }
  return {
    totalNumBlobFields: Number(totalNumBlobFields),
    blocks,
  };
}

export function decodeCheckpointBlobDataFromBuffer(buf: Buffer): CheckpointBlobData {
  const reader = BufferReader.asReader(buf);
  const firstField = reader.readObject(Fr);

  // Use toBigInt instead of toNumber so that we can catch it and throw a more descriptive error if the first field is
  // larger than a javascript integer.
  const numFields = firstField.toBigInt();
  const totalFieldsInBuffer = BigInt(buf.length / Fr.SIZE_IN_BYTES);
  if (numFields > totalFieldsInBuffer) {
    throw new BlobDeserializationError(
      `Failed to deserialize blob buffer: not enough fields for checkpoint blob data. Expected ${numFields} fields, got ${totalFieldsInBuffer}.`,
    );
  }

  const numFieldsWithoutPrefix = Number(numFields) - 1;
  const blobFields = [firstField].concat(reader.readArray(numFieldsWithoutPrefix, Fr));

  return decodeCheckpointBlobData(blobFields);
}

export function getTotalNumBlobFieldsFromTxs(txs: TxStartMarker[][]): number {
  return (
    1 + // totalNumBlobFields
    (txs.length ? 1 : 0) + // l1ToL2Messages root in the first block
    txs.length * 6 + // 6 fields for each block end blob data.
    txs.reduce((total, txs) => total + txs.reduce((total, tx) => total + tx.numBlobFields, 0), 0)
  );
}
