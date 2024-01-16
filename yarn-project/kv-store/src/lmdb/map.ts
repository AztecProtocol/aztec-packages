import { Database, Key } from 'lmdb';

import { Range } from '../interfaces/common.js';
import { AztecMultiMap } from '../interfaces/map.js';

/** The slot where a key-value entry would be stored */
type MapKeyValueSlot<K extends string | number | Buffer> = ['map', string, 'slot', K];

/**
 * A map backed by LMDB.
 */
export class LmdbAztecMap<K extends string | number, V> implements AztecMultiMap<K, V> {
  protected db: Database<V, MapKeyValueSlot<K>>;
  protected name: string;

  #startSentinel: MapKeyValueSlot<Buffer>;
  #endSentinel: MapKeyValueSlot<Buffer>;

  constructor(rootDb: Database<unknown, Key>, mapName: string) {
    this.name = mapName;
    this.db = rootDb as Database<V, MapKeyValueSlot<K>>;

    // sentinels are used to define the start and end of the map
    // with LMDB's key encoding, no _primitive value_ can be "less than" an empty buffer or greater than Byte 255
    // these will be used later to answer range queries
    this.#startSentinel = ['map', this.name, 'slot', Buffer.from([])];
    this.#endSentinel = ['map', this.name, 'slot', Buffer.from([255])];
  }

  close(): Promise<void> {
    return this.db.close();
  }

  get(key: K): V | undefined {
    return this.db.get(this.#slot(key)) as V | undefined;
  }

  *getValues(key: K): IterableIterator<V> {
    const values = this.db.getValues(this.#slot(key));
    for (const value of values) {
      yield value;
    }
  }

  has(key: K): boolean {
    return this.db.doesExist(this.#slot(key));
  }

  set(key: K, val: V): Promise<boolean> {
    return this.db.put(this.#slot(key), val);
  }

  swap(key: K, fn: (val: V | undefined) => V): Promise<boolean> {
    return this.db.childTransaction(() => {
      const slot = this.#slot(key);
      const val = this.db.get(slot);
      void this.db.put(slot, fn(val));

      return true;
    });
  }

  setIfNotExists(key: K, val: V): Promise<boolean> {
    const slot = this.#slot(key);
    return this.db.ifNoExists(slot, () => {
      void this.db.put(slot, val);
    });
  }

  delete(key: K): Promise<boolean> {
    return this.db.remove(this.#slot(key));
  }

  async deleteValue(key: K, val: V): Promise<void> {
    await this.db.remove(this.#slot(key), val);
  }

  *entries(range: Range<K> = {}): IterableIterator<[K, V]> {
    const { start, end, reverse = false, limit } = range;
    // LMDB has a quirk where it expects start > end when reverse=true
    // in that case, we need to swap the start and end sentinels
    const iterator = this.db.getRange({
      start: start ? this.#slot(start) : reverse ? this.#endSentinel : this.#startSentinel,
      end: end ? this.#slot(end) : reverse ? this.#startSentinel : this.#endSentinel,
      reverse,
      limit,
    });

    for (const { key, value } of iterator) {
      if (key[0] !== 'map' || key[1] !== this.name) {
        break;
      }

      const originalKey = key[3];
      yield [originalKey, value];
    }
  }

  *values(range: Range<K> = {}): IterableIterator<V> {
    for (const [_, value] of this.entries(range)) {
      yield value;
    }
  }

  *keys(range: Range<K> = {}): IterableIterator<K> {
    for (const [key, _] of this.entries(range)) {
      yield key;
    }
  }

  #slot(key: K): MapKeyValueSlot<K> {
    return ['map', this.name, 'slot', key];
  }
}
