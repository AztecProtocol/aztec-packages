/**
 * Tests for sqlite3mc-backed page-level encryption.
 * Exercises the `encryptionKey` parameter added to `AztecSQLiteOPFSStore.open()`.
 * Mixes ephemeral and persistent stores so we cover both `:memory:` and OPFS paths.
 */
import { describe, expect, it } from 'vitest';

import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

function randomKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Clone a key into a fresh Uint8Array. `AztecSQLiteOPFSStore.open()` transfers
 * the key's ArrayBuffer to the worker (detaching it on the caller side), so
 * callers that open multiple stores or re-use a key must pass a copy per call.
 */
function cloneKey(k: Uint8Array): Uint8Array {
  return new Uint8Array(k);
}

describe('AztecSQLiteOPFSStore with encryption', () => {
  it('rejects keys that are not 32 bytes', async () => {
    const short = new Uint8Array(16);
    await expect(AztecSQLiteOPFSStore.open(mockLogger, undefined, true, undefined, short)).rejects.toThrow(
      /encryptionKey must be 32 bytes/,
    );
  });

  it('rejects encryption on ephemeral (:memory:) stores', async () => {
    const key = randomKey();
    await expect(AztecSQLiteOPFSStore.open(mockLogger, undefined, true, undefined, key)).rejects.toThrow(
      /not supported for ephemeral/,
    );
  });

  it('round-trips values with the same key (persistent)', async () => {
    const key = randomKey();
    const name = `test-enc-${Date.now()}`;
    const dir = `/test-enc-pool-${Date.now()}`;
    const a = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, cloneKey(key));
    const mapA = a.openMap<string, string>('m');
    await mapA.set('k1', 'v1');
    await a.close();

    const b = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, cloneKey(key));
    const mapB = b.openMap<string, string>('m');
    expect(await mapB.getAsync('k1')).toBe('v1');
    await b.delete();
  });

  it('fails to open with the wrong key', async () => {
    const key = randomKey();
    const name = `test-wrong-${Date.now()}`;
    const dir = `/test-wrong-pool-${Date.now()}`;
    const a = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, cloneKey(key));
    await a.openMap<string, string>('m').set('k1', 'v1');
    await a.close();

    await expect(async () => {
      const b = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, randomKey());
      await b.openMap<string, string>('m').getAsync('k1');
      await b.close();
    }).rejects.toThrow();

    const c = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, cloneKey(key));
    await c.delete();
  });

  it('fails to open an encrypted DB without a key', async () => {
    const key = randomKey();
    const name = `test-nokey-${Date.now()}`;
    const dir = `/test-nokey-pool-${Date.now()}`;
    const a = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, cloneKey(key));
    await a.openMap<string, string>('m').set('k1', 'v1');
    await a.close();

    await expect(async () => {
      const b = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir);
      await b.openMap<string, string>('m').getAsync('k1');
      await b.close();
    }).rejects.toThrow();

    const c = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, cloneKey(key));
    await c.delete();
  });
});
