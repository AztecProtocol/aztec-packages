import { type Database, type Key } from 'lmdb';

import { type AztecArray } from '../interfaces/array.js';
import { LmdbAztecSingleton } from './singleton.js';

/** The shape of a key that stores a value in an array */
type ArrayIndexSlot = ['array', string, 'slot', number];

/**
 * An persistent array backed by LMDB.
 */
export class LmdbAztecArray<T> implements AztecArray<T> {
  #db: Database<T, ArrayIndexSlot>;
  #name: string;
  #length: LmdbAztecSingleton<number>;

  constructor(db: Database<unknown, Key>, arrName: string) {
    this.#name = arrName;
    this.#length = new LmdbAztecSingleton(db, `${arrName}:meta:length`);
    this.#db = db as Database<T, ArrayIndexSlot>;
  }

  async length(): Promise<number> {
    return (await this.#length.get()) ?? 0;
  }

  async push(...vals: T[]): Promise<number> {
    let length = await this.length();
    for (const val of vals) {
      await this.#db.put(this.#slot(length), val);
      length += 1;
    }

    await this.#length.set(length);

    return length;
  }

  async pop(): Promise<T | undefined> {
    const length = await this.length();
    if (length === 0) {
      return undefined;
    }

    const slot = this.#slot(length - 1);
    const val = this.#db.get(slot) as T;

    await this.#db.remove(slot);
    await this.#length.set(length - 1);

    return val;
  }

  async at(index: number): Promise<T | undefined> {
    const length = await this.length();
    if (index < 0) {
      index = length + index;
    }

    // the Array API only accepts indexes in the range [-this.length, this.length)
    // so if after normalizing the index is still out of range, return undefined
    if (index < 0 || index >= length) {
      return undefined;
    }

    return this.#db.get(this.#slot(index));
  }

  async setAt(index: number, val: T): Promise<boolean> {
    const length = await this.length();

    if (index < 0) {
      index = length + index;
    }

    if (index < 0 || index >= length) {
      return Promise.resolve(false);
    }

    return this.#db.put(this.#slot(index), val);
  }

  async *entries(): AsyncIterableIterator<[number, T]> {
    const length = await this.length();
    const values = this.#db.getRange({
      start: this.#slot(0),
      limit: length,
    });

    for (const { key, value } of values) {
      const index = key[3];
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

  #slot(index: number): ArrayIndexSlot {
    return ['array', this.#name, 'slot', index];
  }
}
