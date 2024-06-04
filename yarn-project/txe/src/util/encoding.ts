import { Fr } from '@aztec/foundation/fields';

export type ForeignCallSingle = {
  Single: string;
};

export type ForeignCallArray = {
  Array: string[];
};

export function fromSingle(obj: ForeignCallSingle) {
  return Fr.fromBuffer(Buffer.from(obj.Single, 'hex'));
}

export function fromArray(obj: ForeignCallArray) {
  return obj.Array.map(str => Fr.fromBuffer(Buffer.from(str, 'hex')));
}

export function toSingle(obj: Fr) {
  return { Single: obj.toString().slice(2) };
}

export function toArray(objs: Fr[]) {
  return { Array: objs.map(obj => obj.toString()) };
}

export function toForeignCallResult(obj: (ForeignCallSingle | ForeignCallArray)[]) {
  return { values: obj };
}
