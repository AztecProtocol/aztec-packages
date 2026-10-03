import { Encoder } from '#msgpackr';
import { fromBufferKey, toBufferKey } from '#ordered-binary';
import { Buffer } from 'buffer';
import { hash } from 'ohash';

import type { Key, Range, Value } from '../interfaces/common.js';
import type { AztecAsyncMap, GetManyOptions } from '../interfaces/map.js';
import type { SqlValue } from './messages.js';
import type { AztecSQLiteOPFSStore } from './store.js';

/** A map backed by SQLite in OPFS. Mirrors `IndexedDBAztecMap`. */
export class SQLiteOPFSAztecMap<K extends Key, V extends Value> implements AztecAsyncMap<K, V> {
  protected readonly name: string;
  protected readonly container: string;
  protected readonly encoder = new Encoder();

  constructor(
    protected readonly store: AztecSQLiteOPFSStore,
    mapName: string,
  ) {
    this.name = mapName;
    this.container = `map:${mapName}`;
  }

  async getAsync(key: K): Promise<V | undefined> {
    const rows = await this.store.allAsync('SELECT value FROM data WHERE slot = ? LIMIT 1', [this.slot(key)]);
    if (rows.length === 0) {
      return undefined;
    }
    const raw = rows[0][0];
    return raw == null ? undefined : this.decodeValue(raw);
  }

  getManyAsync(keys: K[], _opts?: GetManyOptions): Promise<(V | undefined)[]> {
    return Promise.all(keys.map(key => this.getAsync(key)));
  }

  async hasAsync(key: K): Promise<boolean> {
    const rows = await this.store.allAsync('SELECT 1 FROM data WHERE slot = ? LIMIT 1', [this.slot(key)]);
    return rows.length > 0;
  }

  async sizeAsync(): Promise<number> {
    const rows = await this.store.allAsync('SELECT COUNT(*) FROM data WHERE container = ?', [this.container]);
    return Number(rows[0]?.[0] ?? 0);
  }

  async set(key: K, val: V): Promise<void> {
    await this.store.runAsync(
      `INSERT OR REPLACE INTO data (slot, container, key, key_count, hash, value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [this.slot(key), this.container, this.encodedKey(key), 1, hash(val), this.encoder.pack(val)],
    );
  }

  async setMany(entries: { key: K; value: V }[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    await this.store.transactionAsync(async () => {
      for (const { key, value } of entries) {
        await this.set(key, value);
      }
    });
  }

  swap(_key: K, _fn: (val: V | undefined) => V): Promise<void> {
    throw new Error('Not implemented');
  }

  async setIfNotExists(key: K, val: V): Promise<boolean> {
    return await this.store.transactionAsync(async () => {
      if (await this.hasAsync(key)) {
        return false;
      }
      await this.set(key, val);
      return true;
    });
  }

  async delete(key: K): Promise<void> {
    await this.store.runAsync('DELETE FROM data WHERE slot = ?', [this.slot(key)]);
  }

  async *entriesAsync(range: Range<K> = {}): AsyncIterableIterator<[K, V]> {
    const rows = await this.rangeQuery(range);
    for (const row of rows) {
      const [_slot, keyBlob, value] = row;
      if (keyBlob == null || value == null) {
        continue;
      }
      yield [this.decodeKey(keyBlob), this.decodeValue(value)];
    }
  }

  async *valuesAsync(range: Range<K> = {}): AsyncIterableIterator<V> {
    for await (const [, value] of this.entriesAsync(range)) {
      yield value;
    }
  }

  async *keysAsync(range: Range<K> = {}): AsyncIterableIterator<K> {
    for await (const [key] of this.entriesAsync(range)) {
      yield key;
    }
  }

  protected async rangeQuery(range: Range<K>): Promise<Array<[string, Uint8Array, Uint8Array | null]>> {
    // Inclusivity flips with direction to match the IndexedDB backend:
    //   forward: [start, end)     reverse: (start, end]
    // That asymmetry is load-bearing — tests pin the exact inclusivity at boundaries.
    const reverse = !!range.reverse;
    const parts: string[] = ['container = ?'];
    const bind: SqlValue[] = [this.container];
    if (range.start !== undefined) {
      parts.push(reverse ? 'key > ?' : 'key >= ?');
      bind.push(this.encodedKey(range.start));
    }
    if (range.end !== undefined) {
      parts.push(reverse ? 'key <= ?' : 'key < ?');
      bind.push(this.encodedKey(range.end));
    }
    const order = reverse ? 'DESC' : 'ASC';
    let sql = `SELECT slot, key, value FROM data WHERE ${parts.join(' AND ')} ORDER BY key ${order}, key_count ${order}`;
    if (range.limit !== undefined) {
      sql += ' LIMIT ?';
      bind.push(range.limit);
    }
    const rows = await this.store.allAsync(sql, bind);
    return rows.map(r => [String(r[0]), r[1] as Uint8Array, r[2] as Uint8Array | null]);
  }

  protected decodeValue(val: SqlValue): V {
    if (!(val instanceof Uint8Array)) {
      return val as V;
    }
    const unpacked = this.encoder.unpack(val);
    // msgpackr returns plain Uint8Array in browsers for packed Buffers. Callers that
    // stored Buffers (walletDB uses Buffer.from(...).toString('utf8') round-trips)
    // rely on Buffer-flavored behavior — re-wrap at the storage boundary, mirroring
    // IndexedDBAztecMap.restoreBuffers.
    if (unpacked instanceof Uint8Array && !Buffer.isBuffer(unpacked)) {
      return Buffer.from(unpacked) as V;
    }
    return unpacked as V;
  }

  protected decodeKey(raw: Uint8Array): K {
    const parsed = fromBufferKey(Buffer.from(raw));
    if (Array.isArray(parsed)) {
      return (parsed.length > 1 ? parsed : parsed[0]) as K;
    }
    return parsed as K;
  }

  protected encodedKey(key: K): Buffer {
    return toBufferKey(this.normalizeKey(key));
  }

  protected normalizeKey(key: K): (string | number | Uint8Array)[] {
    return Array.isArray(key) ? key : [key];
  }

  protected slot(key: K, index: number = 0): string {
    return `map:${this.name}:slot:${this.normalizeKey(key)}:${index}`;
  }
}
