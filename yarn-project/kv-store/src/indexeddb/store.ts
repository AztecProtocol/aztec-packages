import { type Logger } from '@aztec/foundation/log';

import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import { type AztecAsyncArray } from '../interfaces/array.js';
import { type Key } from '../interfaces/common.js';
import { type AztecAsyncCounter } from '../interfaces/counter.js';
import { type AztecAsyncMap, type AztecAsyncMultiMap } from '../interfaces/map.js';
import { type AztecAsyncSet } from '../interfaces/set.js';
import { type AztecAsyncSingleton } from '../interfaces/singleton.js';
import { type AztecAsyncKVStore } from '../interfaces/store.js';
import { IndexedDBAztecArray } from './array.js';
import { IndexedDBAztecMap } from './map.js';
import { IndexedDBAztecSet } from './set.js';
import { IndexedDBAztecSingleton } from './singleton.js';

export type StoredData<V> = { value: V; container: string; key: string; keyCount: number; slot: string };

export interface AztecIDBSchema extends DBSchema {
  data: {
    value: StoredData<any>;
    key: string;
    indexes: { container: string; key: string; keyCount: number };
  };
}

/**
 * A key-value store backed by IndexedDB.
 */

export class AztecIndexedDBStore implements AztecAsyncKVStore {
  #log: Logger;
  #rootDB: IDBPDatabase<AztecIDBSchema>;
  #name: string;

  constructor(rootDB: IDBPDatabase<AztecIDBSchema>, public readonly isEphemeral: boolean, log: Logger, name: string) {
    this.#rootDB = rootDB;
    this.#log = log;
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
    name = name && !ephemeral ? name : self.crypto.getRandomValues(new Uint8Array(16)).join('');
    log.debug(`Opening IndexedDB ${ephemeral ? 'temp ' : ''}database with name ${name}`);
    const rootDB = await openDB<AztecIDBSchema>(name, 1, {
      upgrade(db) {
        const objectStore = db.createObjectStore('data', { keyPath: 'slot' });

        objectStore.createIndex('key', ['container', 'key'], { unique: false });
        objectStore.createIndex('keyCount', ['container', 'key', 'keyCount'], { unique: false });
      },
    });

    const kvStore = new AztecIndexedDBStore(rootDB, ephemeral, log, name);
    return kvStore;
  }

  /**
   * Forks the current DB into a new DB by backing it up to a temporary location and opening a new jungleDB db.
   * @returns A new AztecIndexedDBStore.
   */
  async fork(): Promise<AztecAsyncKVStore> {
    const forkedStore = await AztecIndexedDBStore.open(this.#log, undefined, true);
    this.#log.verbose(`Forking store to ${forkedStore.#name}`);

    // Copy old data to new store
    const oldData = this.#rootDB.transaction('data').store;
    const dataToWrite = [];
    for await (const cursor of oldData.iterate()) {
      dataToWrite.push(cursor.value);
    }
    const tx = forkedStore.#rootDB.transaction('data', 'readwrite').store;
    for (const data of dataToWrite) {
      await tx.add(data);
    }

    this.#log.debug(`Forked store at ${forkedStore.#name} opened successfully`);
    return forkedStore;
  }

  /**
   * Creates a new AztecMap in the store.
   * @param name - Name of the map
   * @returns A new AztecMap
   */
  openMap<K extends Key, V>(name: string): AztecAsyncMap<K, V> {
    return new IndexedDBAztecMap(this.#rootDB, name);
  }

  /**
   * Creates a new AztecSet in the store.
   * @param name - Name of the set
   * @returns A new AztecSet
   */
  openSet<K extends Key>(name: string): AztecAsyncSet<K> {
    return new IndexedDBAztecSet(this.#rootDB, name);
  }

  /**
   * Creates a new AztecMultiMap in the store. A multi-map stores multiple values for a single key automatically.
   * @param name - Name of the map
   * @returns A new AztecMultiMap
   */
  openMultiMap<K extends Key, V>(name: string): AztecAsyncMultiMap<K, V> {
    return new IndexedDBAztecMap(this.#rootDB, name);
  }

  openCounter<K extends Key | Array<string | number>>(_name: string): AztecAsyncCounter<K> {
    throw new Error('Method not implemented.');
  }

  /**
   * Creates a new AztecArray in the store.
   * @param name - Name of the array
   * @returns A new AztecArray
   */
  openArray<T>(name: string): AztecAsyncArray<T> {
    return new IndexedDBAztecArray(this.#rootDB, name);
  }

  /**
   * Creates a new AztecSingleton in the store.
   * @param name - Name of the singleton
   * @returns A new AztecSingleton
   */
  openSingleton<T>(name: string): AztecAsyncSingleton<T> {
    return new IndexedDBAztecSingleton(this.#rootDB, name);
  }

  /**
   * Clears all entries in the store & sub DBs.
   */
  async clear() {
    await this.#rootDB.transaction('data', 'readwrite').store.clear();
  }

  /** Deletes this store and removes the database */
  delete() {
    return Promise.resolve(this.#rootDB.deleteObjectStore('data'));
  }

  estimateSize(): { mappingSize: number; actualSize: number; numItems: number } {
    throw new Error('Method not implemented.');
  }
}
