import type { Key, Value } from '../interfaces/common.js';
import type { AztecAsyncMultiMap, AztecMultiMap } from '../interfaces/multi_map.js';
import { LmdbAztecMap } from './map.js';

/**
 * A map backed by LMDB.
 */
export class LmdbAztecMultiMap<K extends Key, V extends Value>
  extends LmdbAztecMap<K, V>
  implements AztecMultiMap<K, V>, AztecAsyncMultiMap<K, V>
{
  *getValues(key: K): IterableIterator<V> {
    const transaction = this.db.useReadTransaction();
    try {
      const values = this.db.getValues(this.slot(key), {
        transaction,
      });
      for (const value of values) {
        yield value?.[1];
      }
    } finally {
      transaction.done();
    }
  }

  async *getValuesAsync(key: K): AsyncIterableIterator<V> {
    for (const value of this.getValues(key)) {
      yield value;
    }
  }

  async deleteValue(key: K, val: V): Promise<void> {
    await this.db.remove(this.slot(key), [key, val]);
  }
}
