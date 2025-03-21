import { Fr } from '@aztec/foundation/fields';
import { hexToBuffer } from '@aztec/foundation/string';

import type { ACVMField, ACVMWitness } from './acvm_types.js';

/**
 * Converts a Noir BoundedVec of Fields into an Fr array. Note that BoundedVecs are structs, and therefore translated as
 * two separate ACVMField values (an array and a single field).
 *
 * @param storage The array with the BoundedVec's storage (i.e. BoundedVec::storage())
 * @param length The length of the BoundedVec (i.e. BoundedVec::len())
 * @returns An array with the same content as the Noir version. Elements past the length are discarded.
 */
export function fromBoundedVec(storage: ACVMField[], length: ACVMField): Fr[] {
  return storage.slice(0, Fr.fromString(length).toNumber()).map(Fr.fromString);
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
  const boundedStorage = storage.slice(0, Fr.fromString(length).toNumber());
  return Buffer.concat(boundedStorage.map(str => hexToBuffer(str).subarray(-uintByteSize)));
}

/**
 * Transforms a witness map to its field elements.
 * @param witness - The witness to extract from.
 * @returns The return values.
 */
export function witnessMapToFields(witness: ACVMWitness): Fr[] {
  const sortedKeys = [...witness.keys()].sort((a, b) => a - b);
  return sortedKeys.map(key => witness.get(key)!).map(Fr.fromString);
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
