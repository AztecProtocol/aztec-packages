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

/**
 * Length-prefixed namespace for binary-keyed maps: `[u16 BE name length] ++ name bytes`. Using a length
 * prefix (rather than a string-concat scheme like the regular ordered-binary prefix above) ensures
 * adjacent names (`"logs"` vs `"logs-extra"`) cannot alias each other when concatenated with raw key
 * bytes.
 */
export function binaryMapPrefix(name: string): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  if (nameBuf.length > 0xffff) {
    throw new Error(`Binary map name '${name}' exceeds 65535 bytes`);
  }
  const out = Buffer.allocUnsafe(2 + nameBuf.length);
  out.writeUInt16BE(nameBuf.length, 0);
  nameBuf.copy(out, 2);
  return out;
}

/** Concatenates the binary-map prefix with a raw user key into the on-disk key buffer. */
export function serializeRawKey(prefix: Buffer, key: Uint8Array): Buffer {
  return Buffer.concat([prefix, key]);
}

/**
 * Strips the binary-map prefix from an on-disk key buffer, returning the user-supplied raw key. Returns
 * `false` if the buffer doesn't start with the expected prefix (i.e. the iterator has walked off the end
 * of the map's namespace).
 */
export function deserializeRawKey(prefix: Buffer, key: Uint8Array): Buffer | false {
  if (key.length < prefix.length) {
    return false;
  }
  const candidate = Buffer.from(key.buffer, key.byteOffset, prefix.length);
  if (candidate.compare(prefix) !== 0) {
    return false;
  }
  return Buffer.from(key.buffer, key.byteOffset + prefix.length, key.length - prefix.length);
}

/** Smallest raw on-disk key inside the binary map's namespace (the prefix itself). */
export function minRawKey(prefix: Buffer): Buffer {
  return prefix;
}

/**
 * Smallest raw on-disk key strictly after the binary map's namespace — the first byte sequence whose
 * `memcmp` order is greater than every key in this namespace. Returned as the exclusive `end` bound for
 * a full-namespace scan.
 */
export function maxRawKey(prefix: Buffer): Buffer {
  return incrementBuffer(prefix);
}

/**
 * Returns the smallest byte buffer strictly greater than `buf` in `memcmp` order — `buf` with a `1`
 * added to its trailing byte and carried up. If all bytes are `0xff`, the result is `buf` with an extra
 * `0x00` appended (so the result still sorts strictly after, and no real key shares it).
 */
export function incrementBuffer(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] !== 0xff) {
      out[i] = out[i] + 1;
      return out.subarray(0, i + 1);
    }
  }
  // All bytes were 0xff — extend by one zero byte (still strictly greater than any subbuffer prefix).
  return Buffer.concat([buf, Buffer.from([0x00])]);
}
