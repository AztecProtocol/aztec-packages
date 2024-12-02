import { type IDBPDatabase, type IDBPObjectStore } from 'idb';

import { type Key, type Range } from '../interfaces/common.js';
import { type AztecAsyncSet } from '../interfaces/set.js';
import { IndexedDBAztecMap } from './map.js';
import { type AztecIDBSchema } from './store.js';

/**
 * A set backed by IndexedDB.
 */
export class IndexedDBAztecSet<K extends Key> implements AztecAsyncSet<K> {
  private map: IndexedDBAztecMap<K, boolean>;

  constructor(rootDb: IDBPDatabase<AztecIDBSchema>, mapName: string) {
    this.map = new IndexedDBAztecMap(rootDb, mapName);
  }

  set db(db: IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'> | undefined) {
    this.map.db = db;
  }

  hasAsync(key: K): Promise<boolean> {
    return this.map.hasAsync(key);
  }

  add(key: K): Promise<void> {
    return this.map.set(key, true);
  }

  delete(key: K): Promise<void> {
    return this.map.delete(key);
  }

  async *entriesAsync(range: Range<K> = {}): AsyncIterableIterator<K> {
    yield* this.map.keysAsync(range);
  }
}
