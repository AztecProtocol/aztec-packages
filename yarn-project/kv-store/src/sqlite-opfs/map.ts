import { Buffer } from 'buffer';
import { Encoder } from 'msgpackr';
import { fromBufferKey, toBufferKey } from 'ordered-binary';

import type { Key, Range, Value } from '../interfaces/common.js';
import type { AztecAsyncMap } from '../interfaces/map.js';
import type { SqlValue } from './messages.js';
import type { AztecSQLiteOPFSStore } from './store.js';

const textEncoder = new TextEncoder();

/** AAD bound into every encrypted value. Tying the slot (container + encoded key +
 *  index) to the ciphertext means an attacker with disk-write access can't move a
 *  ciphertext to a different row — the auth tag will reject the swap on decrypt. */
function slotAad(slot: string): Uint8Array {
  return textEncoder.encode(slot);
}

/** Internal options passed down from the store. Container authors don't see the
 *  public `OpenContainerOptions` shape — the store translates it. */
export type SQLiteOPFSMapOptions = {
  /** When true, keys are HMAC'd before being stored, and the encrypted value blob
   *  carries the clear key so iterators can still return it. Range queries (start/end
   *  or reverse) throw — HMAC destroys ordering. */
  opaqueKeys?: boolean;
};

/** A map backed by SQLite in OPFS. Mirrors `IndexedDBAztecMap`. Values flow through
 *  the store's `cipher.encrypt`/`decrypt`; in `opaqueKeys` mode, keys additionally
 *  flow through `cipher.keyDigest` for at-rest obfuscation. */
export class SQLiteOPFSAztecMap<K extends Key, V extends Value> implements AztecAsyncMap<K, V> {
  protected readonly name: string;
  protected readonly container: string;
  protected readonly encoder = new Encoder();
  protected readonly opaqueKeys: boolean;

  constructor(
    protected readonly store: AztecSQLiteOPFSStore,
    mapName: string,
    options: SQLiteOPFSMapOptions = {},
  ) {
    this.name = mapName;
    this.container = `map:${mapName}`;
    this.opaqueKeys = !!options.opaqueKeys;
  }

  async getAsync(key: K): Promise<V | undefined> {
    const { slot } = await this.keyMaterial(key);
    const rows = await this.store.allAsync('SELECT value FROM data WHERE slot = ? LIMIT 1', [slot]);
    if (rows.length === 0) {
      return undefined;
    }
    const raw = rows[0][0];
    return raw == null ? undefined : await this.decodeValue(raw, slot);
  }

  async hasAsync(key: K): Promise<boolean> {
    const { slot } = await this.keyMaterial(key);
    const rows = await this.store.allAsync('SELECT 1 FROM data WHERE slot = ? LIMIT 1', [slot]);
    return rows.length > 0;
  }

  async sizeAsync(): Promise<number> {
    const rows = await this.store.allAsync('SELECT COUNT(*) FROM data WHERE container = ?', [this.container]);
    return Number(rows[0]?.[0] ?? 0);
  }

