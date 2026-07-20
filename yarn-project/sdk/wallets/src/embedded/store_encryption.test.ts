/**
 * Tests for the two-store cleanup orchestration in
 * {@link openEncryptedEmbeddedStores}. Uses the DI seam (`openStore`
 * parameter) to inject controlled failures — sidesteps the need for a real
 * `AztecSQLiteOPFSStore`, which requires browser-only Web Workers + OPFS.
 */
import type { Logger } from '@aztec/foundation/log';
import type { AztecSQLiteOPFSStore } from '@aztec/kv-store/sqlite-opfs';
import { SqliteEncryptionError } from '@aztec/kv-store/sqlite-opfs';

import {
  EmbeddedWalletEncryptionError,
  type OpenSqliteEncryptedStoreFn,
  openEncryptedEmbeddedStores,
} from './store_encryption.js';

const noopLogger = {
  debug: () => {},
  verbose: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  trace: () => {},
  createChild: () => noopLogger,
  isLevelEnabled: () => false,
  level: 'info',
  module: '',
} as unknown as Logger;

/** Minimal mock store — only needs `close()` because that's all the orchestration touches. */
function makeMockStore(): { store: AztecSQLiteOPFSStore; closeCalls: number } {
  let closeCalls = 0;
  const store = {
    close: () => {
      closeCalls++;
      return Promise.resolve();
    },
  } as unknown as AztecSQLiteOPFSStore;
  return {
    store,
    get closeCalls() {
      return closeCalls;
    },
  };
}

function makeKeyProvider(): { getKey: () => Promise<Uint8Array>; callCount: number } {
  let callCount = 0;
  return {
    getKey: () => {
      callCount++;
      return Promise.resolve(new Uint8Array(32));
    },
    get callCount() {
      return callCount;
    },
  };
}

const config = {
  pxe: { name: 'pxe_data', poolDirectory: '/pxe' },
  wallet: { name: 'wallet_data', poolDirectory: '/wallet' },
};

describe('openEncryptedEmbeddedStores', () => {
  it('returns both stores on the happy path', async () => {
    const pxe = makeMockStore();
    const wallet = makeMockStore();
    const opens: string[] = [];
    const openStore: OpenSqliteEncryptedStoreFn = (_log, name) => {
      opens.push(name);
      return Promise.resolve(name === 'pxe_data' ? pxe.store : wallet.store);
    };

    const keyProvider = makeKeyProvider();
    const result = await openEncryptedEmbeddedStores(config, keyProvider.getKey, noopLogger, openStore);

    expect(result.pxeStore).toBe(pxe.store);
    expect(result.walletStore).toBe(wallet.store);
    expect(opens).toEqual(['pxe_data', 'wallet_data']);
    expect(keyProvider.callCount).toBe(2);
    expect(pxe.closeCalls).toBe(0);
  });

  it('throws EmbeddedWalletEncryptionError({storeName:"pxe"}) when PXE decrypt fails (no cleanup needed)', async () => {
    const wallet = makeMockStore();
    let walletOpenAttempted = false;
    const decryptError = new SqliteEncryptionError('decrypt_failed', 'file is not a database');
    const openStore: OpenSqliteEncryptedStoreFn = (_log, name) => {
      if (name === 'pxe_data') {
        return Promise.reject(decryptError);
      }
      walletOpenAttempted = true;
      return Promise.resolve(wallet.store);
    };

    let caught: unknown;
    try {
      await openEncryptedEmbeddedStores(config, makeKeyProvider().getKey, noopLogger, openStore);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(EmbeddedWalletEncryptionError);
    expect((caught as EmbeddedWalletEncryptionError).storeName).toBe('pxe');
    expect((caught as EmbeddedWalletEncryptionError).cause).toBe(decryptError);
    // Wallet open must NOT be attempted once PXE has failed — short-circuit.
    expect(walletOpenAttempted).toBe(false);
  });

  it('closes PXE and throws EmbeddedWalletEncryptionError({storeName:"wallet"}) when wallet decrypt fails', async () => {
    const pxe = makeMockStore();
    const decryptError = new SqliteEncryptionError('decrypt_failed', 'file is not a database');
    const openStore: OpenSqliteEncryptedStoreFn = (_log, name) =>
      name === 'pxe_data' ? Promise.resolve(pxe.store) : Promise.reject(decryptError);

    let caught: unknown;
    try {
      await openEncryptedEmbeddedStores(config, makeKeyProvider().getKey, noopLogger, openStore);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(EmbeddedWalletEncryptionError);
    expect((caught as EmbeddedWalletEncryptionError).storeName).toBe('wallet');
    expect((caught as EmbeddedWalletEncryptionError).cause).toBe(decryptError);
    expect(pxe.closeCalls).toBe(1);
  });

  it('does not wrap non-decrypt errors, but still cleans up PXE on wallet-open failure', async () => {
    const pxe = makeMockStore();
    const wallet = makeMockStore();
    const otherError = new Error('disk full');
    let walletAttempts = 0;
    const openStore: OpenSqliteEncryptedStoreFn = (_log, name) => {
      if (name === 'pxe_data') {
        return Promise.resolve(pxe.store);
      }
      walletAttempts++;
      // Use the side-effect to suppress the unused warning on `wallet` below.
      void wallet;
      return Promise.reject(otherError);
    };

    let caught: unknown;
    try {
      await openEncryptedEmbeddedStores(config, makeKeyProvider().getKey, noopLogger, openStore);
    } catch (err) {
      caught = err;
    }

    // The non-decrypt error propagates raw — no EmbeddedWalletEncryptionError wrap.
    expect(caught).toBe(otherError);
    expect(caught).not.toBeInstanceOf(EmbeddedWalletEncryptionError);
    expect(walletAttempts).toBe(1);
    // PXE cleanup still happens — the helper's responsibility is "no leaked
    // resources after a failed open", not just "no leaked resources on decrypt".
    expect(pxe.closeCalls).toBe(1);
  });

  it('swallows PXE.close() failures so the original error surfaces unobstructed', async () => {
    const pxeStore = {
      close: () => Promise.reject(new Error('worker already dead')),
    } as unknown as AztecSQLiteOPFSStore;
    const decryptError = new SqliteEncryptionError('decrypt_failed', 'file is not a database');
    const openStore: OpenSqliteEncryptedStoreFn = (_log, name) =>
      name === 'pxe_data' ? Promise.resolve(pxeStore) : Promise.reject(decryptError);

    let caught: unknown;
    try {
      await openEncryptedEmbeddedStores(config, makeKeyProvider().getKey, noopLogger, openStore);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(EmbeddedWalletEncryptionError);
    expect((caught as EmbeddedWalletEncryptionError).cause).toBe(decryptError);
  });

  it('calls getEncryptionKey exactly twice (one per store), so a buffer-transfer-detached key is not reused', async () => {
    const pxe = makeMockStore();
    const wallet = makeMockStore();
    const keyProvider = makeKeyProvider();
    const openStore: OpenSqliteEncryptedStoreFn = (_log, name) =>
      Promise.resolve(name === 'pxe_data' ? pxe.store : wallet.store);

    await openEncryptedEmbeddedStores(config, keyProvider.getKey, noopLogger, openStore);

    expect(keyProvider.callCount).toBe(2);
  });
});
