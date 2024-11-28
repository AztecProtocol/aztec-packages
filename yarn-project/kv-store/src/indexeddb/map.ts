import { type Key, type Range } from '../interfaces/common.js';
import { type AztecMultiMap } from '../interfaces/map.js';
import { promisifyRequest } from './utils.js';

type StoredData<V> = { value: V; key: string; keyCount: number; slot: string };

/**
 * A map backed by IndexedDB.
 */
export class IndexedDBAztecMap<K extends Key, V> implements AztecMultiMap<K, V> {
  protected name: string;

  #_db?: IDBObjectStore;
  #rootDB: IDBDatabase;

  constructor(rootDB: IDBDatabase, mapName: string) {
    this.name = mapName;
    this.#rootDB = rootDB;
  }

  set db(db: IDBObjectStore | undefined) {
    this.#_db = db;
  }

  get db(): IDBObjectStore {
    return this.#_db ? this.#_db : this.#rootDB.transaction('data', 'readwrite').objectStore('data');
  }

  async get(key: K): Promise<V | undefined> {
    const data = await promisifyRequest(this.db.get(this.#slot(key)));
    return data?.value;
  }

  async *getValues(key: K): AsyncIterableIterator<V> {
    throw new Error('Not implemented');
  }

  async has(key: K): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async set(key: K, val: V): Promise<void> {
    const count = await promisifyRequest(this.db.index('key').count(this.#normalizeKey(key)));
    console.log('count', count);
    await this.db.put({ value: val, key: this.#normalizeKey(key), keyCount: count, slot: this.#slot(key, count) });
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
    await promisifyRequest(this.db.delete(this.#slot(key)));
  }

  async deleteValue(key: K, val: V): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async *#valueIterator(query: any, reverse: boolean = false, omitLast: boolean = false, limit?: number) {
    throw new Error('Method not implemented.');
  }

  async *entries(range: Range<K> = {}): AsyncIterableIterator<[K, V]> {
    throw new Error('Method not implemented.');
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

  #slot(key: K, index: number = 0): string {
    return `map:${this.name}:slot:${this.#normalizeKey(key)}:${index}`;
  }
}
