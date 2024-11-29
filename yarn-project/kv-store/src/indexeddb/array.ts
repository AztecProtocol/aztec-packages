import JDB from '@nimiq/jungle-db';
import { IDBPDatabase, IDBPObjectStore } from 'idb';

import { type AztecArray } from '../interfaces/array.js';
import { IndexedDBAztecSingleton } from './singleton.js';
import { AztecIDBSchema } from './store.js';

/**
 * An persistent array backed by IndexedDB.
 */
export class IndexedDBAztecArray<T> implements AztecArray<T> {
  #_db?: IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'>;
  #rootDB: IDBPDatabase<AztecIDBSchema>;
  #container: string;
  #name: string;

  constructor(rootDB: IDBPDatabase<AztecIDBSchema>, name: string) {
    this.#rootDB = rootDB;
    this.#name = name;
    this.#container = `array:${this.#name}`;
  }

  set db(db: IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'> | undefined) {
    this.#_db = db;
  }

  get db(): IDBPObjectStore<AztecIDBSchema, ['data'], 'data', 'readwrite'> {
    return this.#_db ? this.#_db : this.#rootDB.transaction('data', 'readwrite').store;
  }

  async length(): Promise<number> {
    return (
      (await this.db
        .index('key')
        .count(IDBKeyRange.bound([this.#container, this.#name], [this.#container, this.#name]))) ?? 0
    );
  }

  async push(...vals: T[]): Promise<number> {
    let length = await this.length();
    for (const val of vals) {
      await this.db.put({
        value: val,
        container: this.#container,
        key: this.#name,
        keyCount: length + 1,
        slot: this.#slot(length),
      });
      length += 1;
    }
    return length;
  }

  async pop(): Promise<T | undefined> {
    const length = await this.length();
    if (length === 0) {
      return undefined;
    }

    const slot = this.#slot(length - 1);
    const data = await this.db.get(slot);
    await this.db.delete(slot);

    return data?.value;
  }

  async at(index: number): Promise<T | undefined> {
    const length = await this.length();

    if (index < 0) {
      index = length + index;
    }

    const data = await this.db.get(this.#slot(index));
    return data?.value;
  }

  async setAt(index: number, val: T): Promise<boolean> {
    const length = await this.length();

    if (index < 0) {
      index = length + index;
    }

    if (index < 0 || index >= length) {
      return Promise.resolve(false);
    }

    await this.db.put({
      value: val,
      container: this.#container,
      key: this.#name,
      keyCount: index + 1,
      slot: this.#slot(index),
    });
    return true;
  }

  async *entries(): AsyncIterableIterator<[number, T]> {
    const index = this.db.index('key');
    const rangeQuery = IDBKeyRange.bound([this.#container, this.#name], [this.#container, this.#name]);
    for await (const cursor of index.iterate(rangeQuery)) {
      yield [cursor.value.keyCount - 1, cursor.value.value] as [number, T];
    }
  }

  async *values(): AsyncIterableIterator<T> {
    for await (const [_, value] of this.entries()) {
      yield value;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this.values();
  }

  #slot(index: number): string {
    return `array:${this.#name}:slot:${index}`;
  }
}
