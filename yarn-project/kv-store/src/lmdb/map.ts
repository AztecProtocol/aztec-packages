import { type Database, type RangeOptions } from 'lmdb';

import { type Key, type Range } from '../interfaces/common.js';
import { type AztecAsyncMultiMap, type AztecMultiMap, type AztecMapWithSize } from '../interfaces/map.js';

/** The slot where a key-value entry would be stored */
type MapValueSlot<K extends Key | Buffer> = ['map', string, 'slot', K];

/**
 * A map backed by LMDB.
 */
export class LmdbAztecMap<K extends Key, V> implements AztecMultiMap<K, V>, AztecAsyncMultiMap<K, V> {
  protected db: Database<[K, V], MapValueSlot<K>>;
  protected name: string;

  #startSentinel: MapValueSlot<Buffer>;
  #endSentinel: MapValueSlot<Buffer>;

  constructor(rootDb: Database, mapName: string) {
    this.name = mapName;
    this.db = rootDb as Database<[K, V], MapValueSlot<K>>;

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
    return this.db.get(this.slot(key))?.[1];
  }

  getAsync(key: K): Promise<V | undefined> {
    return Promise.resolve(this.get(key));
  }

  *getValues(key: K): IterableIterator<V> {
    const values = this.db.getValues(this.slot(key));
    for (const value of values) {
      yield value?.[1];
    }
  }

  async *getValuesAsync(key: K): AsyncIterableIterator<V> {
    for (const value of this.getValues(key)) {
      yield value;
    }
  }

  has(key: K): boolean {
    return this.db.doesExist(this.slot(key));
  }

  hasAsync(key: K): Promise<boolean> {
    return Promise.resolve(this.has(key));
  }

  async set(key: K, val: V): Promise<void> {
    await this.db.put(this.slot(key), [key, val]);
  }

  swap(key: K, fn: (val: V | undefined) => V): Promise<void> {
    return this.db.childTransaction(() => {
      const slot = this.slot(key);
      const entry = this.db.get(slot);
      void this.db.put(slot, [key, fn(entry?.[1])]);
    });
  }

  setIfNotExists(key: K, val: V): Promise<boolean> {
    const slot = this.slot(key);
    return this.db.ifNoExists(slot, () => {
      void this.db.put(slot, [key, val]);
    });
  }

  async delete(key: K): Promise<void> {
    await this.db.remove(this.slot(key));
  }

  async deleteValue(key: K, val: V): Promise<void> {
    await this.db.remove(this.slot(key), [key, val]);
  }

  *entries(range: Range<K> = {}): IterableIterator<[K, V]> {
    const { reverse = false, limit } = range;
    // LMDB has a quirk where it expects start > end when reverse=true
    // in that case, we need to swap the start and end sentinels
    const start = reverse
      ? range.end
        ? this.slot(range.end)
        : this.#endSentinel
      : range.start
      ? this.slot(range.start)
      : this.#startSentinel;

    const end = reverse
      ? range.start
        ? this.slot(range.start)
        : this.#startSentinel
      : range.end
      ? this.slot(range.end)
      : this.#endSentinel;

    const lmdbRange: RangeOptions = {
      start,
      end,
      reverse,
      limit,
    };

    const iterator = this.db.getRange(lmdbRange);

    for (const {
      value: [key, value],
    } of iterator) {
      yield [key, value];
    }
  }

  async *entriesAsync(range?: Range<K> | undefined): AsyncIterableIterator<[K, V]> {
    for (const entry of this.entries(range)) {
      yield entry;
    }
  }

  *values(range: Range<K> = {}): IterableIterator<V> {
    for (const [_, value] of this.entries(range)) {
      yield value;
    }
  }

  async *valuesAsync(range: Range<K> = {}): AsyncIterableIterator<V> {
    for await (const [_, value] of this.entriesAsync(range)) {
      yield value;
    }
  }

  *keys(range: Range<K> = {}): IterableIterator<K> {
    for (const [key, _] of this.entries(range)) {
      yield key;
    }
  }

  async *keysAsync(range: Range<K> = {}): AsyncIterableIterator<K> {
    for await (const [key, _] of this.entriesAsync(range)) {
      yield key;
    }
  }

  protected slot(key: K): MapValueSlot<K> {
    return ['map', this.name, 'slot', key];
  }

  async clear(): Promise<void> {
    const lmdbRange: RangeOptions = {
      start: this.#startSentinel,
      end: this.#endSentinel,
    };

    const iterator = this.db.getRange(lmdbRange);

    for (const {
      key,
    } of iterator) {
      await this.db.remove(key);
    }
  }

}

export class LmdbAztecMapWithSize<K extends Key, V> extends LmdbAztecMap<K, V> implements AztecMapWithSize<K, V>, AztecAsyncMultiMap<K, V> {
  #sizeCache?: number;

  constructor(rootDb: Database, mapName: string) {
    super(rootDb, mapName);
  }

  override async set(key: K, val: V): Promise<void> {
    await this.db.childTransaction(() => {
      const exists = this.db.doesExist(this.slot(key));
      this.db.putSync(this.slot(key), [key, val], {
        appendDup: true
      });
      if (!exists) {
        this.#sizeCache = undefined; // Invalidate cache
      }
    });
  }

  override async delete(key: K): Promise<void> {
    await this.db.childTransaction(async () => {
      const exists = this.db.doesExist(this.slot(key));
      if (exists) {
        await this.db.remove(this.slot(key));
        this.#sizeCache = undefined; // Invalidate cache
      }
    });
  }

  override async deleteValue(key: K, val: V): Promise<void> {
    await this.db.childTransaction(async () => {
      const exists = this.db.doesExist(this.slot(key));
      if (exists) {
        await this.db.remove(this.slot(key), [key, val]);
        this.#sizeCache = undefined; // Invalidate cache
      }
    });
  }

  /**
   * Gets the size of the map by counting entries.
   * @returns The number of entries in the map
   */
  size(): number {
    if (this.#sizeCache === undefined) {
      this.#sizeCache = this.db.getCount();
    }
    return this.#sizeCache;
  }

  // Reset cache on clear/drop operations
  clearCache() {
    this.#sizeCache = undefined;
  }
}
