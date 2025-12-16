import { BLOCK_END_PREFIX, TX_START_PREFIX } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

// These are helper constants to decode tx effects from blob encoded fields
export const TX_START_PREFIX_BYTES_LENGTH = TX_START_PREFIX.toString(16).length / 2;
// 7 bytes for: | 0 | txlen[0] | txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revertCode |
export const TX_EFFECT_PREFIX_BYTE_LENGTH = TX_START_PREFIX_BYTES_LENGTH + 7;
export const REVERT_CODE_PREFIX = 1;

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
function isValidFirstField(field: Fr): boolean {
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

export function createBlockEndMarker(numTxs: number) {
  // Should match the implementation in block_rollup_public_inputs_composer.nr > create_block_end_marker
  return new Fr(BLOCK_END_PREFIX * 256n * 256n + BigInt(numTxs));
}

export function isBlockEndMarker(field: Fr) {
  const value = field.toBigInt();
  const numTxs = value & 0xffffn;
  return value - numTxs === BLOCK_END_PREFIX * 256n * 256n;
}

export function getNumTxsFromBlockEndMarker(field: Fr) {
  return Number(field.toBigInt() & 0xffffn);
}
