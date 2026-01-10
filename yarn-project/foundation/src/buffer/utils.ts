import { Buffer } from 'buffer';

export function bufferAlloc(size: number, fill?: number | string | Uint8Array): Buffer {
  return Buffer.alloc(size, fill);
}

// the overloads are too complex, so just re-assign
export const bufferFrom = Buffer.from;

export function bufferConcat(list: readonly Uint8Array[], totalLength?: number) {
  return Buffer.concat(list, totalLength);
}

export function isBuffer(obj: any) {
  return Buffer.isBuffer(obj);
}

export function bufferCompare(a: Uint8Array, b: Uint8Array) {
  return Buffer.compare(a, b);
}
