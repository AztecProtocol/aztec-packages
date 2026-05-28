import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import type { AztecAsyncBinaryMap } from '../interfaces/binary_map.js';
import { openTmpStore } from './factory.js';
import type { AztecLMDBStoreV2 } from './store.js';
import { incrementBuffer } from './utils.js';

describe('LMDBBinaryMap', () => {
  let store: AztecLMDBStoreV2;
  let map: AztecAsyncBinaryMap;

  beforeEach(async () => {
    store = await openTmpStore('binary-map-test');
    map = store.openBinaryMap('logs');
  });

  afterEach(async () => {
    await store.delete();
  });

  const k = (...bytes: number[]) => Buffer.from(bytes);

  async function collect(iter: AsyncIterable<[Uint8Array, Uint8Array]>): Promise<[Buffer, Buffer][]> {
    const out: [Buffer, Buffer][] = [];
    for await (const [key, val] of iter) {
      out.push([Buffer.from(key), Buffer.from(val)]);
    }
    return out;
  }

  it('round-trips raw keys and raw values', async () => {
    await map.set(k(0x01, 0x02, 0x03), k(0xa, 0xb));
    const got = await map.getAsync(k(0x01, 0x02, 0x03));
    expect(got && Buffer.from(got).equals(k(0xa, 0xb))).toBe(true);

    expect(await map.hasAsync(k(0x01, 0x02, 0x03))).toBe(true);
    expect(await map.hasAsync(k(0x01, 0x02, 0x04))).toBe(false);
  });

  it('deletes raw keys', async () => {
    await map.set(k(0x10), k(0xff));
    expect(await map.hasAsync(k(0x10))).toBe(true);
    await map.delete(k(0x10));
    expect(await map.hasAsync(k(0x10))).toBe(false);
    expect(await map.getAsync(k(0x10))).toBeUndefined();
  });

  it('range-scans in bytewise order', async () => {
    // insert in shuffled order
    const inserts: Buffer[] = [
      k(0x05, 0xff),
      k(0x05, 0x00),
      k(0x01, 0x80),
      k(0x80, 0x01),
      k(0xff, 0x00),
      k(0x00, 0x00),
    ];
    for (const key of inserts) {
      await map.set(key, key);
    }

    const all = await collect(map.entriesAsync());
    const keys = all.map(([key]) => key);
    const sorted = [...inserts].sort(Buffer.compare);
    expect(keys.map(b => b.toString('hex'))).toEqual(sorted.map(b => b.toString('hex')));
  });

  it('orders correctly through high bytes (0x80 - 0xff)', async () => {
    // The ordered-binary scheme used by LMDBMap mangles 0x00 and 0xff; raw memcmp must not.
    for (const byte of [0x00, 0x7f, 0x80, 0xfe, 0xff]) {
      await map.set(Buffer.from([byte]), Buffer.from([byte]));
    }
    const got = await collect(map.entriesAsync());
    const keys = got.map(([key]) => key[0]);
    expect(keys).toEqual([0x00, 0x7f, 0x80, 0xfe, 0xff]);
  });

  it('end bound is exclusive', async () => {
    await map.set(k(0x00, 0x00), k(0xa));
    await map.set(k(0x00, 0x01), k(0xb));
    await map.set(k(0x00, 0x02), k(0xc));

    const got = await collect(map.entriesAsync({ start: k(0x00, 0x00), end: k(0x00, 0x02) }));
    expect(got.map(([key]) => key.toString('hex'))).toEqual(['0000', '0001']);
  });

  it('handles the 0xff carry boundary in inc()', async () => {
    expect(incrementBuffer(Buffer.from([0x00, 0x00, 0x05])).equals(Buffer.from([0x00, 0x00, 0x06]))).toBe(true);
    expect(incrementBuffer(Buffer.from([0x00, 0xff, 0xff])).equals(Buffer.from([0x01]))).toBe(true);
    expect(incrementBuffer(Buffer.from([0xff, 0xff, 0xff])).equals(Buffer.from([0xff, 0xff, 0xff, 0x00]))).toBe(true);
  });

  it('isolates two maps with prefix-overlapping names', async () => {
    // "logs" and "logs-extra": the second's name has the first's name as a string prefix. With raw
    // string concat this would alias; the length-prefixed namespace must prevent that.
    const mapA = store.openBinaryMap('logs');
    const mapB = store.openBinaryMap('logs-extra');

    await mapA.set(k(0x01), k(0xa));
    await mapB.set(k(0x01), k(0xb));

    const valA = await mapA.getAsync(k(0x01));
    const valB = await mapB.getAsync(k(0x01));
    expect(valA && Buffer.from(valA).equals(k(0xa))).toBe(true);
    expect(valB && Buffer.from(valB).equals(k(0xb))).toBe(true);

    // a full scan of one map must not return any rows from the other
    const allA = await collect(mapA.entriesAsync());
    const allB = await collect(mapB.entriesAsync());
    expect(allA.length).toBe(1);
    expect(allB.length).toBe(1);
  });

  it('round-trips 2000 random fixed-width keys preserving sort order', async () => {
    const keys: Buffer[] = [];
    for (let i = 0; i < 2000; i++) {
      const buf = Buffer.allocUnsafe(44);
      for (let j = 0; j < buf.length; j++) {
        buf[j] = Math.floor(Math.random() * 256);
      }
      keys.push(buf);
    }
    for (const key of keys) {
      await map.set(key, key);
    }
    const got = await collect(map.entriesAsync());
    const sorted = [...keys].sort(Buffer.compare);
    // dedupe in case of randomly-generated collision (vanishingly unlikely at 44 bytes but be safe)
    const uniqueSortedHex = Array.from(new Set(sorted.map(b => b.toString('hex'))));
    expect(got.map(([key]) => key.toString('hex'))).toEqual(uniqueSortedHex);
  });
});
