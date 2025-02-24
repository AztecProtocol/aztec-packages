import { AztecAddress, type ContractInstanceWithAddress, ContractInstanceWithAddressSchema } from '@aztec/circuits.js';
import { type ContractArtifact, ContractArtifactSchema } from '@aztec/circuits.js/abi';
import { Fr, Point } from '@aztec/foundation/fields';
import { hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

export type ForeignCallSingle = string;

export type ForeignCallArray = string[];

export type ForeignCallArgs = (ForeignCallSingle | ForeignCallArray | ContractArtifact | ContractInstanceWithAddress)[];

export type ForeignCallResult = {
  values: (ForeignCallSingle | ForeignCallArray)[];
};

// TODO: the names of the functions in this file should convey the
// types of _both_ the params and return values, because they're inconsistent.
// It's a bit of a hodgepodge at the mo.

export function fromSingle(obj: ForeignCallSingle): Fr {
  return Fr.fromBuffer(Buffer.from(obj, 'hex'));
}

export function addressFromSingle(obj: ForeignCallSingle): AztecAddress {
  return new AztecAddress(fromSingle(obj));
}

export function fromArray(obj: ForeignCallArray): Fr[] {
  // TODO: why is inner conversion of this map different from fromSingle?
  return obj.map(str => Fr.fromBuffer(hexToBuffer(str)));
}

// This function assumes the point is not 0.
export function pointFromArray(arr: ForeignCallArray): Point {
  const arrFr = fromArray(arr);
  if (arrFr.length !== 2) {
    throw new Error(`Expected an array of length 2, for conversion into a Point; got ${arrFr.length}`);
  }
  return new Point(arrFr[0], arrFr[1], /* isInfinite: */ false);
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

// Technically the return type is more-specifically `0x${string}`[]
export function toArray(objs: Fr[]): ForeignCallArray {
  return objs.map(obj => obj.toString());
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
