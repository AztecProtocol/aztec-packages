import type { Logger } from '@aztec/foundation/log';

import { type DBSchema, type IDBPDatabase, type IDBPTransaction, deleteDB, openDB } from 'idb';

import type { AztecAsyncArray } from '../interfaces/array.js';
import type { Key, StoreSize, Value } from '../interfaces/common.js';
import type { AztecAsyncCounter } from '../interfaces/counter.js';
import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncMultiMap } from '../interfaces/multi_map.js';
import type { AztecAsyncSet } from '../interfaces/set.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';
import { IndexedDBAztecArray } from './array.js';
import { IndexedDBAztecMap } from './map.js';
import { IndexedDBAztecMultiMap } from './multi_map.js';
import { IndexedDBAztecSet } from './set.js';
import { IndexedDBAztecSingleton } from './singleton.js';

export type StoredData<V extends Value> = {
  value: V;
  container: string;
  key: string;
  keyCount: number;
  slot: string;
  hash: string;
};

export interface AztecIDBSchema extends DBSchema {
  data: {
    value: StoredData<any>;
    key: string;
    indexes: { container: string; key: string; keyCount: number; hash: string };
  };
}

/**
 * A key-value store backed by IndexedDB.
 */

export class AztecIndexedDBStore implements AztecAsyncKVStore {
  #rootDB: IDBPDatabase<AztecIDBSchema>;
  #name: string;
  #currentTx?: IDBPTransaction<AztecIDBSchema, ['data'], 'readwrite'>;

  #containers = new Set<
    | IndexedDBAztecArray<any>
    | IndexedDBAztecMap<any, any>
    | IndexedDBAztecMultiMap<any, any>
    | IndexedDBAztecSet<any>
    | IndexedDBAztecSingleton<any>
  >();

  constructor(
    rootDB: IDBPDatabase<AztecIDBSchema>,
    public readonly isEphemeral: boolean,
    name: string,
  ) {
    this.#rootDB = rootDB;
    this.#name = name;
  }
  /**
   * Creates a new AztecKVStore backed by IndexedDB. The path to the database is optional. If not provided,
   * the database will be stored in a temporary location and be deleted when the process exists.
   *
   *
   * @param path - A path on the disk to store the database. Optional
   * @param ephemeral - true if the store should only exist in memory and not automatically be flushed to disk. Optional
   * @param log - A logger to use. Optional
   * @returns The store
   */
  static async open(log: Logger, name?: string, ephemeral: boolean = false): Promise<AztecIndexedDBStore> {
    name = name && !ephemeral ? name : globalThis.crypto.getRandomValues(new Uint8Array(16)).join('');
    log.debug(`Opening IndexedDB ${ephemeral ? 'temp ' : ''}database with name ${name}`);
    const rootDB = await openDB<AztecIDBSchema>(name, 1, {
      upgrade(db) {
        const objectStore = db.createObjectStore('data', { keyPath: 'slot' });

        objectStore.createIndex('key', ['container', 'key'], { unique: false });
        // Keep count of the maximum number of keys ever inserted in the container
        // This allows unique slots for repeated keys, which is useful for multi-maps
        objectStore.createIndex('keyCount', ['container', 'key', 'keyCount'], { unique: true });
        // Keep an index on the pair key-hash for a given container, allowing us to efficiently
        // delete unique values from multi-maps
        objectStore.createIndex('hash', ['container', 'key', 'hash'], { unique: true });
      },
    });

    const kvStore = new AztecIndexedDBStore(rootDB, ephemeral, name);
    return kvStore;
  }

  /**
   * Creates a new AztecMap in the store.
   * @param name - Name of the map
   * @returns A new AztecMap
   */
  openMap<K extends Key, V extends Value>(name: string): AztecAsyncMap<K, V> {
    const map = new IndexedDBAztecMap<K, V>(this.#rootDB, name);
    this.#containers.add(map);
    return map;
  }

  /**
   * Creates a new AztecSet in the store.
   * @param name - Name of the set
   * @returns A new AztecSet
   */
  openSet<K extends Key>(name: string): AztecAsyncSet<K> {
    const set = new IndexedDBAztecSet<K>(this.#rootDB, name);
    this.#containers.add(set);
    return set;
  }

  /**
   * Creates a new AztecMultiMap in the store. A multi-map stores multiple values for a single key automatically.
   * @param name - Name of the map
   * @returns A new AztecMultiMap
   */
  openMultiMap<K extends Key, V extends Value>(name: string): AztecAsyncMultiMap<K, V> {
    const multimap = new IndexedDBAztecMultiMap<K, V>(this.#rootDB, name);
    this.#containers.add(multimap);
    return multimap;
  }

  openCounter<K extends Key>(_name: string): AztecAsyncCounter<K> {
    throw new Error('Method not implemented.');
  }

  /**
   * Creates a new AztecArray in the store.
   * @param name - Name of the array
   * @returns A new AztecArray
   */
  openArray<T extends Value>(name: string): AztecAsyncArray<T> {
    const array = new IndexedDBAztecArray<T>(this.#rootDB, name);
    this.#containers.add(array);
    return array;
  }

  /**
   * Creates a new AztecSingleton in the store.
   * @param name - Name of the singleton
   * @returns A new AztecSingleton
   */
  openSingleton<T extends Value>(name: string): AztecAsyncSingleton<T> {
    const singleton = new IndexedDBAztecSingleton<T>(this.#rootDB, name);
    this.#containers.add(singleton);
    return singleton;
  }

  /**
   * Runs a callback in a transaction.
   * @param callback - Function to execute in a transaction
   * @returns A promise that resolves to the return value of the callback
   */
  async transactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    // We can only have one transaction at a time for the same store
    // So we need to wait for the current one to finish
    if (this.#currentTx) {
      await this.#currentTx.done;
    }
    this.#currentTx = this.#rootDB.transaction('data', 'readwrite');
    for (const container of this.#containers) {
      container.db = this.#currentTx.store;
    }
    // Avoid awaiting this promise so it doesn't get scheduled in the next microtask
    // By then, the tx would be closed
    const runningPromise = callback();
    // Wait for the transaction to finish
    await this.#currentTx.done;
    for (const container of this.#containers) {
      container.db = undefined;
    }

    // Return the result of the callback.
    // Tx is guaranteed to already be closed, so the await doesn't hurt anything here
    return await runningPromise;
  }

  /**
   * Clears all entries in the store & sub DBs.
   */
  async clear() {
    await this.#rootDB.transaction('data', 'readwrite').store.clear();
  }

  /** Deletes this store and removes the database */
  delete() {
    this.#containers.clear();
    this.#rootDB.close();
    return deleteDB(this.#name);
  }

  estimateSize(): Promise<StoreSize> {
    return Promise.resolve({ mappingSize: 0, physicalFileSize: 0, actualSize: 0, numItems: 0 });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  backupTo(_dstPath: string, _compact?: boolean): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
