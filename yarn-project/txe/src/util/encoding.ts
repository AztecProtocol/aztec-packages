import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { hexToBuffer } from '@aztec/foundation/string';
import { type ContractArtifact, ContractArtifactSchema } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractInstanceWithAddress, ContractInstanceWithAddressSchema } from '@aztec/stdlib/contract';

import { z } from 'zod';

export type ForeignCallSingle = string;

export type ForeignCallArray = string[];

export type ForeignCallArgs = (ForeignCallSingle | ForeignCallArray | ContractArtifact | ContractInstanceWithAddress)[];

export type ForeignCallResult = {
  values: (ForeignCallSingle | ForeignCallArray)[];
};

export function fromSingle(obj: ForeignCallSingle) {
  return Fr.fromBuffer(Buffer.from(obj, 'hex'));
}

export function addressFromSingle(obj: ForeignCallSingle) {
  return new AztecAddress(fromSingle(obj));
}

export function fromArray(obj: ForeignCallArray) {
  return obj.map(str => Fr.fromBuffer(hexToBuffer(str)));
}

/**
 * Converts an array of Noir unsigned integers to a single tightly-packed buffer.
 * @param uintBitSize If it's an array of Noir u8's, put `8`, etc.
 * @returns A buffer where each byte is correctly represented as a single byte in the buffer.
 */
export function fromUintArray(obj: ForeignCallArray, uintBitSize: number): Buffer {
  if (uintBitSize % 8 !== 0) {
    throw new Error(`u${uintBitSize} is not a supported type in Noir`);
  }
  const uintByteSize = uintBitSize / 8;
  return Buffer.concat(obj.map(str => hexToBuffer(str).slice(-uintByteSize)));
}

/**
 * Converts a Noir BoundedVec of unsigned integers into a Buffer. Note that BoundedVecs are structs, and therefore
 * translated as two separate ForeignCallArray and ForeignCallSingle values (an array and a single field).
 *
 * @param storage The array with the BoundedVec's storage (i.e. BoundedVec::storage())
 * @param length The length of the BoundedVec (i.e. BoundedVec::len())
 * @param uintBitSize If it's an array of Noir u8's, put `8`, etc.
 * @returns A buffer containing the unsigned integers tightly packed
 */
export function fromUintBoundedVec(storage: ForeignCallArray, length: ForeignCallSingle, uintBitSize: number): Buffer {
  if (uintBitSize % 8 !== 0) {
    throw new Error(`u${uintBitSize} is not a supported type in Noir`);
  }
  const uintByteSize = uintBitSize / 8;
  const boundedStorage = storage.slice(0, fromSingle(length).toNumber());
  return Buffer.concat(boundedStorage.map(str => hexToBuffer(str).slice(-uintByteSize)));
}

// Just like toACVMField in yarn-project/simulator/src/private/acvm/serialize.ts but returns a ForeignCallSingle
// instead of an ACVMField.
export function toSingle(
  value: AztecAddress | EthAddress | Fr | Buffer | boolean | number | bigint,
): ForeignCallSingle {
  let valueAsField;
  if (Buffer.isBuffer(value)) {
    valueAsField = Fr.fromBuffer(value);
  } else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
    valueAsField = new Fr(value);
  } else if (typeof value === 'string') {
    valueAsField = Fr.fromHexString(value);
  } else {
    valueAsField = value;
  }
  return valueAsField.toString().slice(2);
}

export function toArray(objs: Fr[]): ForeignCallArray {
  return objs.map(obj => obj.toString());
}

export function toSingleOrArray(value: Fr | Fr[]) {
  return Array.isArray(value) ? value.map(toSingle) : toSingle(value);
}

export function bufferToU8Array(buffer: Buffer): ForeignCallArray {
  return toArray(Array.from(buffer).map(byte => new Fr(byte)));
}

/**
 * Converts a ForeignCallArray into a tuple which represents a nr BoundedVec.
 * If the input array is shorter than the maxLen, it pads the result with zeros,
 * so that nr can correctly coerce this result into a BoundedVec.
 * @param bVecStorage - The array underlying the BoundedVec.
 * @param maxLen - the max length of the BoundedVec.
 * @returns a tuple representing a BoundedVec.
 */
export function arrayToBoundedVec(
  bVecStorage: ForeignCallArray,
  maxLen: number,
): [ForeignCallArray, ForeignCallSingle] {
  if (bVecStorage.length > maxLen) {
    throw new Error(`Array of length ${bVecStorage.length} larger than maxLen ${maxLen}`);
  }
  const lengthDiff = maxLen - bVecStorage.length;
  // We pad the array to the maxLen of the BoundedVec.
  const zeroPaddingArray = toArray(Array(lengthDiff).fill(new Fr(0)));

  // These variable names match with the BoundedVec members in nr:
  const storage = bVecStorage.concat(zeroPaddingArray);
  const len = toSingle(new Fr(bVecStorage.length));
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
  bVecStorage: ForeignCallArray[],
  maxLen: number,
  nestedArrayLength: number,
): [ForeignCallArray, ForeignCallSingle] {
  if (bVecStorage.length > maxLen) {
    throw new Error(`Array of length ${bVecStorage.length} larger than maxLen ${maxLen}`);
  }

  // Check that all nested arrays have length nestedArrayLength
  if (!bVecStorage.every(nestedArray => nestedArray.length === nestedArrayLength)) {
    throw new Error(
      `Nested array length passed in from Noir does not correspond to the length obtained in TS: ${nestedArrayLength} !== ${bVecStorage[0].length}`,
    );
  }

  const flattenedStorage = bVecStorage.flat();

  const numFieldsToPad = maxLen * nestedArrayLength - flattenedStorage.length;

  const flattenedStorageWithPadding = flattenedStorage.concat(Array(numFieldsToPad).fill(new Fr(0)));

  // At last we get the actual length of the BoundedVec and return the values.
  const len = toSingle(new Fr(bVecStorage.length));
  return [flattenedStorageWithPadding, len];
}

export function toForeignCallResult(obj: (ForeignCallSingle | ForeignCallArray)[]) {
  return { values: obj };
}

export const ForeignCallSingleSchema = z.string();

export const ForeignCallArraySchema = z.array(z.string());

export const ForeignCallArgsSchema = z.array(
  z.union([ForeignCallSingleSchema, ForeignCallArraySchema, ContractArtifactSchema, ContractInstanceWithAddressSchema]),
);

export const ForeignCallResultSchema = z.object({
  values: z.array(z.union([ForeignCallSingleSchema, ForeignCallArraySchema])),
});
