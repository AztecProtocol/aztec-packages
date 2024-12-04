import { AztecAddress } from '@aztec/circuits.js';
import { type ContractArtifact, ContractArtifactSchema } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

export type ForeignCallSingle = string;

export type ForeignCallArray = string[];

export type ForeignCallArgs = (ForeignCallSingle | ForeignCallArray | ContractArtifact)[];

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

export function toSingle(obj: Fr | AztecAddress) {
  return obj.toString().slice(2);
}

export function toArray(objs: Fr[]) {
  return objs.map(obj => obj.toString());
}

export function toForeignCallResult(obj: (ForeignCallSingle | ForeignCallArray)[]) {
  return { values: obj };
}

export const ForeignCallSingleSchema = z.string();

export const ForeignCallArraySchema = z.array(z.string());

export const ForeignCallArgsSchema = z.array(
  z.union([ForeignCallSingleSchema, ForeignCallArraySchema, ContractArtifactSchema]),
);

export const ForeignCallResultSchema = z.object({
  values: z.array(z.union([ForeignCallSingleSchema, ForeignCallArraySchema])),
});
