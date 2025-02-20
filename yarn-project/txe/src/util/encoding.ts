import { AztecAddress, type ContractInstanceWithAddress, ContractInstanceWithAddressSchema } from '@aztec/circuits.js';
import { type ContractArtifact, ContractArtifactSchema } from '@aztec/circuits.js/abi';
import { Fr } from '@aztec/foundation/fields';
import { hexToBuffer } from '@aztec/foundation/string';

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
 * @returns
 */
export function fromUintArray(obj: ForeignCallArray, uintBitSize: number): Buffer {
  if (uintBitSize % 8 !== 0) {
    throw new Error(`u${uintBitSize} is not a supported type in Noir`);
  }
  const uintByteSize = uintBitSize / 8;
  return Buffer.concat(obj.map(str => hexToBuffer(str).slice(-uintByteSize)));
}

export function toSingle(obj: Fr | AztecAddress): ForeignCallSingle {
  return obj.toString().slice(2);
}

export function toArray(objs: Fr[]): ForeignCallArray {
  return objs.map(obj => obj.toString());
}

export function bufferToU8Array(buffer: Buffer): ForeignCallArray {
  return toArray(Array.from(buffer).map(byte => new Fr(byte)));
}

/**
 * Converts a ForeignCallArray into a tuple which represents a nr BoundedVec.
 * If the input array is shorter than the maxLen, it pads the result with zeros,
 * so that nr can correctly coerce this result into a BoundedVec.
 * @param array
 * @param maxLen - the max length of the BoundedVec.
 * @returns a tuple representing a BoundedVec.
 */
export function arrayToBoundedVec(array: ForeignCallArray, maxLen: number): [ForeignCallArray, ForeignCallSingle] {
  if (array.length > maxLen) {
    throw new Error(`Array of length ${array.length} larger than maxLen ${maxLen}`);
  }
  const lengthDiff = maxLen - array.length;
  // We pad the array to the maxLen of the BoundedVec.
  const zeroPaddingArray = toArray(Array(lengthDiff).fill(new Fr(0)));

  // These variable names match with the BoundedVec members in nr:
  const storage = array.concat(zeroPaddingArray);
  const len = toSingle(new Fr(array.length));
  return [storage, len];
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
