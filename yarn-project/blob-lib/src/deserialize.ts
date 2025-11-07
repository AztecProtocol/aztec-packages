import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { checkBlobFieldsEncoding } from './encoding.js';
import { BlobDeserializationError } from './errors.js';

/**
 * Deserializes a buffer into an array of field elements.
 *
 * This function returns the fields that were actually added in a checkpoint. The number of fields is specified by the
 * first field.
 *
 * @param buf - The buffer to deserialize.
 * @param checkEncoding - Whether to check if the encoding is correct. If false, it will still check the checkpoint
 * prefix and throw if there's not enough fields.
 * @returns An array of field elements.
 */
export function deserializeEncodedBlobToFields(buf: Uint8Array, checkEncoding = false): Fr[] {
  const reader = BufferReader.asReader(buf);
  const firstField = reader.readObject(Fr);

  // Use toBigInt instead of toNumber so that we can catch it and throw a more descriptive error below if the first
  // field is larger than a javascript integer.
  const numFields = firstField.toBigInt();
  const totalFieldsInBuffer = BigInt(buf.length / Fr.SIZE_IN_BYTES);
  if (numFields > totalFieldsInBuffer) {
    throw new BlobDeserializationError(`Failed to deserialize blob fields, this blob was likely not created by us`);
  }

  const numFieldsWithoutPrefix = Number(numFields) - 1;
  const blobFields = [firstField].concat(reader.readArray(numFieldsWithoutPrefix, Fr));

  if (checkEncoding && !checkBlobFieldsEncoding(blobFields)) {
    throw new BlobDeserializationError(`Incorrect encoding of blob fields, this blob was likely not created by us`);
  }

  return blobFields;
}
