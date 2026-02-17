import { CHECKPOINT_END_PREFIX } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BlobDeserializationError } from '../errors.js';

// Must match the implementation in `noir-protocol-circuits/crates/types/src/blob_data/checkpoint_blob_data.nr`.

const NUM_BLOB_FIELDS_BIT_SIZE = 32n;

export interface CheckpointEndMarker {
  numBlobFields: number;
}

export function encodeCheckpointEndMarker(checkpointEndMarker: CheckpointEndMarker) {
  let value = BigInt(CHECKPOINT_END_PREFIX);
  value <<= NUM_BLOB_FIELDS_BIT_SIZE;
  value += BigInt(checkpointEndMarker.numBlobFields);
  return new Fr(value);
}

export function decodeCheckpointEndMarker(field: Fr): CheckpointEndMarker {
  let value = field.toBigInt();
  const numBlobFields = Number(value & (2n ** NUM_BLOB_FIELDS_BIT_SIZE - 1n));
  value >>= NUM_BLOB_FIELDS_BIT_SIZE;

  const prefix = value;
  if (prefix !== BigInt(CHECKPOINT_END_PREFIX)) {
    throw new BlobDeserializationError(`Incorrect encoding of blob fields: invalid checkpoint end marker.`);
  }

  return {
    numBlobFields,
  };
}

// Check if a field is a checkpoint end marker. Used to check if it has reached the end of the blob fields.
export function isCheckpointEndMarker(field: Fr): boolean {
  const prefix = field.toBigInt() >> NUM_BLOB_FIELDS_BIT_SIZE;
  return prefix === BigInt(CHECKPOINT_END_PREFIX);
}
