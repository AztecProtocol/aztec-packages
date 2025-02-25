import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader } from '@aztec/foundation/serialize';

import type { Blob as BlobBuffer } from 'c-kzg';

// Note duplicated from circuit-types !
// This will appear as 0x74785f7374617274 in logs
export const TX_START_PREFIX = 8392562855083340404n;
// These are helper constants to decode tx effects from blob encoded fields
export const TX_START_PREFIX_BYTES_LENGTH = TX_START_PREFIX.toString(16).length / 2;
// 7 bytes for: | 0 | txlen[0] | txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revertCode |
export const TX_EFFECT_PREFIX_BYTE_LENGTH = TX_START_PREFIX_BYTES_LENGTH + 7;
export const REVERT_CODE_PREFIX = 1;

/**
 * Deserializes a blob buffer into an array of field elements.
 *
 * Blobs are converted into BN254 fields to perform a poseidon2 hash on them (fieldHash).
 * This method is sparse, meaning it does not include trailing zeros at the end of the blob.
 *
 * However, we cannot simply trim the zero's from the end of the blob, as some logs may include zero's
 * within them.
 * If we end on a set of zeros, such as the log below:
 * length 7: [ a, b, c, d, e, 0, 0]
 *
 * we will end up with the incorrect hash if we trim the zeros from the end.
 *
 * Each transactions logs contains a TX start prefix, which includes a string followed
 * by the length ( in field elements ) of the transaction's log.
 *
 * This function finds the end of the last transaction's logs, and returns the array up to this point.
 *
 * We search for a series of Tx Prefixes progressing the cursor in the field reader until we hit
 * a field that is not a Tx Prefix, this indicates that we have reached the end of the last transaction's logs.
 *
 * +------------------+------------------+------------------+------------------+
 * | TX1 Start Prefix | TX1 Log Fields   | TX2 Start Prefix | Padded zeros     |
 * | [3 a,b,c]        | [3, a, b, c]     | [5 d,e,f,0,0]    | [0, 0, 0, .., 0] |
 * +------------------+------------------+------------------+------------------+
 *                                                          ^
 *                                                          |
 * Function reads until here --------------------------------
 *
 * @param blob - The blob buffer to deserialize.
 * @returns An array of field elements.
 */
export function deserializeEncodedBlobToFields(blob: BlobBuffer): Fr[] {
  // Convert blob buffer to array of field elements
  const reader = BufferReader.asReader(blob);
  const array = reader.readArray(blob.length >> 5, Fr); // >> 5 = / 32 (bytes per field)
  const fieldReader = FieldReader.asReader(array);

  // Read fields until we hit zeros at the end
  while (!fieldReader.isFinished()) {
    const currentField = fieldReader.peekField();

    // Stop when we hit a zero field
    if (!currentField || currentField.isZero()) {
      break;
    }

    // Skip the remaining fields in this transaction
    const len = getLengthFromFirstField(currentField);
    fieldReader.skip(len);
  }

  // Return array up to last non-zero field
  return array.slice(0, fieldReader.cursor);
}

/**
 * Get the length of the transaction from the first field.
 *
 * @param firstField - The first field of the transaction.
 * @returns The length of the transaction.
 *
 * @throws If the first field does not include the correct prefix - encoding invalid.
 */
export function getLengthFromFirstField(firstField: Fr): number {
  // Check that the first field includes the correct prefix
  if (!isValidFirstField(firstField)) {
    throw new Error('Invalid prefix');
  }
  const buf = firstField.toBuffer().subarray(-TX_EFFECT_PREFIX_BYTE_LENGTH);
  return new Fr(buf.subarray(TX_START_PREFIX_BYTES_LENGTH + 1, TX_START_PREFIX_BYTES_LENGTH + 3)).toNumber();
}

/**
 * Determines whether a field is the first field of a tx effect
 */
export function isValidFirstField(field: Fr): boolean {
  const buf = field.toBuffer();
  if (
    !buf
      .subarray(0, field.size - TX_EFFECT_PREFIX_BYTE_LENGTH)
      .equals(Buffer.alloc(field.size - TX_EFFECT_PREFIX_BYTE_LENGTH))
  ) {
    return false;
  }
  const sliced = buf.subarray(-TX_EFFECT_PREFIX_BYTE_LENGTH);
  if (
    // Checking we start with the correct prefix...
    !new Fr(sliced.subarray(0, TX_START_PREFIX_BYTES_LENGTH)).equals(new Fr(TX_START_PREFIX)) ||
    // ...and include the revert code prefix..
    sliced[sliced.length - 3] !== REVERT_CODE_PREFIX ||
    // ...and the following revert code is valid.
    sliced[sliced.length - 1] > 4
  ) {
    return false;
  }
  return true;
}

/**
 * Extract the fields from a blob buffer, but do not take into account encoding
 * that will include trailing zeros.
 *
 * +------------------+------------------+------------------+------------------+
 * |                  |                  |                  | Padded zeros     |
 * | [3 a,b,c]        | [3, a, b, c]     | [5 d,e,f,0,0]    | [0, 0, 0, .., 0] |
 * +------------------+------------------+------------------+------------------+
 *                                                ^
 *                                                |
 * Function reads until here ----------------------
 */
export function extractBlobFieldsFromBuffer(blob: BlobBuffer): Fr[] {
  const reader = BufferReader.asReader(blob);
  const array = reader.readArray(blob.length >> 5, Fr);

  // Find the index of the last non-zero field
  let lastNonZeroIndex = array.length - 1;
  while (lastNonZeroIndex >= 0 && array[lastNonZeroIndex].isZero()) {
    lastNonZeroIndex--;
  }

  // Return the trimmed array
  return array.slice(0, lastNonZeroIndex + 1);
}
