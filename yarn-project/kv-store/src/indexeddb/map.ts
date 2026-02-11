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
    return data ? this.restoreBuffers(data.value as V) : undefined;
  }

  async hasAsync(key: K): Promise<boolean> {
    const result = (await this.getAsync(key)) !== undefined;
    return result;
  }

  async sizeAsync(): Promise<number> {
    const index = this.db.index('key');
    const rangeQuery = IDBKeyRange.bound([this.container], [this.container + '\uffff'], true, true);
    return await index.count(rangeQuery);
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

  async setMany(entries: { key: K; value: V }[]): Promise<void> {
    for (const { key, value } of entries) {
      await this.set(key, value);
    }
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
    const startKey = range.start ? this.normalizeKey(range.start) : [];
    const endKey = range.end ? this.normalizeKey(range.end) : ['\uffff'];

    const rangeQuery = IDBKeyRange.bound(
      [this.container, startKey],
      [this.container, endKey],
      !!range.reverse,
      !range.reverse,
    );
    let count = 0;
    for await (const cursor of index.iterate(rangeQuery, range.reverse ? 'prev' : 'next')) {
      if (range.limit && count >= range.limit) {
        return;
      }
      yield [this.#denormalizeKey(cursor.value.key), this.restoreBuffers(cursor.value.value as V)] as [K, V];
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
      yield key;
    }
  }

  /**
   * IndexedDB's structured clone downcasts Buffer (a Node.js subclass of Uint8Array) to plain Uint8Array.
   * This breaks .toString() behavior: Buffer.toString() returns UTF-8, Uint8Array.toString() returns
   * comma-separated decimal bytes. We restore Buffer identity on read so callers get consistent behavior.
   */
  protected restoreBuffers(val: V): V {
    if (val instanceof Uint8Array && !Buffer.isBuffer(val)) {
      return Buffer.from(val) as V;
    }
    return val;
  }

  #denormalizeKey(key: (string | number | Uint8Array)[]): K {
    return (key.length > 1 ? key : key[0]) as K;
  }

  protected normalizeKey(key: K): (string | number | Uint8Array)[] {
    return Array.isArray(key) ? key : [key];
  }

  protected slot(key: K, index: number = 0): string {
    return `map:${this.name}:slot:${this.normalizeKey(key)}:${index}`;
  }
}
