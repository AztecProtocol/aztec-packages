import { MAXIMUM_KEY, fromBufferKey, toBufferKey } from 'ordered-binary';

import type { Key } from '../interfaces/common.js';

export function keyCmp(a: [Uint8Array, Uint8Array[] | null], b: [Uint8Array, Uint8Array[] | null]): -1 | 0 | 1 {
  return Buffer.compare(a[0], b[0]);
}

export function singleKeyCmp(a: [Uint8Array, Uint8Array[] | null], b: Uint8Array): -1 | 0 | 1 {
  return Buffer.compare(a[0], b);
}

export function minKey(prefix: string) {
  return toBufferKey([prefix]);
}

export function maxKey(prefix: string) {
  return toBufferKey([prefix, MAXIMUM_KEY]);
}

export function serializeKey(prefix: string, key: Key): Buffer {
  return toBufferKey([prefix, key]);
}

export function deserializeKey<K extends Key>(prefix: string, key: Uint8Array): K | false {
  const buf = Buffer.from(key);
  const parsed = fromBufferKey(buf);
  if (!Array.isArray(parsed) || parsed[0] !== prefix) {
    return false;
  }
  return parsed[1] as K;
}
