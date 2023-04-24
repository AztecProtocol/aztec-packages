import { AztecAddress, Fr } from '../../../foundation/src/index.js';
import { FieldBuf } from './circuits.gen.js';

export function msgpackToField(object: FieldBuf) {
  return Fr.fromBuffer(object);
}

export function msgpackToAddress(object: FieldBuf) {
  return AztecAddress.fromBuffer(object);
}

export function fromMsgpack<T, K>(type: T, object: K): T;
export function fromMsgpack<T extends { fromMsgpack(obj: K): R }, K, R>(type: T, object: K): R {
  if (type.fromMsgpack) {
    return type.fromMsgpack(object);
  } else {
    return type as any;
  }
}
