import { toArray } from '@aztec/foundation/iterable';

import { mockLogger } from '../interfaces/utils.js';
import { AesGcmCipher, RawKeyProvider } from './cipher.js';
import { AztecSQLiteOPFSStore } from './store.js';

const HMAC_SHA256_BYTES = 32;

async function makeEncryptedStore(): Promise<AztecSQLiteOPFSStore> {
  const cipher = await AesGcmCipher.create(new RawKeyProvider(globalThis.crypto.getRandomValues(new Uint8Array(32))));
  return AztecSQLiteOPFSStore.open(mockLogger, undefined, true, undefined, cipher);
}

function makePlaintextStore(): Promise<AztecSQLiteOPFSStore> {
  return AztecSQLiteOPFSStore.open(mockLogger, undefined, true);
}

describe('opaque-keys mode', () => {
  describe('validation at open time', () => {
    let store: AztecSQLiteOPFSStore;

    afterEach(async () => {
      await store.delete();
    });

    it('throws when opaqueKeys is requested on an unencrypted store', async () => {
      store = await makePlaintextStore();
      expect(() => store.openMap('notes', { opaqueKeys: true })).toThrow(/opaqueKeys/i);
    });

    it('allows opaqueKeys on an encrypted store', async () => {
      store = await makeEncryptedStore();
      expect(() => store.openMap('notes', { opaqueKeys: true })).not.toThrow();
    });

    it('throws on openSet with opaqueKeys + no cipher', async () => {
      store = await makePlaintextStore();
      expect(() => store.openSet('nullifiers', { opaqueKeys: true })).toThrow(/opaqueKeys/i);
    });

    it('throws on openMultiMap with opaqueKeys + no cipher', async () => {
      store = await makePlaintextStore();
      expect(() => store.openMultiMap('tags', { opaqueKeys: true })).toThrow(/opaqueKeys/i);
    });
  });

  describe('Map with opaqueKeys', () => {
    let store: AztecSQLiteOPFSStore;

    beforeEach(async () => {
      store = await makeEncryptedStore();
    });

    afterEach(async () => {
      await store.delete();
    });

    it('round-trips point lookups', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.set('commitment-0xabc', 'note-value-1');
      await map.set('commitment-0xdef', 'note-value-2');
      expect(await map.getAsync('commitment-0xabc')).toBe('note-value-1');
      expect(await map.getAsync('commitment-0xdef')).toBe('note-value-2');
      expect(await map.getAsync('unknown')).toBeUndefined();
    });

    it('hasAsync / sizeAsync / delete work', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.set('a', '1');
      await map.set('b', '2');
      expect(await map.hasAsync('a')).toBe(true);
      expect(await map.sizeAsync()).toBe(2);
      await map.delete('a');
      expect(await map.hasAsync('a')).toBe(false);
      expect(await map.sizeAsync()).toBe(1);
    });

    it('iteration returns the original keys (not HMAC bytes)', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.setMany([
        { key: 'alpha', value: 'A' },
        { key: 'beta', value: 'B' },
        { key: 'gamma', value: 'C' },
      ]);
      const collected: Array<[string, string]> = [];
      for await (const entry of map.entriesAsync()) {
        collected.push(entry);
      }
      const keysSeen = collected.map(e => e[0]).sort();
      expect(keysSeen).toEqual(['alpha', 'beta', 'gamma']);
      const valuesSeen = collected.map(e => e[1]).sort();
      expect(valuesSeen).toEqual(['A', 'B', 'C']);
    });

    it('unrestricted iteration with limit returns the requested count', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      for (let i = 0; i < 10; i++) {
        await map.set(`key-${i}`, `val-${i}`);
      }
      const limited = await toArray(map.entriesAsync({ limit: 3 }));
      expect(limited).toHaveLength(3);
    });

    it('range queries with start throw', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.set('a', 'A');
      await expect(toArray(map.entriesAsync({ start: 'a' }))).rejects.toThrow(/opaque/i);
    });

    it('range queries with end throw', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.set('a', 'A');
      await expect(toArray(map.entriesAsync({ end: 'z' }))).rejects.toThrow(/opaque/i);
    });

    it('reverse iteration throws', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.set('a', 'A');
      await expect(toArray(map.entriesAsync({ reverse: true }))).rejects.toThrow(/opaque/i);
    });
  });

  describe('at-rest observation', () => {
    let store: AztecSQLiteOPFSStore;

    beforeEach(async () => {
      store = await makeEncryptedStore();
    });

    afterEach(async () => {
      await store.delete();
    });

    it('stores HMAC (32 bytes), not ordered-binary, in the key column', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.set('commitment-0xabc', 'sensitive-content');
      const rows = await store.allAsync('SELECT key FROM data WHERE container = ?', ['map:notes']);
      expect(rows).toHaveLength(1);
      const keyBlob = rows[0][0] as Uint8Array;
      expect(keyBlob).toBeInstanceOf(Uint8Array);
      expect(keyBlob.byteLength).toBe(HMAC_SHA256_BYTES);
      // Sanity: the HMAC bytes must not contain the original UTF-8 string.
      const asText = new TextDecoder('utf-8', { fatal: false }).decode(keyBlob);
      expect(asText).not.toContain('commitment');
    });

    it('leaves key column as ordered-binary when opaqueKeys is off', async () => {
      const map = store.openMap<string, string>('visible');
      await map.set('plain-key', 'value');
      const rows = await store.allAsync('SELECT key FROM data WHERE container = ?', ['map:visible']);
      expect(rows).toHaveLength(1);
      const keyBlob = rows[0][0] as Uint8Array;
      expect(keyBlob.byteLength).not.toBe(HMAC_SHA256_BYTES); // ordered-binary of 'plain-key' is shorter
    });

    it('never writes the plaintext value in the value column (encrypted)', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      const secret = 'THIS_STRING_MUST_NOT_APPEAR_ON_DISK';
      await map.set('k', secret);
      const rows = await store.allAsync('SELECT value FROM data WHERE container = ?', ['map:notes']);
      const valueBlob = rows[0][0] as Uint8Array;
      const asText = new TextDecoder('utf-8', { fatal: false }).decode(valueBlob);
      expect(asText).not.toContain(secret);
      expect(valueBlob[0]).toBe(0x01); // AES-GCM version prefix
    });
  });

  describe('MultiMap with opaqueKeys (dedup via HMAC)', () => {
    let store: AztecSQLiteOPFSStore;

    beforeEach(async () => {
      store = await makeEncryptedStore();
    });

    afterEach(async () => {
      await store.delete();
    });

    it('deduplicates identical (key, value) pairs', async () => {
      const mm = store.openMultiMap<string, string>('tags', { opaqueKeys: true });
      await mm.set('k', 'v');
      await mm.set('k', 'v'); // same pair — should dedup
      expect(await mm.getValueCountAsync('k')).toBe(1);
    });

    it('keeps distinct values under the same key', async () => {
      const mm = store.openMultiMap<string, string>('tags', { opaqueKeys: true });
      await mm.set('k', 'v1');
      await mm.set('k', 'v2');
      expect(await mm.getValueCountAsync('k')).toBe(2);
      const values: string[] = [];
      for await (const v of mm.getValuesAsync('k')) {
        values.push(v);
      }
      expect(values.sort()).toEqual(['v1', 'v2']);
    });

    it('deleteValue removes the matching (key, value)', async () => {
      const mm = store.openMultiMap<string, string>('tags', { opaqueKeys: true });
      await mm.set('k', 'v1');
      await mm.set('k', 'v2');
      await mm.deleteValue('k', 'v1');
      const values: string[] = [];
      for await (const v of mm.getValuesAsync('k')) {
        values.push(v);
      }
      expect(values).toEqual(['v2']);
    });
  });

  describe('row-rebinding (F1) is detected via AAD', () => {
    let store: AztecSQLiteOPFSStore;

    beforeEach(async () => {
      store = await makeEncryptedStore();
    });

    afterEach(async () => {
      await store.delete();
    });

    it('swapping value blobs between two rows makes both reads fail', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.set('keyA', 'secretA');
      await map.set('keyB', 'secretB');

      // Read the two rows' raw ciphertexts.
      const rows = await store.allAsync('SELECT slot, value FROM data WHERE container = ? ORDER BY slot', [
        'map:notes',
      ]);
      expect(rows).toHaveLength(2);
      const [slotA, ctA] = rows[0] as [string, Uint8Array];
      const [slotB, ctB] = rows[1] as [string, Uint8Array];

      // Mount the attack: swap the value blobs between the two slots.
      await store.runAsync('UPDATE data SET value = ? WHERE slot = ?', [ctB, slotA]);
      await store.runAsync('UPDATE data SET value = ? WHERE slot = ?', [ctA, slotB]);

      // Both reads now fail — AAD mismatch → auth tag rejects.
      await expect(map.getAsync('keyA')).rejects.toThrow();
      await expect(map.getAsync('keyB')).rejects.toThrow();
    });

    it('swapping in a non-opaque map also fails (AAD binding is universal)', async () => {
      const map = store.openMap<string, string>('visible');
      await map.set('keyA', 'A-value');
      await map.set('keyB', 'B-value');

      const rows = await store.allAsync('SELECT slot, value FROM data WHERE container = ? ORDER BY slot', [
        'map:visible',
      ]);
      const [slotA, ctA] = rows[0] as [string, Uint8Array];
      const [slotB, ctB] = rows[1] as [string, Uint8Array];

      await store.runAsync('UPDATE data SET value = ? WHERE slot = ?', [ctB, slotA]);
      await store.runAsync('UPDATE data SET value = ? WHERE slot = ?', [ctA, slotB]);

      await expect(map.getAsync('keyA')).rejects.toThrow();
      await expect(map.getAsync('keyB')).rejects.toThrow();
    });

    it('untouched rows still read correctly after a swap elsewhere', async () => {
      const map = store.openMap<string, string>('notes', { opaqueKeys: true });
      await map.set('keyA', 'A');
      await map.set('keyB', 'B');
      await map.set('keyC', 'C');

      // Row order is by HMAC — pick the first two and swap them. The key that
      // was NOT in the first two must still read correctly.
      const rows = await store.allAsync('SELECT slot, value FROM data WHERE container = ? ORDER BY slot', [
        'map:notes',
      ]);
      const [slot0, ct0] = rows[0] as [string, Uint8Array];
      const [slot1, ct1] = rows[1] as [string, Uint8Array];
      await store.runAsync('UPDATE data SET value = ? WHERE slot = ?', [ct1, slot0]);
      await store.runAsync('UPDATE data SET value = ? WHERE slot = ?', [ct0, slot1]);

      // Exactly one of the three keys lives in the untouched row and must still work.
      const results = await Promise.allSettled([map.getAsync('keyA'), map.getAsync('keyB'), map.getAsync('keyC')]);
      const survivors = results.filter(r => r.status === 'fulfilled');
      expect(survivors).toHaveLength(1);
    });
  });

  describe('Set with opaqueKeys', () => {
    let store: AztecSQLiteOPFSStore;

    beforeEach(async () => {
      store = await makeEncryptedStore();
    });

    afterEach(async () => {
      await store.delete();
    });

    it('round-trips membership', async () => {
      const set = store.openSet<string>('nullifiers', { opaqueKeys: true });
      await set.add('nullifier-1');
      expect(await set.hasAsync('nullifier-1')).toBe(true);
      expect(await set.hasAsync('nullifier-2')).toBe(false);
      await set.delete('nullifier-1');
      expect(await set.hasAsync('nullifier-1')).toBe(false);
    });

    it('iteration returns original keys', async () => {
      const set = store.openSet<string>('nullifiers', { opaqueKeys: true });
      await set.add('x');
      await set.add('y');
      await set.add('z');
      const collected: string[] = [];
      for await (const k of set.entriesAsync()) {
        collected.push(k);
      }
      expect(collected.sort()).toEqual(['x', 'y', 'z']);
    });
  });
});
