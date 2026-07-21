import type { Key, Range } from '../interfaces/common.js';
import type { AztecAsyncSet } from '../interfaces/set.js';
import { SQLiteOPFSAztecMap } from './map.js';
import type { AztecSQLiteOPFSStore } from './store.js';

/** Set backed by SQLite. Composes a Map<K, true>. */
export class SQLiteOPFSAztecSet<K extends Key> implements AztecAsyncSet<K> {
  readonly #map: SQLiteOPFSAztecMap<K, boolean>;

  constructor(store: AztecSQLiteOPFSStore, name: string) {
    this.#map = new SQLiteOPFSAztecMap<K, boolean>(store, name);
  }

  hasAsync(key: K): Promise<boolean> {
    return this.#map.hasAsync(key);
  }

  add(key: K): Promise<void> {
    return this.#map.set(key, true);
  }

  delete(key: K): Promise<void> {
    return this.#map.delete(key);
  }

  async *entriesAsync(range: Range<K> = {}): AsyncIterableIterator<K> {
    yield* this.#map.keysAsync(range);
  }
}
