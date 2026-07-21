import { Encoder } from '#msgpackr';
import { toBufferKey } from '#ordered-binary';
import { hash } from 'ohash';

import type { AztecAsyncArray } from '../interfaces/array.js';
import type { Value } from '../interfaces/common.js';
import type { AztecSQLiteOPFSStore } from './store.js';

/**
 * Persistent array backed by SQLite. Entries share a common `key` (the array name)
 * and are ordered by `key_count`, which doubles as the 1-indexed slot number.
 */
export class SQLiteOPFSAztecArray<T extends Value> implements AztecAsyncArray<T> {
  readonly #name: string;
  readonly #container: string;
  readonly #encoder = new Encoder();

  constructor(
    private readonly store: AztecSQLiteOPFSStore,
    name: string,
  ) {
    this.#name = name;
    this.#container = `array:${name}`;
  }

  async lengthAsync(): Promise<number> {
    const rows = await this.store.allAsync('SELECT COUNT(*) FROM data WHERE container = ? AND key = ?', [
      this.#container,
      this.#encodedKey(),
    ]);
    return Number(rows[0]?.[0] ?? 0);
  }

  async push(...vals: T[]): Promise<number> {
    if (vals.length === 0) {
      return this.lengthAsync();
    }
    return await this.store.transactionAsync(async () => {
      let length = await this.lengthAsync();
      for (const val of vals) {
        await this.store.runAsync(
          `INSERT INTO data (slot, container, key, key_count, hash, value)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [this.#slot(length), this.#container, this.#encodedKey(), length + 1, hash(val), this.#encoder.pack(val)],
        );
        length += 1;
      }
      return length;
    });
  }

  async pop(): Promise<T | undefined> {
    return await this.store.transactionAsync(async () => {
      const length = await this.lengthAsync();
      if (length === 0) {
        return undefined;
      }
      const slot = this.#slot(length - 1);
      const rows = await this.store.allAsync('SELECT value FROM data WHERE slot = ? LIMIT 1', [slot]);
      await this.store.runAsync('DELETE FROM data WHERE slot = ?', [slot]);
      const raw = rows[0]?.[0];
      return raw instanceof Uint8Array ? (this.#encoder.unpack(raw) as T) : undefined;
    });
  }

  async atAsync(index: number): Promise<T | undefined> {
    const length = await this.lengthAsync();
    const resolved = index < 0 ? length + index : index;
    if (resolved < 0 || resolved >= length) {
      return undefined;
    }
    const rows = await this.store.allAsync('SELECT value FROM data WHERE slot = ? LIMIT 1', [this.#slot(resolved)]);
    const raw = rows[0]?.[0];
    return raw instanceof Uint8Array ? (this.#encoder.unpack(raw) as T) : undefined;
  }

  async setAt(index: number, val: T): Promise<boolean> {
    return await this.store.transactionAsync(async () => {
      const length = await this.lengthAsync();
      const resolved = index < 0 ? length + index : index;
      if (resolved < 0 || resolved >= length) {
        return false;
      }
      await this.store.runAsync(
        `INSERT OR REPLACE INTO data (slot, container, key, key_count, hash, value)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [this.#slot(resolved), this.#container, this.#encodedKey(), resolved + 1, hash(val), this.#encoder.pack(val)],
      );
      return true;
    });
  }

  async *entriesAsync(): AsyncIterableIterator<[number, T]> {
    const rows = await this.store.allAsync(
      'SELECT key_count, value FROM data WHERE container = ? AND key = ? ORDER BY key_count ASC',
      [this.#container, this.#encodedKey()],
    );
    for (const row of rows) {
      const keyCount = Number(row[0]);
      const raw = row[1];
      if (raw instanceof Uint8Array) {
        yield [keyCount - 1, this.#encoder.unpack(raw) as T];
      }
    }
  }

  async *valuesAsync(): AsyncIterableIterator<T> {
    for await (const [, val] of this.entriesAsync()) {
      yield val;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this.valuesAsync();
  }

  #encodedKey(): Buffer {
    return toBufferKey([this.#name]);
  }

  #slot(index: number): string {
    return `array:${this.#name}:slot:${index}`;
  }
}
