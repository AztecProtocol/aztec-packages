import { Encoder } from 'msgpackr';

import type { Key, Range, Value } from '../interfaces/common.js';
import type { AztecAsyncMap } from '../interfaces/map.js';
import type { ReadTransaction } from './read_transaction.js';
// eslint-disable-next-line import/no-cycle
import { type AztecLMDBStoreV2, execInReadTx, execInWriteTx } from './store.js';
import { deserializeKey, maxKey, minKey, serializeKey } from './utils.js';

export class LMDBMap<K extends Key, V extends Value> implements AztecAsyncMap<K, V> {
  private prefix: string;
  private encoder = new Encoder();

  constructor(
    private store: AztecLMDBStoreV2,
    name: string,
  ) {
    this.prefix = `map:${name}`;
  }
  /**
   * Sets the value at the given key.
   * @param key - The key to set the value at
   * @param val - The value to set
   */
  set(key: K, val: V): Promise<void> {
    return execInWriteTx(this.store, tx => tx.set(serializeKey(this.prefix, key), this.encoder.pack(val)));
  }

  /**
   * Sets the value at the given key if it does not already exist.
   * @param key - The key to set the value at
   * @param val - The value to set
   */
  setIfNotExists(key: K, val: V): Promise<boolean> {
    return execInWriteTx(this.store, async tx => {
      const strKey = serializeKey(this.prefix, key);
      const exists = !!(await tx.get(strKey));
      if (!exists) {
        await tx.set(strKey, this.encoder.pack(val));
        return true;
      }
      return false;
    });
  }

  /**
   * Deletes the value at the given key.
   * @param key - The key to delete the value at
   */
  delete(key: K): Promise<void> {
    return execInWriteTx(this.store, tx => tx.remove(serializeKey(this.prefix, key)));
  }

  getAsync(key: K): Promise<V | undefined> {
    return execInReadTx(this.store, async tx => {
      const val = await tx.get(serializeKey(this.prefix, key));
      return val ? this.encoder.unpack(val) : undefined;
    });
  }

  hasAsync(key: K): Promise<boolean> {
    return execInReadTx(this.store, async tx => !!(await tx.get(serializeKey(this.prefix, key))));
  }

  sizeAsync(): Promise<number> {
    return execInReadTx(this.store, tx => tx.countEntries(minKey(this.prefix), maxKey(this.prefix), false));
  }

  /**
   * Iterates over the map's key-value entries in the key's natural order
   * @param range - The range of keys to iterate over
   */
  async *entriesAsync(range?: Range<K>): AsyncIterableIterator<[K, V]> {
    const reverse = range?.reverse ?? false;

    const startKey = range?.start !== undefined ? serializeKey(this.prefix, range.start) : minKey(this.prefix);

    const endKey =
      range?.end !== undefined ? serializeKey(this.prefix, range.end) : reverse ? maxKey(this.prefix) : undefined;

    let tx: ReadTransaction | undefined = this.store.getCurrentWriteTx();
    const shouldClose = !tx;
    tx ??= this.store.getReadTx();

    try {
      for await (const [key, val] of tx.iterate(
        reverse ? endKey! : startKey,
        reverse ? startKey : endKey,
        reverse,
        range?.limit,
      )) {
        const deserializedKey = deserializeKey<K>(this.prefix, key);
        if (deserializedKey === false) {
          break;
        }
        yield [deserializedKey, this.encoder.unpack(val)];
      }
    } finally {
      if (shouldClose) {
        tx.close();
      }
    }
  }

  /**
   * Iterates over the map's values in the key's natural order
   * @param range - The range of keys to iterate over
   */
  async *valuesAsync(range?: Range<K>): AsyncIterableIterator<V> {
    for await (const [_, value] of this.entriesAsync(range)) {
      yield value;
    }
  }

  /**
   * Iterates over the map's keys in the key's natural order
   * @param range - The range of keys to iterate over
   */
  async *keysAsync(range?: Range<K>): AsyncIterableIterator<K> {
    for await (const [key, _] of this.entriesAsync(range)) {
      yield key;
    }
  }
}
