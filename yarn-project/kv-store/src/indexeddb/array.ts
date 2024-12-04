import { type IDBPDatabase, type IDBPObjectStore } from 'idb';

import { type AztecAsyncArray } from '../interfaces/array.js';
import { type AztecIDBSchema } from './store.js';

/**
 * A persistent array backed by IndexedDB.
 */
export class IndexedDBAztecArray<T> implements AztecAsyncArray<T> {
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

  async lengthAsync(): Promise<number> {
    return (
      (await this.db
        .index('key')
        .count(IDBKeyRange.bound([this.#container, this.#name], [this.#container, this.#name]))) ?? 0
    );
  }

  async push(...vals: T[]): Promise<number> {
    let length = await this.lengthAsync();
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
    const length = await this.lengthAsync();
    if (length === 0) {
      return undefined;
    }

    const slot = this.#slot(length - 1);
    const data = await this.db.get(slot);
    await this.db.delete(slot);

    return data?.value;
  }

  async atAsync(index: number): Promise<T | undefined> {
    const length = await this.lengthAsync();

    if (index < 0) {
      index = length + index;
    }

    const data = await this.db.get(this.#slot(index));
    return data?.value;
  }

  async setAt(index: number, val: T): Promise<boolean> {
    const length = await this.lengthAsync();

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

  async *entriesAsync(): AsyncIterableIterator<[number, T]> {
    const index = this.db.index('key');
    const rangeQuery = IDBKeyRange.bound([this.#container, this.#name], [this.#container, this.#name]);
    for await (const cursor of index.iterate(rangeQuery)) {
      yield [cursor.value.keyCount - 1, cursor.value.value] as [number, T];
    }
  }

  async *valuesAsync(): AsyncIterableIterator<T> {
    for await (const [_, value] of this.entriesAsync()) {
      yield value;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this.valuesAsync();
  }

  #slot(index: number): string {
    return `array:${this.#name}:slot:${index}`;
  }
}
