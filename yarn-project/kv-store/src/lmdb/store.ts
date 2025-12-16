import { randomBytes } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';

import { promises as fs, mkdirSync } from 'fs';
import { type Database, type RootDatabase, open } from 'lmdb';
import { tmpdir } from 'os';
import { join } from 'path';

import type { AztecArray, AztecAsyncArray } from '../interfaces/array.js';
import type { Key, StoreSize, Value } from '../interfaces/common.js';
import type { AztecAsyncCounter, AztecCounter } from '../interfaces/counter.js';
import type { AztecAsyncMap, AztecMap } from '../interfaces/map.js';
import type { AztecAsyncMultiMap, AztecMultiMap } from '../interfaces/multi_map.js';
import type { AztecAsyncSet, AztecSet } from '../interfaces/set.js';
import type { AztecAsyncSingleton, AztecSingleton } from '../interfaces/singleton.js';
import type { AztecAsyncKVStore, AztecKVStore } from '../interfaces/store.js';
import { LmdbAztecArray } from './array.js';
import { LmdbAztecCounter } from './counter.js';
import { LmdbAztecMap } from './map.js';
import { LmdbAztecMultiMap } from './multi_map.js';
import { LmdbAztecSet } from './set.js';
import { LmdbAztecSingleton } from './singleton.js';

/**
 * A key-value store backed by LMDB.
 */
export class AztecLmdbStore implements AztecKVStore, AztecAsyncKVStore {
  syncGetters = true as const;

  #rootDb: RootDatabase;
  #data: Database<unknown, Key>;
  #multiMapData: Database<unknown, Key>;
  #log = createLogger('kv-store:lmdb');

