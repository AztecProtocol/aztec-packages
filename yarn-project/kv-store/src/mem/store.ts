import type { AztecArray } from '../interfaces/array.js';
import type { AztecCounter } from '../interfaces/counter.js';
import type { AztecMap, AztecMultiMap } from '../interfaces/map.js';
import type { AztecSingleton } from '../interfaces/singleton.js';
import type { AztecKVStore } from '../interfaces/store.js';
import { MemAztecArray } from './array.js';
import { MemAztecCounter } from './counter.js';
import { MemAztecMap } from './map.js';
import { MemDb } from './mem_db.js';
import { MemAztecSingleton } from './singleton.js';

/**
 * A key-value store backed by mem.
 */
export class AztecMemStore implements AztecKVStore {
  private data = new MemDb();

  openMap<K extends string | number, V>(name: string): AztecMap<K, V> {
    return new MemAztecMap(name, this.data, false) as any;
  }

  openMultiMap<K extends string | number, V>(name: string): AztecMultiMap<K, V> {
    return new MemAztecMap(name, this.data, true) as any;
  }

  openCounter<K extends string | number | Array<string | number>>(name: string): AztecCounter<K> {
    return new MemAztecCounter(name, this.data) as any;
  }

  openArray<T>(name: string): AztecArray<T> {
    return new MemAztecArray(name, this.data) as any;
  }

  openSingleton<T>(name: string): AztecSingleton<T> {
    return new MemAztecSingleton(name, this.data) as any;
  }

  transaction<T>(callback: () => T): Promise<T> {
    this.data.startTx();
    try {
      const result = callback();
      this.data.commit();
      return Promise.resolve(result);
    } catch (err) {
      this.data.rollback();
      throw err;
    }
  }

  clear() {
    this.data = new MemDb();
    return Promise.resolve();
  }
}
