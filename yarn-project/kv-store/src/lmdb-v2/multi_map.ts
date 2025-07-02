import { Encoder } from 'msgpackr/pack';

import type { Key, Range, Value } from '../interfaces/common.js';
import type { AztecAsyncMultiMap } from '../interfaces/multi_map.js';
import type { ReadTransaction } from './read_transaction.js';
import { type AztecLMDBStoreV2, execInReadTx, execInWriteTx } from './store.js';
import { deserializeKey, maxKey, minKey, serializeKey } from './utils.js';

export class LMDBMultiMap<K extends Key, V extends Value> implements AztecAsyncMultiMap<K, V> {
  private prefix: string;
  private encoder = new Encoder();
  constructor(
    private store: AztecLMDBStoreV2,
    name: string,
  ) {
    this.prefix = `multimap:${name}`;
  }

  /**
   * Sets the value at the given key.
   * @param key - The key to set the value at
   * @param val - The value to set
   */
  set(key: K, val: V): Promise<void> {
    return execInWriteTx(this.store, tx => tx.setIndex(serializeKey(this.prefix, key), this.encoder.pack(val)));
  }

  async setMany(entries: { key: K; value: V }[]): Promise<void> {
    await execInWriteTx(this.store, async tx => {
      for (const { key, value } of entries) {
        await tx.setIndex(serializeKey(this.prefix, key), this.encoder.pack(value));
      }
    });
  }

  /**
   * Sets the value at the given key if it does not already exist.
   * @param key - The key to set the value at
   * @param val - The value to set
   */
  setIfNotExists(key: K, val: V): Promise<boolean> {
    return execInWriteTx(this.store, async tx => {
      const exists = !!(await this.getAsync(key));
      if (!exists) {
        await tx.setIndex(serializeKey(this.prefix, key), this.encoder.pack(val));
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
    return execInWriteTx(this.store, tx => tx.removeIndex(serializeKey(this.prefix, key)));
  }

  getAsync(key: K): Promise<V | undefined> {
    return execInReadTx(this.store, async tx => {
      const val = await tx.getIndex(serializeKey(this.prefix, key));
      return val.length > 0 ? this.encoder.unpack(val[0]) : undefined;
    });
  }

  hasAsync(key: K): Promise<boolean> {
    return execInReadTx(this.store, async tx => (await tx.getIndex(serializeKey(this.prefix, key))).length > 0);
  }

  sizeAsync(): Promise<number> {
    return execInReadTx(this.store, tx => tx.countEntriesIndex(minKey(this.prefix), maxKey(this.prefix), false));
  }

  /**
   * Iterates over the map's key-value entries in the key's natural order
   * @param range - The range of keys to iterate over
   */
  async *entriesAsync(range?: Range<K>): AsyncIterableIterator<[K, V]> {
    const reverse = range?.reverse ?? false;
    const startKey = range?.start ? serializeKey(this.prefix, range.start) : minKey(this.prefix);
    const endKey = range?.end ? serializeKey(this.prefix, range.end) : reverse ? maxKey(this.prefix) : undefined;

    let tx: ReadTransaction | undefined = this.store.getCurrentWriteTx();
    const shouldClose = !tx;
    tx ??= this.store.getReadTx();

    try {
      for await (const [key, vals] of tx.iterateIndex(
        reverse ? endKey! : startKey,
        reverse ? startKey : endKey,
        reverse,
        range?.limit,
      )) {
        const deserializedKey = deserializeKey<K>(this.prefix, key);
        if (!deserializedKey) {
          break;
        }

        for (const val of vals) {
          yield [deserializedKey, this.encoder.unpack(val)];
        }
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

  deleteValue(key: K, val: V | undefined): Promise<void> {
    return execInWriteTx(this.store, tx => tx.removeIndex(serializeKey(this.prefix, key), this.encoder.pack(val)));
  }

  async *getValuesAsync(key: K): AsyncIterableIterator<V> {
    const values = await execInReadTx(this.store, tx => tx.getIndex(serializeKey(this.prefix, key)));
    for (const value of values) {
      yield this.encoder.unpack(value);
    }
  }
}
