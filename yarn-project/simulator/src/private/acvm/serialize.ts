import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { ACVMField } from './acvm_types.js';

/**
 * Adapts the buffer to the field size.
 * @param originalBuf - The buffer to adapt.
 * @returns The adapted buffer.
 */
function adaptBufferSize(originalBuf: Buffer) {
  const buffer = Buffer.alloc(Fr.SIZE_IN_BYTES);
  if (originalBuf.length > buffer.length) {
    throw new Error('Buffer does not fit in field');
  }
  originalBuf.copy(buffer, buffer.length - originalBuf.length);
  return buffer;
}

/**
 * Converts a value to an ACVM field.
 * @param value - The value to convert.
 * @returns The ACVM field.
 */
export function toACVMField(
  value: AztecAddress | EthAddress | Fr | Buffer | boolean | number | bigint | ACVMField,
): ACVMField {
  let buffer;
  if (Buffer.isBuffer(value)) {
    buffer = value;
  } else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
    buffer = new Fr(value).toBuffer();
  } else if (typeof value === 'string') {
    buffer = Fr.fromHexString(value).toBuffer();
  } else {
    buffer = value.toBuffer();
  }
  return `0x${adaptBufferSize(buffer).toString('hex')}`;
}

/**
 * Converts a single value or an array of single values into the equivalent ACVM field representation.
 */
export function toACVMFieldSingleOrArray(value: Fr | Fr[]) {
  return Array.isArray(value) ? value.map(toACVMField) : toACVMField(value);
}

/**
 * Inserts a list of ACVM fields to a witness.
 * @param witnessStartIndex - The index where to start inserting the fields.
 * @param fields - The fields to insert.
 * @returns The witness.
 */
export function toACVMWitness(witnessStartIndex: number, fields: Parameters<typeof toACVMField>[0][]) {
  return fields.reduce((witness, field, index) => {
    witness.set(index + witnessStartIndex, toACVMField(field));
    return witness;
  }, new Map<number, ACVMField>());
}

export function bufferToU8Array(buffer: Buffer): ACVMField[] {
  return Array.from(buffer).map(byte => toACVMField(BigInt(byte)));
}

export function bufferToBoundedVec(buffer: Buffer, maxLen: number): [ACVMField[], ACVMField] {
  const u8Array = bufferToU8Array(buffer);
  return arrayToBoundedVec(u8Array, maxLen);
}

/**
 * Converts a ForeignCallArray into a tuple which represents a nr BoundedVec.
 * If the input array is shorter than the maxLen, it pads the result with zeros,
 * so that nr can correctly coerce this result into a BoundedVec.
 * @param bVecStorage - The array underlying the BoundedVec.
 * @param maxLen - the max length of the BoundedVec.
 * @returns a tuple representing a BoundedVec.
 */
export function arrayToBoundedVec(bVecStorage: ACVMField[], maxLen: number): [ACVMField[], ACVMField] {
  if (bVecStorage.length > maxLen) {
    throw new Error(`Array of length ${bVecStorage.length} larger than maxLen ${maxLen}`);
  }
  const lengthDiff = maxLen - bVecStorage.length;
  const zeroPaddingArray = Array(lengthDiff).fill(toACVMField(BigInt(0)));
  const storage = bVecStorage.concat(zeroPaddingArray);
  const len = toACVMField(BigInt(bVecStorage.length));
  return [storage, len];
}

/**
 * Converts an array of arrays representing Noir BoundedVec of nested arrays into its Noir serialized form.
 * @param bVecStorage - The array underlying the BoundedVec.
 * @param maxLen - The max length of the BoundedVec (max num of the nested arrays in the BoundedVec).
 * @param nestedArrayLength - The length of the nested arrays (each nested array has to have the same length).
 * @returns Serialized BoundedVec following Noir intrinsic serialization.
 */
export function arrayOfArraysToBoundedVecOfArrays(
  bVecStorage: ACVMField[][],
  maxLen: number,
  nestedArrayLength: number,
): [ACVMField[], ACVMField] {
  if (bVecStorage.length > maxLen) {
    throw new Error(`Array of length ${bVecStorage.length} larger than maxLen ${maxLen}`);
  }

  // Check that all nested arrays have length nestedArrayLength
  if (!bVecStorage.every(nestedArray => nestedArray.length === nestedArrayLength)) {
    throw new Error(
      `Nested array length passed in from Noir does not correspond to the length obtained in TS: ${nestedArrayLength} !== ${bVecStorage[0].length}`,
    );
  }

  // Flatten the array of arrays
  const flattenedStorage = bVecStorage.flat();

  // Calculate and add padding
  const numFieldsToPad = maxLen * nestedArrayLength - flattenedStorage.length;
  const flattenedStorageWithPadding = flattenedStorage.concat(Array(numFieldsToPad).fill(toACVMField(BigInt(0))));

  // Return flattened array with padding and length
  const len = toACVMField(BigInt(bVecStorage.length));
  return [flattenedStorageWithPadding, len];
}
