import { type Key as BaseKey, type Database } from 'lmdb';

import { type Key, type Range } from '../interfaces/common.js';
import { type AztecAsyncCounter, type AztecCounter } from '../interfaces/counter.js';
import { LmdbAztecMap } from './map.js';

/**
 * A counter implementation backed by LMDB
 */
export class LmdbAztecCounter<K extends Key> implements AztecCounter<K>, AztecAsyncCounter<K> {
  #db: Database;
  #name: string;
  #map: LmdbAztecMap<K, number>;

  constructor(db: Database<unknown, BaseKey>, name: string) {
    this.#db = db;
    this.#name = name;
    this.#map = new LmdbAztecMap(db, name);
  }

  async set(key: K, value: number): Promise<void> {
    await this.#map.set(key, value);
  }

  update(key: K, delta = 1): Promise<void> {
    return this.#db.childTransaction(() => {
      const current = this.#map.get(key) ?? 0;
      const next = current + delta;

      if (next < 0) {
        throw new Error(`Cannot update ${key} in counter ${this.#name} below zero`);
      }

      if (next === 0) {
        void this.#map.delete(key);
      } else {
        // store the key inside the entry because LMDB might return an internal representation
        // of the key when iterating over the database
        void this.#map.set(key, next);
      }
    });
  }

  get(key: K): number {
    return this.#map.get(key) ?? 0;
  }

  getAsync(key: K): Promise<number> {
    return Promise.resolve(this.get(key));
  }

  entries(range: Range<K> = {}): IterableIterator<[K, number]> {
    return this.#map.entries(range);
  }

  async *entriesAsync(range: Range<K> = {}): AsyncIterableIterator<[K, number]> {
    yield* this.entries(range);
  }

  keys(range: Range<K> = {}): IterableIterator<K> {
    return this.#map.keys(range);
  }

  async *keysAsync(range: Range<K> = {}): AsyncIterableIterator<K> {
    yield* this.keys(range);
  }
}
