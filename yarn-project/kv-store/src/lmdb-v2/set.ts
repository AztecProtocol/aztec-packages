import type { Key, Range } from '../interfaces/common.js';
import type { AztecAsyncSet } from '../interfaces/set.js';
import { LMDBMap } from './map.js';
import type { AztecLMDBStoreV2 } from './store.js';

/**
 * A set backed by LMDB.
 */
export class LMDBSet<K extends Key> implements AztecAsyncSet<K> {
  private map: LMDBMap<K, boolean>;

  constructor(store: AztecLMDBStoreV2, mapName: string) {
    this.map = new LMDBMap(store, mapName);
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
    for await (const key of this.map.keysAsync(range)) {
      yield key;
    }
  }
}
