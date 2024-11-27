import { type Database } from 'lmdb';

import { type Key, type Range } from '../interfaces/common.js';
import { type AztecSet } from '../interfaces/set.js';
import { JungleDBAztecMap } from './map.js';

/**
 * A set backed by JungleDB.
 */
export class JungleDBAztecSet<K extends Key> implements AztecSet<K> {
  private map: JungleDBAztecMap<K, boolean>;
  constructor(rootDb: Database, mapName: string) {
    this.map = new JungleDBAztecMap(rootDb, mapName);
  }

  close(): Promise<void> {
    return this.map.close();
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  add(key: K): Promise<void> {
    return this.map.set(key, true);
  }

  delete(key: K): Promise<void> {
    return this.map.delete(key);
  }

  async *entries(range: Range<K> = {}): AsyncIterableIterator<K> {
    yield* this.map.keys(range);
  }
}
