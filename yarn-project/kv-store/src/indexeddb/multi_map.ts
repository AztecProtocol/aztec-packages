import { hash } from 'ohash';

import type { Key, Value } from '../interfaces/common.js';
import type { AztecAsyncMultiMap } from '../interfaces/multi_map.js';
import { IndexedDBAztecMap } from './map.js';

/**
 * A multi map backed by IndexedDB.
 */
export class IndexedDBAztecMultiMap<K extends Key, V extends Value>
  extends IndexedDBAztecMap<K, V>
  implements AztecAsyncMultiMap<K, V>
{
  override async set(key: K, val: V): Promise<void> {
    // Inserting repeated values is a no-op
    const exists = !!(await this.db
      .index('hash')
      .get(
        IDBKeyRange.bound(
          [this.container, this.normalizeKey(key), hash(val)],
          [this.container, this.normalizeKey(key), hash(val)],
        ),
      ));
    if (exists) {
      return;
    }
    // Get the maximum keyCount for the given key
    // In order to support sparse multimaps, we cannot rely
    // on just counting the number of entries for the key, since we would repeat slots
    // if we delete an entry
    // set -> container:key:0 (keyCount = 1)
    // set -> container:key:1 (keyCount = 2)
    // delete -> container:key:0 (keyCount = 1)
    // set -> container:key:1 <--- already exists!
    // Instead, we iterate in reverse order to get the last inserted entry
    const index = this.db.index('keyCount');
    const rangeQuery = IDBKeyRange.upperBound([this.container, this.normalizeKey(key), Number.MAX_SAFE_INTEGER]);
    const maxEntry = (await index.iterate(rangeQuery, 'prevunique').next()).value;
    const count = maxEntry?.value?.keyCount ?? 0;
    await this.db.put({
      value: val,
      hash: hash(val),
      container: this.container,
      key: this.normalizeKey(key),
      keyCount: count + 1,
      slot: this.slot(key, count),
    });
  }

  async *getValuesAsync(key: K): AsyncIterableIterator<V> {
    // Iterate over the whole range of keyCount for the given key
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
    // Since we know the value, we can hash it and directly query the "hash" index
    // to avoid having to iterate over all the values
    const fullKey = await this.db
      .index('hash')
      .getKey(
        IDBKeyRange.bound(
          [this.container, this.normalizeKey(key), hash(val)],
          [this.container, this.normalizeKey(key), hash(val)],
        ),
      );
    if (fullKey) {
      await this.db.delete(fullKey);
    }
  }
}