  constructor(
    rootDb: RootDatabase,
    public readonly isEphemeral: boolean,
    private path: string,
  ) {
    this.#rootDb = rootDb;

    // big bucket to store all the data
    this.#data = rootDb.openDB('data', {
      encoding: 'msgpack',
      keyEncoding: 'ordered-binary',
    });

    this.#multiMapData = rootDb.openDB('data_dup_sort', {
      encoding: 'ordered-binary',
      keyEncoding: 'ordered-binary',
      dupSort: true,
    });
  }

  /**
   * Creates a new AztecKVStore backed by LMDB. The path to the database is optional. If not provided,
   * the database will be stored in a temporary location and be deleted when the process exists.
   *
   * The `rollupAddress` passed is checked against what is stored in the database. If they do not match,
   * the database is cleared before returning the store. This way data is not accidentally shared between
   * different rollup instances.
   *
   * @param path - A path on the disk to store the database. Optional
   * @param ephemeral - true if the store should only exist in memory and not automatically be flushed to disk. Optional
   * @param log - A logger to use. Optional
   * @returns The store
   */
  static open(
    path?: string,
    mapSizeKb = 1 * 1024 * 1024, // defaults to 1 GB map size
    ephemeral: boolean = false,
    log = createLogger('kv-store:lmdb'),
  ): AztecLmdbStore {
    const dbPath = path ?? join(tmpdir(), randomBytes(8).toString('hex'));
    mkdirSync(dbPath, { recursive: true });
    const mapSize = 1024 * mapSizeKb;
    log.debug(`Opening LMDB database at ${path || 'temporary location'} with map size ${mapSize}`);
    const rootDb = open({ path: dbPath, noSync: ephemeral, mapSize });
    return new AztecLmdbStore(rootDb, ephemeral, dbPath);
  }

  /**
   * Creates a new AztecMap in the store.
   * @param name - Name of the map
   * @returns A new AztecMap
   */
  openMap<K extends Key, V extends Value>(name: string): AztecMap<K, V> & AztecAsyncMap<K, V> {
    return new LmdbAztecMap(this.#data, name);
  }

  /**
   * Creates a new AztecSet in the store.
   * @param name - Name of the set
   * @returns A new AztecSet
   */
  openSet<K extends Key>(name: string): AztecSet<K> & AztecAsyncSet<K> {
    return new LmdbAztecSet(this.#data, name);
  }

  /**
   * Creates a new AztecMultiMap in the store. A multi-map stores multiple values for a single key automatically.
   * @param name - Name of the map
   * @returns A new AztecMultiMap
   */
  openMultiMap<K extends Key, V extends Value>(name: string): AztecMultiMap<K, V> & AztecAsyncMultiMap<K, V> {
    return new LmdbAztecMultiMap(this.#multiMapData, name);
  }

  openCounter<K extends Key>(name: string): AztecCounter<K> & AztecAsyncCounter<K> {
    return new LmdbAztecCounter(this.#data, name);
  }

  /**
   * Creates a new AztecArray in the store.
   * @param name - Name of the array
   * @returns A new AztecArray
   */
  openArray<T extends Value>(name: string): AztecArray<T> & AztecAsyncArray<T> {
    return new LmdbAztecArray(this.#data, name);
  }

  /**
   * Creates a new AztecSingleton in the store.
   * @param name - Name of the singleton
   * @returns A new AztecSingleton
   */
  openSingleton<T>(name: string): AztecSingleton<T> & AztecAsyncSingleton<T> {
    return new LmdbAztecSingleton(this.#data, name);
  }

  /**
   * Runs a callback in a transaction.
   * @param callback - Function to execute in a transaction
   * @returns A promise that resolves to the return value of the callback
   */
  transaction<T>(callback: () => T): Promise<T> {
    return this.#rootDb.transaction(callback);
  }

  /**
   * Runs a callback in a transaction.
   * @param callback - Function to execute in a transaction
   * @returns A promise that resolves to the return value of the callback
   */
  async transactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    return await this.#rootDb.transaction(callback);
  }

  /**
   * Clears all entries in the store & sub DBs.
   */
  async clear() {
    await this.#data.clearAsync();
    await this.#multiMapData.clearAsync();
    await this.#rootDb.clearAsync();
  }

  /**
   * Drops the database & sub DBs.
   */
  async drop() {
    await this.#data.drop();
    await this.#multiMapData.drop();
    await this.#rootDb.drop();
  }

  /**
   * Close the database. Note, once this is closed we can no longer interact with the DB.
   */
  async close() {
    await this.#data.close();
    await this.#multiMapData.close();
    await this.#rootDb.close();
  }

  /** Deletes this store and removes the database files from disk */
  async delete() {
    await this.drop();
    await this.close();
    if (this.path) {
      await fs.rm(this.path, { recursive: true, force: true, maxRetries: 3 });
      this.#log.verbose(`Deleted database files at ${this.path}`);
    }
  }

  estimateSize(): Promise<StoreSize> {
    const stats = this.#rootDb.getStats();
    // The 'mapSize' is the total amount of virtual address space allocated to the DB (effectively the maximum possible size)
    // http://www.lmdb.tech/doc/group__mdb.html#a4bde3c8b676457342cba2fe27aed5fbd
    let mapSize = 0;
    if ('mapSize' in stats && typeof stats.mapSize === 'number') {
      mapSize = stats.mapSize;
    }
    let physicalFileSize = 0;
    if ('physicalFileSize' in stats && typeof stats.physicalFileSize === 'number') {
      physicalFileSize = stats.physicalFileSize;
    }
    const dataResult = this.estimateSubDBSize(this.#data);
    const multiResult = this.estimateSubDBSize(this.#multiMapData);
    return Promise.resolve({
      mappingSize: mapSize,
      physicalFileSize: physicalFileSize,
      actualSize: dataResult.actualSize + multiResult.actualSize,
      numItems: dataResult.numItems + multiResult.numItems,
    });
  }

  private estimateSubDBSize(db: Database<unknown, Key>): { actualSize: number; numItems: number } {
    const stats = db.getStats();
    let actualSize = 0;
    let numItems = 0;
    // This is the total number of key/value pairs present in the DB
    if ('entryCount' in stats && typeof stats.entryCount === 'number') {
      numItems = stats.entryCount;
    }
    // The closest value we can get to the actual size of the database is the number of consumed pages * the page size
    if (
      'treeBranchPageCount' in stats &&
      typeof stats.treeBranchPageCount === 'number' &&
      'treeLeafPageCount' in stats &&
      typeof stats.treeLeafPageCount === 'number' &&
      'overflowPages' in stats &&
      typeof stats.overflowPages === 'number' &&
      'pageSize' in stats &&
      typeof stats.pageSize === 'number'
    ) {
      const branchPages = stats.treeBranchPageCount;
      const leafPages = stats.treeLeafPageCount;
      const overflowPages = stats.overflowPages;
      const pageSize = stats.pageSize;
      actualSize = (branchPages + leafPages + overflowPages) * pageSize;
    }
    return { actualSize, numItems };
  }

  backupTo(_dstPath: string, _compact?: boolean): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
