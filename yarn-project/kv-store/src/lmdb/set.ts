import { type Database } from 'lmdb';

import { type Key, type Range } from '../interfaces/common.js';
import { type AztecAsyncSet, type AztecSet } from '../interfaces/set.js';
import { LmdbAztecMap } from './map.js';

/**
 * A set backed by LMDB.
 */
export class LmdbAztecSet<K extends Key> implements AztecSet<K>, AztecAsyncSet<K> {
  private map: LmdbAztecMap<K, boolean>;
  constructor(rootDb: Database, mapName: string) {
    this.map = new LmdbAztecMap(rootDb, mapName);
  }

  close(): Promise<void> {
    return this.map.close();
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  hasAsync(key: K): Promise<boolean> {
    return Promise.resolve(this.has(key));
  }

  add(key: K): Promise<void> {
    return this.map.set(key, true);
  }

  delete(key: K): Promise<void> {
    return this.map.delete(key);
  }

  entries(range: Range<K> = {}): IterableIterator<K> {
    return this.map.keys(range);
  }

  async *entriesAsync(range: Range<K> = {}): AsyncIterableIterator<K> {
    for await (const key of this.map.keysAsync(range)) {
      yield key;
    }
  }
}
