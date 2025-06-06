import type { IDBPDatabase, IDBPObjectStore } from 'idb';
import { hash } from 'ohash';

import type { Key, Range, Value } from '../interfaces/common.js';
import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecIDBSchema } from './store.js';

/**
 * A map backed by IndexedDB.
 */
export class IndexedDBAztecMap<K extends Key, V extends Value> implements AztecAsyncMap<K, V> {
  protected name: string;
  protected container: string;

  #_db?: IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'>;
  #rootDB: IDBPDatabase<AztecIDBSchema>;

  constructor(rootDB: IDBPDatabase<AztecIDBSchema>, mapName: string) {
    this.name = mapName;
    this.container = `map:${mapName}`;
    this.#rootDB = rootDB;
  }

  set db(db: IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'> | undefined) {
    this.#_db = db;
  }

  get db(): IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'> {
    return this.#_db ? this.#_db : this.#rootDB.transaction('data', 'readwrite').store;
  }

  async getAsync(key: K): Promise<V | undefined> {
    const data = await this.db.get(this.slot(key));
    return data?.value as V;
  }

  async hasAsync(key: K): Promise<boolean> {
    const result = (await this.getAsync(key)) !== undefined;
    return result;
  }

  sizeAsync(): Promise<number> {
    const rangeQuery = IDBKeyRange.bound([this.container, ''], [this.container, '\uffff']);
    return this.db.count(rangeQuery);
  }

  async set(key: K, val: V): Promise<void> {
    await this.db.put({
      value: val,
      hash: hash(val),
      container: this.container,
      key: this.normalizeKey(key),
      keyCount: 1,
      slot: this.slot(key),
    });
  }

  swap(_key: K, _fn: (val: V | undefined) => V): Promise<void> {
    throw new Error('Not implemented');
  }

  async setIfNotExists(key: K, val: V): Promise<boolean> {
    if (!(await this.hasAsync(key))) {
      await this.set(key, val);
      return true;
    }
    return false;
  }

  async delete(key: K): Promise<void> {
    await this.db.delete(this.slot(key));
  }

  async *entriesAsync(range: Range<K> = {}): AsyncIterableIterator<[K, V]> {
    const index = this.db.index('key');
    const rangeQuery = IDBKeyRange.bound(
      [this.container, range.start ?? ''],
      [this.container, range.end ?? '\uffff'],
      !!range.reverse,
      !range.reverse,
    );
    let count = 0;
    for await (const cursor of index.iterate(rangeQuery, range.reverse ? 'prev' : 'next')) {
      if (range.limit && count >= range.limit) {
        return;
      }
      yield [cursor.value.key, cursor.value.value] as [K, V];
      count++;
    }
  }

  async *valuesAsync(range: Range<K> = {}): AsyncIterableIterator<V> {
    for await (const [_, value] of this.entriesAsync(range)) {
      yield value;
    }
  }

  async *keysAsync(range: Range<K> = {}): AsyncIterableIterator<K> {
    for await (const [key, _] of this.entriesAsync(range)) {
      yield this.#denormalizeKey(key as string);
    }
  }

  #denormalizeKey(key: string): K {
    const denormalizedKey = (key as string).split(',').map(part => (isNaN(parseInt(part)) ? part : parseInt(part)));
    return (denormalizedKey.length > 1 ? denormalizedKey : key) as K;
  }

  protected normalizeKey(key: K): string {
    const arrayKey = Array.isArray(key) ? key : [key];
    return arrayKey.join(',');
  }

  protected slot(key: K, index: number = 0): string {
    return `map:${this.name}:slot:${this.normalizeKey(key)}:${index}`;
  }
}
