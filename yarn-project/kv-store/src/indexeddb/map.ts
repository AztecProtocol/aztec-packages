import JDB from '@nimiq/jungle-db';

import { type Key, type Range } from '../interfaces/common.js';
import { type AztecMultiMap } from '../interfaces/map.js';

type StoredData<V> = { value: V; key: string; keyCount: number };

/**
 * A map backed by IndexedDB.
 */
export class IndexedDBAztecMap<K extends Key, V> implements AztecMultiMap<K, V> {
  protected db: any;
  protected name: string;

  constructor(rootDb: any, mapName: string) {
    this.name = mapName;
    this.db = rootDb;
    this.db.createIndex(this.#keyIndexName(), 'key', { multiEntry: true, keyEncoding: JDB.BINARY_ENCODING });
  }

  close(): Promise<void> {
    return this.db.close();
  }

  get(key: K): V | undefined {
    const data = this.db.getSync(this.#slot(key));
    return data?.value;
  }

  async *getValues(key: K): AsyncIterableIterator<V> {
    for await (const [_, value] of this.#valueIterator(
      JDB.Query.within(this.#keyCountIndexName(key), 0, Number.MAX_SAFE_INTEGER),
    )) {
      yield value;
    }
  }

  has(key: K): boolean {
    return this.db.getSync(this.#slot(key)) !== undefined;
  }

  async set(key: K, val: V): Promise<void> {
    if (!this.db.index(this.#keyCountIndexName(key))) {
      this.db.createIndex(this.#keyCountIndexName(key), 'keyCount', {
        multiEntry: true,
        keyEncoding: JDB.NUMBER_ENCODING,
      });
    }
    const count = await this.db
      .index(this.#keyCountIndexName(key))
      .count(JDB.Query.within(this.#keyCountIndexName(key), 0, Number.MAX_SAFE_INTEGER));
    await this.db.put(this.#slot(key, count), { value: val, key: this.#normalizeKey(key), keyCount: count });
  }

  swap(key: K, fn: (val: V | undefined) => V): Promise<void> {
    throw new Error('Not implemented');
  }

  async setIfNotExists(key: K, val: V): Promise<boolean> {
    if (!this.has(key)) {
      await this.set(key, val);
      return true;
    }
    return false;
  }

  async delete(key: K): Promise<void> {
    await this.db.remove(this.#slot(key));
    this.db.deleteIndex(this.#normalizeKey(key));
  }

  async deleteValue(key: K, val: V): Promise<void> {
    const values = await this.db.values(JDB.Query.within(this.#keyCountIndexName(key), 0, Number.MAX_SAFE_INTEGER));
    // TODO: Improve this comparison
    const keyCount = values.find((data: StoredData<V>) => JSON.stringify(data.value) === JSON.stringify(val))?.keyCount;
    await this.db.remove(this.#slot(key, keyCount));
  }

  async *#valueIterator(query: typeof JDB.Query, reverse: boolean = false, omitLast: boolean = false, limit?: number) {
    const values = await this.db.values(query, limit);

    let result = values.map((data: StoredData<V>) => [data.key, data.value]);

    result = reverse ? result.reverse() : result;
    result = omitLast ? result.slice(0, -1) : result;

    for (const value of result) {
      yield value;
    }
  }

  async *entries(range: Range<K> = {}): AsyncIterableIterator<[K, V]> {
    let jdbQuery = undefined;
    if (range) {
      const start =
        range.start ??
        this.#denormalizeKey(
          (Array.from(await this.db.index(this.#keyIndexName()).minValues())?.[0] as StoredData<V>)?.key ?? '',
        );
      const end =
        range.end ??
        this.#denormalizeKey(
          (Array.from(await this.db.index(this.#keyIndexName()).maxValues())?.[0] as StoredData<V>)?.key ?? '',
        );
      jdbQuery = JDB.Query.within(this.#keyIndexName(), this.#normalizeKey(start), this.#normalizeKey(end));
    }

    yield* this.#valueIterator(
      jdbQuery,
      !!range.reverse,
      // JDB Queries do not support reversing or exclusive ranges, so we need to do it manually
      (!!range.end && !range.reverse) || (!!range.start && !!range.reverse),
      range.limit,
    );
  }

  async *values(range: Range<K> = {}): AsyncIterableIterator<V> {
    for await (const [_, value] of this.entries(range)) {
      yield value;
    }
  }

  async *keys(range: Range<K> = {}): AsyncIterableIterator<K> {
    for await (const [key, _] of this.entries(range)) {
      yield this.#denormalizeKey(key as string);
    }
  }

  #denormalizeKey(key: string): K {
    const denormalizedKey = (key as string).split(',').map(part => (isNaN(parseInt(part)) ? part : parseInt(part)));
    return (denormalizedKey.length > 1 ? denormalizedKey : key) as K;
  }

  #normalizeKey(key: K): K {
    const arrayKey = Array.isArray(key) ? key : [key];
    return arrayKey.join(',') as K;
  }

  #keyIndexName() {
    return `map:${this.name}:index:key`;
  }

  #keyCountIndexName(key: K): string {
    return `map:${this.name}:index:key:${this.#normalizeKey(key)}`;
  }

  #slot(key: K, index: number = 0): string {
    return `map:${this.name}:slot:${this.#normalizeKey(key)}:${index}`;
  }
}
