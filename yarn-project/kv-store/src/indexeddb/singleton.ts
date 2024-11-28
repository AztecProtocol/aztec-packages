import { type AztecSingleton } from '../interfaces/singleton.js';
import { promisifyRequest } from './utils.js';

/**
 * Stores a single value in IndexedDB.
 */
export class IndexedDBAztecSingleton<T> implements AztecSingleton<T> {
  #_db!: IDBObjectStore;
  #rootDB: IDBDatabase;
  #slot: string;

  constructor(rootDB: IDBDatabase, name: string) {
    this.#rootDB = rootDB;
    this.#slot = `singleton:${name}:value`;
  }

  set db(db: IDBObjectStore) {
    this.#_db = db;
  }

  get db(): IDBObjectStore {
    return this.#_db ? this.#_db : this.#rootDB.transaction('data', 'readwrite').objectStore('data');
  }

  async get(): Promise<T | undefined> {
    return await promisifyRequest(this.db.get(this.#slot));
  }

  async set(val: T): Promise<boolean> {
    const result = await promisifyRequest(this.db.add({ slot: this.#slot, value: val }));
    return result !== undefined;
  }

  async delete(): Promise<boolean> {
    await promisifyRequest(this.db.delete(this.#slot));
    return true;
  }
}
