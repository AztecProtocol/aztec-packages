import { Encoder } from '#msgpackr';
import { toBufferKey } from '#ordered-binary';
import { hash } from 'ohash';

import type { Value } from '../interfaces/common.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { AztecSQLiteOPFSStore } from './store.js';

/** Stores a single value identified by `name`. */
export class SQLiteOPFSAztecSingleton<T extends Value> implements AztecAsyncSingleton<T> {
  readonly #container: string;
  readonly #slot: string;
  readonly #encoder = new Encoder();

  constructor(
    private readonly store: AztecSQLiteOPFSStore,
    name: string,
  ) {
    this.#container = `singleton:${name}`;
    this.#slot = `singleton:${name}:value`;
  }

  async getAsync(): Promise<T | undefined> {
    const rows = await this.store.allAsync('SELECT value FROM data WHERE slot = ? LIMIT 1', [this.#slot]);
    if (rows.length === 0) {
      return undefined;
    }
    const raw = rows[0][0];
    if (raw instanceof Uint8Array) {
      return this.#encoder.unpack(raw) as T;
    }
    return undefined;
  }

  async set(val: T): Promise<boolean> {
    const { changes } = await this.store.runAsync(
      `INSERT OR REPLACE INTO data (slot, container, key, key_count, hash, value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [this.#slot, this.#container, toBufferKey([this.#slot]), 1, hash(val), this.#encoder.pack(val)],
    );
    return changes > 0;
  }

  async delete(): Promise<boolean> {
    await this.store.runAsync('DELETE FROM data WHERE slot = ?', [this.#slot]);
    return true;
  }
}
