/**
 * Wallet-layer helpers for opening the embedded wallet's two encrypted stores (PXE + walletDB) as a cohesive unit.
 *
 * Sits on top of `@aztec/kv-store/sqlite-opfs`'s typed `SqliteEncryptionError` and adds:
 *
 *   - `storeName: 'pxe' | 'wallet'`, telling callers WHICH store failed.
 *   - Cleanup: when the wallet store fails to open, ensures the already-opened PXE store is closed before the error
 *     surfaces, so callers don't leak the SAH Pool's OPFS lock.
 */
import type { Logger } from '@aztec/foundation/log';
<<<<<<< HEAD
import { AztecSQLiteOPFSStore, SqliteEncryptionError } from '@aztec/kv-store/sqlite-opfs';
=======
import {
  AztecSQLiteOPFSStore,
  SqliteCorruptionError,
  SqliteEncryptionError,
  deletePoolDirectory,
} from '@aztec/kv-store/sqlite-opfs';
>>>>>>> 386f120fb2 (feat: weblock controlled opfs pool (#24740))

/** Which of the embedded wallet's two stores failed to open. */
export type EmbeddedStoreName = 'pxe' | 'wallet';

/**
 * Thrown by {@link openEncryptedEmbeddedStores} when one of the two stores cannot be decrypted with the supplied
 * key. The original {@link SqliteEncryptionError} is preserved as `cause`.
 */
export class EmbeddedWalletEncryptionError extends Error {
  readonly storeName: EmbeddedStoreName;

  constructor(storeName: EmbeddedStoreName, opts: { cause: SqliteEncryptionError }) {
    super(`Embedded wallet '${storeName}' store could not be decrypted with the provided key`, { cause: opts.cause });
    this.name = 'EmbeddedWalletEncryptionError';
    this.storeName = storeName;
  }
}

/** Configuration for {@link openEncryptedEmbeddedStores}. */
export interface OpenEncryptedEmbeddedStoresOptions {
  pxe: { name: string; poolDirectory?: string };
  wallet: { name: string; poolDirectory?: string };
}

/**
 * Internal seam for tests to inject a fake store opener. Defaults to `AztecSQLiteOPFSStore.open`. Not part of the
 * public API.
 *
 * @internal
 */
export type OpenSqliteEncryptedStoreFn = (
  log: Logger,
  name: string,
  poolDirectory: string | undefined,
  encryptionKey: Uint8Array,
) => Promise<AztecSQLiteOPFSStore>;

const defaultOpenStore: OpenSqliteEncryptedStoreFn = (log, name, poolDirectory, encryptionKey) =>
  AztecSQLiteOPFSStore.open(log, name, false, poolDirectory, encryptionKey);

/**
<<<<<<< HEAD
=======
 * Internal seam for tests to inject a fake store wiper. Defaults to removing the store's OPFS pool directory
 * outright. Not part of the public API.
 *
 * @internal
 */
export type WipeSqliteStoreFn = (poolDirectory: string | undefined) => Promise<void>;

/**
 * Deletes a store's OPFS pool directory. Safe to call only after a *failed* open() — a live store's SAH pool holds
 * a lock on the directory and the removal would reject. A store with no `poolDirectory` lives in the shared default
 * pool, which we won't blow away (it would take unrelated stores with it), so wiping is a no-op there.
 */
const defaultWipeStore: WipeSqliteStoreFn = async poolDirectory => {
  if (!poolDirectory) {
    return;
  }
  await deletePoolDirectory(poolDirectory).catch(() => {
    // Already gone / never created — nothing to wipe.
  });
};

/**
>>>>>>> 386f120fb2 (feat: weblock controlled opfs pool (#24740))
 * Opens the PXE and wallet stores in sequence, both encrypted with keys obtained from `getEncryptionKey`.
 *
 * The callback is invoked once per store (twice total per call) because `AztecSQLiteOPFSStore.open` *transfers*
 * the key buffer to its worker. A single buffer would detach between the two opens.
 *
 * Failure modes:
 *
 *   - PXE store fails to decrypt → throws `EmbeddedWalletEncryptionError({ storeName: 'pxe', cause })`. No cleanup
 *     needed (nothing was opened).
 *   - Wallet store fails to decrypt → closes the already-opened PXE store then throws
 *     `EmbeddedWalletEncryptionError({ storeName: 'wallet', cause })`.
 *   - Any non-decrypt error during the wallet open → still closes PXE, then re-throws the original error unwrapped
 *     (preserves callers' existing untyped error handling for non-encryption faults).
 *
 * @param config           - Per-store name/poolDirectory.
 * @param getEncryptionKey - Returns a fresh 32-byte key per call (the buffer
 *                           detaches on transfer, so each call must allocate).
 * @param log              - Logger for both stores.
 * @param openStore        - Internal test seam. Do not pass in production code.
 */
export async function openEncryptedEmbeddedStores(
  config: OpenEncryptedEmbeddedStoresOptions,
  getEncryptionKey: () => Promise<Uint8Array>,
  log: Logger,
  openStore: OpenSqliteEncryptedStoreFn = defaultOpenStore,
): Promise<{ pxeStore: AztecSQLiteOPFSStore; walletStore: AztecSQLiteOPFSStore }> {
  const pxeStore = await openOneStore('pxe', config.pxe, getEncryptionKey, log, openStore);
  try {
    const walletStore = await openOneStore('wallet', config.wallet, getEncryptionKey, log, openStore);
    return { pxeStore, walletStore };
  } catch (err) {
    // Cleanup is best-effort — if close() itself throws (e.g. worker already dead), swallow it so the original error
    // surfaces unobstructed.
    await pxeStore.close().catch(() => {});
    throw err;
  }
}

async function openOneStore(
  storeName: EmbeddedStoreName,
  { name, poolDirectory }: { name: string; poolDirectory?: string },
  getEncryptionKey: () => Promise<Uint8Array>,
  log: Logger,
  openStore: OpenSqliteEncryptedStoreFn,
): Promise<AztecSQLiteOPFSStore> {
  const key = await getEncryptionKey();
  try {
    return await openStore(log, name, poolDirectory, key);
  } catch (err) {
    if (err instanceof SqliteEncryptionError && err.code === 'decrypt_failed') {
      throw new EmbeddedWalletEncryptionError(storeName, { cause: err });
    }
    throw err;
  }
}
