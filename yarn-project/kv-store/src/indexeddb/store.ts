import { createDebugLogger } from '@aztec/foundation/log';

import JDB from '@nimiq/jungle-db';
import { mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { AztecArray } from '../interfaces/array.js';
import { Key } from '../interfaces/common.js';
import { AztecCounter } from '../interfaces/counter.js';
import { AztecMap, AztecMultiMap } from '../interfaces/map.js';
import { AztecSet } from '../interfaces/set.js';
import { AztecSingleton } from '../interfaces/singleton.js';
import { type AztecKVStore } from '../interfaces/store.js';
import { IndexedDBAztecArray } from './array.js';
import { IndexedDBAztecMap } from './map.js';
import { IndexedDBAztecSet } from './set.js';
import { IndexedDBAztecSingleton } from './singleton.js';

const { mkdtemp, rm } = fs;

/**
 * A key-value store backed by LMDB.
 */
export class AztecIndexedDBStore implements AztecKVStore {
  #log = createDebugLogger('aztec:kv-store:indexeddb');
  #rootDb: any;
  #data: any;

  constructor(public data: any, public readonly isEphemeral: boolean, private path?: string) {
    this.#data = data;
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
  static async open(
    path?: string,
    ephemeral: boolean = false,
    log = createDebugLogger('aztec:kv-store:indexeddb'),
  ): Promise<AztecIndexedDBStore> {
    if (path) {
      mkdirSync(path, { recursive: true });
    }
    log.debug(`Opening IndexedDB database at ${path || 'temporary location'}`);
    const rootDb = new JDB.IndexedDB(path ?? 'tmp', 1);
    const data = ephemeral ? JDB.IndexedDB.createVolatileObjectStore() : rootDb.createObjectStore('data');
    const kvStore = new AztecIndexedDBStore(data, ephemeral, path);
    await rootDb.connect();
    return kvStore;
  }

  /**
   * Forks the current DB into a new DB by backing it up to a temporary location and opening a new jungleDB db.
   * @returns A new AztecLmdbStore.
   */
  async fork() {
    const baseDir = this.path ? dirname(this.path) : tmpdir();
    this.#log.debug(`Forking store with basedir ${baseDir}`);
    const forkPath =
      (await mkdtemp(join(baseDir, 'aztec-store-fork-'))) + (this.isEphemeral || !this.path ? '/data.mdb' : '');
    this.#log.verbose(`Forking store to ${forkPath}`);

    const forkedRootDb = new JDB.IndexedDB(forkPath ?? 'tmp', 1);
    const data = this.isEphemeral ? JDB.IndexedDB.createVolatileObjectStore() : forkedRootDb.createObjectStore('data');
    const kvStore = new AztecIndexedDBStore(data, this.isEphemeral, forkPath);
    await forkedRootDb.connect();
    // Copy old data to new store
    const tx = data.transaction();
    await this.#data.valueStream((value: any, key: any) => {
      tx.putSync(key, value);
      return true;
    });
    await tx.commit();

    this.#log.debug(`Forked store at ${forkPath} opened successfully`);
    return kvStore;
  }

  /**
   * Creates a new AztecMap in the store.
   * @param name - Name of the map
   * @returns A new AztecMap
   */
  openMap<K extends Key, V>(name: string): AztecMap<K, V> {
    return new IndexedDBAztecMap(this.#data, name);
  }

  /**
   * Creates a new AztecSet in the store.
   * @param name - Name of the set
   * @returns A new AztecSet
   */
  openSet<K extends Key>(name: string): AztecSet<K> {
    return new IndexedDBAztecSet(this.#data, name);
  }

  /**
   * Creates a new AztecMultiMap in the store. A multi-map stores multiple values for a single key automatically.
   * @param name - Name of the map
   * @returns A new AztecMultiMap
   */
  openMultiMap<K extends Key, V>(name: string): AztecMultiMap<K, V> {
    return new IndexedDBAztecMap(this.#data, name);
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
    return new IndexedDBAztecArray(this.#data, name);
  }

  /**
   * Creates a new AztecSingleton in the store.
   * @param name - Name of the singleton
   * @returns A new AztecSingleton
   */
  openSingleton<T>(name: string): AztecSingleton<T> {
    return new IndexedDBAztecSingleton(this.#data, name);
  }

  /**
   * Runs a callback in a transaction.
   * @param callback - Function to execute in a transaction
   * @returns A promise that resolves to the return value of the callback
   */
  transaction<T>(callback: () => T): Promise<T> {
    throw new Error('Method not implemented.');
  }

  /**
   * Clears all entries in the store & sub DBs.
   */
  async clear() {
    await this.#data.truncate();
  }

  /**
   * Drops the database & sub DBs.
   */
  async drop() {
    await this.#rootDb.destroy();
  }

  /**
   * Close the database. Note, once this is closed we can no longer interact with the DB.
   */
  async close() {
    await this.#data.close();
    await this.#rootDb.close();
  }

  /** Deletes this store and removes the database files from disk */
  async delete() {
    await this.drop();
    await this.close();
    if (this.path) {
      await rm(this.path, { recursive: true, force: true });
      this.#log.verbose(`Deleted database files at ${this.path}`);
    }
  }

  estimateSize(): { mappingSize: number; actualSize: number; numItems: number } {
    throw new Error('Method not implemented.');
  }
}
