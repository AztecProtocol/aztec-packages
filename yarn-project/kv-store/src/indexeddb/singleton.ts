import type { IDBPDatabase, IDBPObjectStore } from 'idb';
import { hash } from 'ohash';

import type { Value } from '../interfaces/common.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { AztecIDBSchema } from './store.js';

/**
 * Stores a single value in IndexedDB.
 */
export class IndexedDBAztecSingleton<T extends Value> implements AztecAsyncSingleton<T> {
  #_db?: IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'>;
  #rootDB: IDBPDatabase<AztecIDBSchema>;
  #container: string;
  #slot: string;

  constructor(rootDB: IDBPDatabase<AztecIDBSchema>, name: string) {
    this.#rootDB = rootDB;
    this.#container = `singleton:${name}`;
    this.#slot = `singleton:${name}:value`;
  }

  set db(db: IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'> | undefined) {
    this.#_db = db;
  }

  get db(): IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'> {
    return this.#_db ? this.#_db : this.#rootDB.transaction('data', 'readwrite').store;
  }

  async getAsync(): Promise<T | undefined> {
    const data = await this.db.get(this.#slot);
    return data?.value as T;
  }

  async set(val: T): Promise<boolean> {
    const result = await this.db.put({
      container: this.#container,
      slot: this.#slot,
      key: this.#slot,
      keyCount: 1,
      value: val,
      hash: hash(val),
    });
    return result !== undefined;
  }

  async delete(): Promise<boolean> {
    await this.db.delete(this.#slot);
    return true;
  }
}
