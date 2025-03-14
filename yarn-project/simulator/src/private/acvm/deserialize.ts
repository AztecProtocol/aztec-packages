import { Fr } from '@aztec/foundation/fields';
import { hexToBuffer } from '@aztec/foundation/string';

import type { ACVMField, ACVMWitness } from './acvm_types.js';

/**
 * Converts an ACVM field to a Fr.
 * @param field - The ACVM field to convert.
 * @returns The Fr.
 */
export function fromACVMField(field: ACVMField): Fr {
  return Fr.fromBuffer(Buffer.from(field.slice(2), 'hex'));
}

/**
 * Converts a field to a number.
 * @param fr - The field to convert.
 * @returns The number.
 * TODO(#4102): Nuke this once block number is big int.
 */
export function frToNumber(fr: Fr): number {
  return Number(fr.value);
}

/**
 * Converts a field to a boolean.
 * @param fr - The field to convert.
 */
export function frToBoolean(fr: Fr): boolean {
  return fr.toBigInt() === BigInt(1);
}

/**
 * Converts a Noir BoundedVec of Fields into an Fr array. Note that BoundedVecs are structs, and therefore translated as
 * two separate ACVMField values (an array and a single field).
 *
 * @param storage The array with the BoundedVec's storage (i.e. BoundedVec::storage())
 * @param length The length of the BoundedVec (i.e. BoundedVec::len())
 * @returns An array with the same content as the Noir version. Elements past the length are discarded.
 */
export function fromBoundedVec(storage: ACVMField[], length: ACVMField): Fr[] {
  return storage.slice(0, frToNumber(fromACVMField(length))).map(fromACVMField);
}

/**
 * Converts a Noir BoundedVec of unsigned integers into a Buffer. Note that BoundedVecs are structs, and therefore
 * translated as two separate ACVMField values (an array and a single field).
 *
 * @param storage The array with the BoundedVec's storage (i.e. BoundedVec::storage())
 * @param length The length of the BoundedVec (i.e. BoundedVec::len())
 * @param uintBitSize If it's an array of Noir u8's, put `8`, etc.
 * @returns A buffer containing the unsigned integers tightly packed
 */
export function fromUintBoundedVec(storage: ACVMField[], length: ACVMField, uintBitSize: number): Buffer {
  if (uintBitSize % 8 !== 0) {
    throw new Error(`u${uintBitSize} is not a supported type in Noir`);
  }
  const uintByteSize = uintBitSize / 8;
  const boundedStorage = storage.slice(0, frToNumber(fromACVMField(length)));
  return Buffer.concat(boundedStorage.map(str => hexToBuffer(str).subarray(-uintByteSize)));
}

/**
 * Transforms a witness map to its field elements.
 * @param witness - The witness to extract from.
 * @returns The return values.
 */
export function witnessMapToFields(witness: ACVMWitness): Fr[] {
  const sortedKeys = [...witness.keys()].sort((a, b) => a - b);
  return sortedKeys.map(key => witness.get(key)!).map(fromACVMField);
}

/**
 * Converts an array of Noir unsigned integers to a single tightly-packed buffer.
 * @param uintBitSize If it's an array of Noir u8's, put `8`, etc.
 * @returns A buffer where each byte is correctly represented as a single byte in the buffer.
 * Copy of the function in txe/src/util/encoding.ts.
 */
export function fromUintArray(obj: ACVMField[], uintBitSize: number): Buffer {
  if (uintBitSize % 8 !== 0) {
    throw new Error(`u${uintBitSize} is not a supported type in Noir`);
  }
  const uintByteSize = uintBitSize / 8;
  return Buffer.concat(obj.map(str => hexToBuffer(str).slice(-uintByteSize)));
}