  async set(key: K, val: V): Promise<void> {
    const { slot, encodedKey } = await this.keyMaterial(key);
    const packed = this.packForStorage(key, val);
    const [cipherValue, digest] = await Promise.all([
      this.store.cipher.encrypt(packed, slotAad(slot)),
      this.store.cipher.digest(packed),
    ]);
    await this.store.runAsync(
      `INSERT OR REPLACE INTO data (slot, container, key, key_count, hash, value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [slot, this.container, encodedKey, 1, digest, cipherValue],
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
    const { slot } = await this.keyMaterial(key);
    await this.store.runAsync('DELETE FROM data WHERE slot = ?', [slot]);
  }

  async *entriesAsync(range: Range<K> = {}): AsyncIterableIterator<[K, V]> {
    const rows = await this.rangeQuery(range);
    for (const row of rows) {
      const [slot, keyBlob, value] = row;
      if (value == null) {
        continue;
      }
      const entry = await this.decodeEntry(slot, keyBlob, value);
      if (entry !== undefined) {
        yield entry;
      }
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

  protected async rangeQuery(range: Range<K>): Promise<Array<[string, Uint8Array | null, Uint8Array | null]>> {
    if (this.opaqueKeys && (range.start !== undefined || range.end !== undefined || range.reverse)) {
      throw new Error(
        `Range queries with start/end/reverse are unsupported on opaque-keys container '${this.name}' — HMAC'd keys have no meaningful order. Use point lookups or unordered iteration (optionally with { limit }).`,
      );
    }
    // Inclusivity flips with direction to match the IndexedDB backend:
    //   forward: [start, end)     reverse: (start, end]
    // That asymmetry is load-bearing — tests pin the exact inclusivity at boundaries.
    const reverse = !!range.reverse;
    const parts: string[] = ['container = ?'];
    const bind: SqlValue[] = [this.container];
    if (range.start !== undefined) {
      parts.push(reverse ? 'key > ?' : 'key >= ?');
      bind.push(toBufferKey(this.normalizeKey(range.start)));
    }
    if (range.end !== undefined) {
      parts.push(reverse ? 'key <= ?' : 'key < ?');
      bind.push(toBufferKey(this.normalizeKey(range.end)));
    }
    const order = reverse ? 'DESC' : 'ASC';
    let sql = `SELECT slot, key, value FROM data WHERE ${parts.join(' AND ')} ORDER BY key ${order}, key_count ${order}`;
    if (range.limit !== undefined) {
      sql += ' LIMIT ?';
      bind.push(range.limit);
    }
    const rows = await this.store.allAsync(sql, bind);
    return rows.map(r => [String(r[0]), (r[1] as Uint8Array | null) ?? null, (r[2] as Uint8Array | null) ?? null]);
  }

  /** Packs the payload that will land in the `value` column *before* encryption.
   *  In opaque-keys mode the packed tuple carries the clear key so iterators can
   *  reconstruct it (HMAC is one-way). */
  protected packForStorage(key: K, val: V): Uint8Array {
    return this.opaqueKeys ? this.encoder.pack([key, val]) : this.encoder.pack(val);
  }

  /** Decrypts and unpacks a stored value, returning the original V. Slot is passed
   *  as AAD so decrypt fails if the ciphertext was moved from a different row. */
  protected async decodeValue(raw: SqlValue, slot: string): Promise<V> {
    if (!(raw instanceof Uint8Array)) {
      return raw as V;
    }
    const plaintext = await this.store.cipher.decrypt(raw, slotAad(slot));
    const unpacked = this.encoder.unpack(plaintext);
    if (this.opaqueKeys) {
      // Shape is [key, value] — return just the value.
      return this.restoreBuffer((unpacked as [K, V])[1]) as V;
    }
    return this.restoreBuffer(unpacked) as V;
  }

  /** Decodes an entire iteration row into [K, V]. Returns `undefined` if the row
   *  can't be decoded (null value blob in a non-opaque container). Slot is passed
   *  as AAD for row-binding integrity. */
  protected async decodeEntry(
    slot: string,
    keyBlob: Uint8Array | null,
    valBlob: Uint8Array,
  ): Promise<[K, V] | undefined> {
    const plaintext = await this.store.cipher.decrypt(valBlob, slotAad(slot));
    const unpacked = this.encoder.unpack(plaintext);
    if (this.opaqueKeys) {
      const [rawKey, rawVal] = unpacked as [K, V];
      return [rawKey, this.restoreBuffer(rawVal) as V];
    }
    if (keyBlob == null) {
      return undefined;
    }
    return [this.decodeKey(keyBlob), this.restoreBuffer(unpacked) as V];
  }

  /**
   * msgpackr returns plain Uint8Array in browsers for packed Buffers. Callers that
   * stored Buffers (walletDB uses Buffer.from(...).toString('utf8') round-trips)
   * rely on Buffer-flavored behavior — re-wrap at the storage boundary, mirroring
   * IndexedDBAztecMap.restoreBuffers.
   */
  protected restoreBuffer(val: unknown): unknown {
    if (val instanceof Uint8Array && !Buffer.isBuffer(val)) {
      return Buffer.from(val);
    }
    return val;
  }

  protected decodeKey(raw: Uint8Array): K {
    const parsed = fromBufferKey(Buffer.from(raw));
    if (Array.isArray(parsed)) {
      return (parsed.length > 1 ? parsed : parsed[0]) as K;
    }
    return parsed as K;
  }

  /** Produces the `(slot, encodedKey)` pair for a user key. In opaque mode, the
   *  encoded key is the HMAC of the ordered-binary bytes; otherwise it's the raw
   *  ordered-binary bytes. Slot is derived from `encodedKey` so it's unique per-key
   *  either way. */
  protected async keyMaterial(key: K, index: number = 0): Promise<{ slot: string; encodedKey: Uint8Array }> {
    const rawEncoded = toBufferKey(this.normalizeKey(key));
    const encodedKey = this.opaqueKeys ? await this.store.cipher.keyDigest(rawEncoded) : rawEncoded;
    const slot = `${this.container}:${bytesToHex(encodedKey)}:${index}`;
    return { slot, encodedKey };
  }

  protected normalizeKey(key: K): (string | number | Uint8Array)[] {
    return Array.isArray(key) ? key : [key];
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += b.toString(16).padStart(2, '0');
  }
  return s;
}
