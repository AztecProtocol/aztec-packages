import JDB from '@nimiq/jungle-db';

import { type AztecArray } from '../interfaces/array.js';
import { IndexedDBAztecSingleton } from './singleton.js';

/**
 * An persistent array backed by IndexedDB.
 */
export class IndexedDBAztecArray<T> implements AztecArray<T> {
  #db: any;
  #name: string;
  #length: IndexedDBAztecSingleton<number>;

  constructor(db: any, arrName: string) {
    this.#name = arrName;
    this.#length = new IndexedDBAztecSingleton(db, `${arrName}:meta:length`);
    this.#db = db;
  }

  get length(): number {
    return this.#length.get() ?? 0;
  }

  async push(...vals: T[]): Promise<number> {
    if (!this.#db.index(this.#indexName())) {
      this.#db.createIndex(this.#indexName(), 'index', { multiEntry: true, keyEncoding: JDB.NUMBER_ENCODING });
    }

    const tx = this.#db.transaction();
    let length = this.length;

    for (const val of vals) {
      await tx.put(this.#slot(length), { value: val, index: length });
      length += 1;
    }

    if (!(await tx.commit())) {
      throw new Error('Could not commit push tx');
    }

    await this.#length.set(length);

    return length;
  }

  async pop(): Promise<T | undefined> {
    const length = this.length;
    if (length === 0) {
      return undefined;
    }

    const tx = this.#db.transaction();

    const slot = this.#slot(length - 1);
    const { value: val } = await tx.get(slot);

    await tx.remove(slot);

    if (!(await tx.commit())) {
      throw new Error('Could not commit pop tx');
    }

    await this.#length.set(length - 1);

    return val as T;
  }

  at(index: number): T | undefined {
    if (index < 0) {
      index = this.length + index;
    }

    // the Array API only accepts indexes in the range [-this.length, this.length)
    // so if after normalizing the index is still out of range, return undefined
    if (index < 0 || index >= this.length) {
      return undefined;
    }

    const { value } = this.#db.getSync(this.#slot(index));
    return value;
  }

  setAt(index: number, val: T): Promise<boolean> {
    if (index < 0) {
      index = this.length + index;
    }

    if (index < 0 || index >= this.length) {
      return Promise.resolve(false);
    }

    return this.#db.put(this.#slot(index), { value: val, index });
  }

  async *entries(): AsyncIterableIterator<[number, T]> {
    const values = await this.#db.values(JDB.Query.within(this.#indexName(), 0, this.length));
    for (const { value, index } of values) {
      yield [index, value];
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

  #indexName(): string {
    return `array:${this.#name}:index`;
  }

  #slot(index: number): string {
    return `array:${this.#name}:slot:${index}`;
  }
}
