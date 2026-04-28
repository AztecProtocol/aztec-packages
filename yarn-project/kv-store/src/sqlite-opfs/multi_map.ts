import { hash } from 'ohash';

import type { Key, Value } from '../interfaces/common.js';
import type { AztecAsyncMultiMap } from '../interfaces/multi_map.js';
import { SQLiteOPFSAztecMap } from './map.js';

/**
 * Multi-map backed by SQLite. Extends the base map with always-incrementing
 * `key_count` per-key so the same slot is never reused across deletions — this
 * matches the IndexedDB backend's sparse-multi-map semantics.
 */
export class SQLiteOPFSAztecMultiMap<K extends Key, V extends Value>
  extends SQLiteOPFSAztecMap<K, V>
  implements AztecAsyncMultiMap<K, V>
{
  override async set(key: K, val: V): Promise<void> {
    const valueHash = hash(val);
    await this.store.transactionAsync(async () => {
      const exists = await this.store.allAsync(
        'SELECT 1 FROM data WHERE container = ? AND key = ? AND hash = ? LIMIT 1',
        [this.container, this.encodedKey(key), valueHash],
      );
      if (exists.length > 0) {
        return;
      }
      const maxRow = await this.store.allAsync('SELECT MAX(key_count) FROM data WHERE container = ? AND key = ?', [
        this.container,
        this.encodedKey(key),
      ]);
      const count = Number(maxRow[0]?.[0] ?? 0);
      await this.store.runAsync(
        `INSERT INTO data (slot, container, key, key_count, hash, value)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [this.slot(key, count), this.container, this.encodedKey(key), count + 1, valueHash, this.encoder.pack(val)],
      );
    });
  }

  async *getValuesAsync(key: K): AsyncIterableIterator<V> {
    const rows = await this.store.allAsync(
      'SELECT value FROM data WHERE container = ? AND key = ? ORDER BY key_count ASC',
      [this.container, this.encodedKey(key)],
    );
    for (const row of rows) {
      const raw = row[0];
      if (raw instanceof Uint8Array) {
        yield this.decodeValue(raw);
      }
    }
  }

  async getValueCountAsync(key: K): Promise<number> {
    const rows = await this.store.allAsync('SELECT COUNT(*) FROM data WHERE container = ? AND key = ?', [
      this.container,
      this.encodedKey(key),
    ]);
    return Number(rows[0]?.[0] ?? 0);
  }

  async deleteValue(key: K, val: V): Promise<void> {
    await this.store.runAsync('DELETE FROM data WHERE container = ? AND key = ? AND hash = ?', [
      this.container,
      this.encodedKey(key),
      hash(val),
    ]);
  }

  override async delete(key: K): Promise<void> {
    await this.store.runAsync('DELETE FROM data WHERE container = ? AND key = ?', [
      this.container,
      this.encodedKey(key),
    ]);
  }
}
