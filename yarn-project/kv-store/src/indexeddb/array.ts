import JDB from '@nimiq/jungle-db';

import { type AztecArray } from '../interfaces/array.js';
import { IndexedDBAztecSingleton } from './singleton.js';

/**
 * An persistent array backed by IndexedDB.
 */
export class IndexedDBAztecArray<T> implements AztecArray<T> {
  #_db!: IDBObjectStore;
  #rootDB: IDBDatabase;
  #name: string;
  #length: IndexedDBAztecSingleton<number>;

  constructor(rootDB: IDBDatabase, arrName: string) {
    this.#name = arrName;
    this.#length = new IndexedDBAztecSingleton(rootDB, `${arrName}:meta:length`);
    this.#rootDB = rootDB;
  }

  set db(db: IDBObjectStore) {
    this.#_db = db;
    this.#length.db = db;
  }

  get db(): IDBObjectStore {
    return this.#_db ? this.#_db : this.#rootDB.transaction('data', 'readwrite').objectStore('data');
  }

  async length(): Promise<number> {
    throw new Error('Not implemented');
  }

  async push(...vals: T[]): Promise<number> {
    throw new Error('Not implemented');
  }

  async pop(): Promise<T | undefined> {
    throw new Error('Not implemented');
  }

  at(index: number): Promise<T | undefined> {
    throw new Error('Not implemented');
  }

  setAt(index: number, val: T): Promise<boolean> {
    throw new Error('Not implemented');
  }

  async *entries(): AsyncIterableIterator<[number, T]> {
    throw new Error('Not implemented');
  }

  async *values(): AsyncIterableIterator<T> {
    for await (const [_, value] of this.entries()) {
      yield value;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this.values();
  }

  #indexName(): string {
    return `array:${this.#name}:index`;
  }

  #slot(index: number): string {
    return `array:${this.#name}:slot:${index}`;
  }
}
