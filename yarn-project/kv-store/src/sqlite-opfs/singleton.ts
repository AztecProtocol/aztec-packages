import { Buffer } from 'buffer';
import { Encoder } from 'msgpackr';
import { toBufferKey } from 'ordered-binary';

import type { Value } from '../interfaces/common.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { AztecSQLiteOPFSStore } from './store.js';

const textEncoder = new TextEncoder();

/** Stores a single value identified by `name`. Values flow through the store's
 *  cipher — a real cipher encrypts the value blob; `IdentityCipher` is a passthrough. */
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
    if (!(raw instanceof Uint8Array)) {
      return undefined;
    }
    const plaintext = await this.store.cipher.decrypt(raw, textEncoder.encode(this.#slot));
    const unpacked = this.#encoder.unpack(plaintext);
    if (unpacked instanceof Uint8Array && !Buffer.isBuffer(unpacked)) {
      return Buffer.from(unpacked) as T;
    }
    return unpacked as T;
  }

  async set(val: T): Promise<boolean> {
    const packed = this.#encoder.pack(val);
    const [cipherValue, digest] = await Promise.all([
      this.store.cipher.encrypt(packed, textEncoder.encode(this.#slot)),
      this.store.cipher.digest(packed),
    ]);
    const { changes } = await this.store.runAsync(
      `INSERT OR REPLACE INTO data (slot, container, key, key_count, hash, value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [this.#slot, this.#container, toBufferKey([this.#slot]), 1, digest, cipherValue],
    );
    return changes > 0;
  }

  async delete(): Promise<boolean> {
    await this.store.runAsync('DELETE FROM data WHERE slot = ?', [this.#slot]);
    return true;
  }
}
