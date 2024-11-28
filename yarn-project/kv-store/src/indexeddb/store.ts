import { type Logger } from '@aztec/foundation/log';

import { AztecArray } from '../interfaces/array.js';
import { Key } from '../interfaces/common.js';
import { AztecCounter } from '../interfaces/counter.js';
import { AztecMap, AztecMultiMap } from '../interfaces/map.js';
import { AztecSet } from '../interfaces/set.js';
import { AztecSingleton } from '../interfaces/singleton.js';
import { type AztecKVStore } from '../interfaces/store.js';
import { type IndexedDBAztecArray } from './array.js';
import { IndexedDBAztecMap } from './map.js';
import { IndexedDBAztecSet } from './set.js';
import { IndexedDBAztecSingleton } from './singleton.js';
import { promisifyRequest } from './utils.js';

/**
 * A key-value store backed by IndexedDB.
 */
export class AztecIndexedDBStore implements AztecKVStore {
  #log: Logger;
  #rootDB: IDBDatabase;
  #data: IDBObjectStore;
  #name: string;

  #containers = new Set<
    IndexedDBAztecArray<any> | IndexedDBAztecMap<any, any> | IndexedDBAztecSet<any> | IndexedDBAztecSingleton<any>
  >();

  constructor(rootDB: IDBDatabase, public readonly isEphemeral: boolean, log: Logger, name?: string) {
    this.#rootDB = rootDB;
    this.#log = log;
    this.#name = name ?? 'tmp';
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
  static async open(name: string, log: Logger, ephemeral: boolean = false): Promise<AztecIndexedDBStore> {
    log.debug(`Opening IndexedDB database with name ${name}`);
    const request = window.indexedDB.open(name ?? 'tmp', 1);

    const rootDB = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = event => {
        const db = (event.target as any).result as IDBDatabase;

        const objectStore = db.createObjectStore('data', { keyPath: 'slot' });

        objectStore.createIndex('key', 'key', { unique: false, multiEntry: true });
        objectStore.createIndex('keyCount', 'keyCount', { unique: false });

        objectStore.transaction.oncomplete = _ => {
          log.debug('IndexedDB database created');
        };
      };
      request.onsuccess = _ => {
        resolve(request.result);
      };
      request.onerror = _ => {
        log.error('IndexedDB request failed', request.error);
        reject(request.error);
      };
    });

    const kvStore = new AztecIndexedDBStore(rootDB, ephemeral, log, name);
    return kvStore;
  }

  /**
   * Forks the current DB into a new DB by backing it up to a temporary location and opening a new jungleDB db.
   * @returns A new AztecIndexedDBStore.
   */
  async fork(): Promise<AztecKVStore> {
    throw new Error('Method not implemented');
    // const baseDir = this.path ? dirname(this.path) : tmpdir();
    // this.#log.debug(`Forking store with basedir ${baseDir}`);
    // const forkPath =
    //   (await mkdtemp(join(baseDir, 'aztec-store-fork-'))) + (this.isEphemeral || !this.path ? '/data.mdb' : '');
    // this.#log.verbose(`Forking store to ${forkPath}`);

    // const forkedRootDb = new JDB.IndexedDB(forkPath ?? 'tmp', 1);
    // const data = this.isEphemeral ? JDB.IndexedDB.createVolatileObjectStore() : forkedRootDb.createObjectStore('data');
    // const kvStore = new AztecIndexedDBStore(data, this.isEphemeral, forkPath);
    // await forkedRootDb.connect();
    // // Copy old data to new store
    // const tx = data.transaction();
    // await this.#data.valueStream((value: any, key: any) => {
    //   tx.putSync(key, value);
    //   return true;
    // });
    // await tx.commit();

    // this.#log.debug(`Forked store at ${forkPath} opened successfully`);
    // return kvStore;
  }

  /**
   * Creates a new AztecMap in the store.
   * @param name - Name of the map
   * @returns A new AztecMap
   */
  openMap<K extends Key, V>(name: string): AztecMap<K, V> {
    return new IndexedDBAztecMap(this.#rootDB, name);
  }

  /**
   * Creates a new AztecSet in the store.
   * @param name - Name of the set
   * @returns A new AztecSet
   */
  openSet<K extends Key>(name: string): AztecSet<K> {
    return new IndexedDBAztecSet(this.#rootDB, name);
  }

  /**
   * Creates a new AztecMultiMap in the store. A multi-map stores multiple values for a single key automatically.
   * @param name - Name of the map
   * @returns A new AztecMultiMap
   */
  openMultiMap<K extends Key, V>(name: string): AztecMultiMap<K, V> {
    return new IndexedDBAztecMap(this.#rootDB, name);
  }

  openCounter<K extends Key | Array<string | number>>(name: string): AztecCounter<K> {
    throw new Error('Method not implemented.');
  }

  /**
   * Creates a new AztecArray in the store.
   * @param name - Name of the array
   * @returns A new AztecArray
   */
  openArray<T>(name: string): AztecArray<T> {
    throw new Error('Method not implemented.');
  }

  /**
   * Creates a new AztecSingleton in the store.
   * @param name - Name of the singleton
   * @returns A new AztecSingleton
   */
  openSingleton<T>(name: string): AztecSingleton<T> {
    throw new Error('Method not implemented.');
  }

  /**
   * Runs a callback in a transaction.
   * @param callback - Function to execute in a transaction
   * @returns A promise that resolves to the return value of the callback
   */
  async transaction<T>(callback: () => T): Promise<T> {
    for (const container of this.#containers) {
      container.db = this.#rootDB.transaction('data', 'readwrite').objectStore('data');
    }
    const result = await callback();
    for (const container of this.#containers) {
      container.db = undefined;
    }
    return result;
  }

  /**
   * Clears all entries in the store & sub DBs.
   */
  async clear() {
    await promisifyRequest(this.#data.clear());
  }

  /** Deletes this store and removes the database */
  async delete() {
    this.#rootDB.deleteObjectStore(this.#name);
  }

  estimateSize(): { mappingSize: number; actualSize: number; numItems: number } {
    throw new Error('Method not implemented.');
  }
}
