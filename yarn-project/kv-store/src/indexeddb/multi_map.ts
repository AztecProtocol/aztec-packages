import type { Key } from '../interfaces/common.js';
import type { AztecAsyncMultiMap } from '../interfaces/multi_map.js';
import { IndexedDBAztecMap } from './map.js';

/**
 * A multi map backed by IndexedDB.
 */
export class IndexedDBAztecMultiMap<K extends Key, V>
  extends IndexedDBAztecMap<K, V>
  implements AztecAsyncMultiMap<K, V>
{
  override async set(key: K, val: V): Promise<void> {
    const count = await this.db
      .index('key')
      .count(IDBKeyRange.bound([this.container, this.normalizeKey(key)], [this.container, this.normalizeKey(key)]));
    await this.db.put({
      value: val,
      container: this.container,
      key: this.normalizeKey(key),
      keyCount: count + 1,
      slot: this.slot(key, count),
    });
  }

  async *getValuesAsync(key: K): AsyncIterableIterator<V> {
    const index = this.db.index('keyCount');
    const rangeQuery = IDBKeyRange.bound(
      [this.container, this.normalizeKey(key), 0],
      [this.container, this.normalizeKey(key), Number.MAX_SAFE_INTEGER],
      false,
      false,
    );
    for await (const cursor of index.iterate(rangeQuery)) {
      yield cursor.value.value as V;
    }
  }

  async deleteValue(key: K, val: V): Promise<void> {
    const index = this.db.index('keyCount');
    const rangeQuery = IDBKeyRange.bound(
      [this.container, this.normalizeKey(key), 0],
      [this.container, this.normalizeKey(key), Number.MAX_SAFE_INTEGER],
      false,
      false,
    );
    for await (const cursor of index.iterate(rangeQuery)) {
      if (JSON.stringify(cursor.value.value) === JSON.stringify(val)) {
        await cursor.delete();
        return;
      }
    }
  }
}
