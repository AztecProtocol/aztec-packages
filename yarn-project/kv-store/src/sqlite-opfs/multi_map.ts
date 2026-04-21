import type { Key, Value } from '../interfaces/common.js';
import type { AztecAsyncMultiMap } from '../interfaces/multi_map.js';
import { SQLiteOPFSAztecMap, type SQLiteOPFSMapOptions } from './map.js';
import type { AztecSQLiteOPFSStore } from './store.js';

const textEncoder = new TextEncoder();

/**
 * Multi-map backed by SQLite. Extends the base map with always-incrementing
 * `key_count` per-key so the same slot is never reused across deletions — this
 * matches the IndexedDB backend's sparse-multi-map semantics.
 */
export class SQLiteOPFSAztecMultiMap<K extends Key, V extends Value>
  extends SQLiteOPFSAztecMap<K, V>
  implements AztecAsyncMultiMap<K, V>
{
  constructor(store: AztecSQLiteOPFSStore, name: string, options: SQLiteOPFSMapOptions = {}) {
    super(store, name, options);
  }

  override async set(key: K, val: V): Promise<void> {
    const packed = this.packForStorage(key, val);
    const valueHash = await this.store.cipher.digest(packed);
    await this.store.transactionAsync(async () => {
      const { encodedKey } = await this.keyMaterial(key);
      const exists = await this.store.allAsync(
        'SELECT 1 FROM data WHERE container = ? AND key = ? AND hash = ? LIMIT 1',
        [this.container, encodedKey, valueHash],
      );
      if (exists.length > 0) {
        return;
      }
      const maxRow = await this.store.allAsync('SELECT MAX(key_count) FROM data WHERE container = ? AND key = ?', [
        this.container,
        encodedKey,
      ]);
      const count = Number(maxRow[0]?.[0] ?? 0);
      const { slot } = await this.keyMaterial(key, count);
      const cipherValue = await this.store.cipher.encrypt(packed, textEncoder.encode(slot));
      await this.store.runAsync(
        `INSERT INTO data (slot, container, key, key_count, hash, value)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [slot, this.container, encodedKey, count + 1, valueHash, cipherValue],
      );
    });
  }

  async *getValuesAsync(key: K): AsyncIterableIterator<V> {
    const { encodedKey } = await this.keyMaterial(key);
    const rows = await this.store.allAsync(
      'SELECT slot, value FROM data WHERE container = ? AND key = ? ORDER BY key_count ASC',
      [this.container, encodedKey],
    );
    for (const row of rows) {
      const slot = row[0];
      const raw = row[1];
      if (typeof slot === 'string' && raw instanceof Uint8Array) {
        yield await this.decodeValue(raw, slot);
      }
    }
  }

  async getValueCountAsync(key: K): Promise<number> {
    const { encodedKey } = await this.keyMaterial(key);
    const rows = await this.store.allAsync('SELECT COUNT(*) FROM data WHERE container = ? AND key = ?', [
      this.container,
      encodedKey,
    ]);
    return Number(rows[0]?.[0] ?? 0);
  }

  async deleteValue(key: K, val: V): Promise<void> {
    const packed = this.packForStorage(key, val);
    const valueHash = await this.store.cipher.digest(packed);
    const { encodedKey } = await this.keyMaterial(key);
    await this.store.runAsync('DELETE FROM data WHERE container = ? AND key = ? AND hash = ?', [
      this.container,
      encodedKey,
      valueHash,
    ]);
  }

  override async delete(key: K): Promise<void> {
    const { encodedKey } = await this.keyMaterial(key);
    await this.store.runAsync('DELETE FROM data WHERE container = ? AND key = ?', [this.container, encodedKey]);
  }
}
