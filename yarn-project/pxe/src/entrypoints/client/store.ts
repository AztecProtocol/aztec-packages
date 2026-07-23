import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  AztecSQLiteOPFSStore,
  SqliteCorruptionError,
  deleteStore,
  storePoolDirectory,
} from '@aztec/kv-store/sqlite-opfs';

import { assertStoreIdentity, effectiveStoreName } from '../../storage/store_identity.js';

/**
 * Opens the persistent browser (sqlite-opfs) store selected by `name` and identity `(config.l1ChainId,
 * config.rollupAddress, schemaVersion)` triple. A store exists per identity: reopening with the same identity returns
 * the same data, a different identity selects a different (possibly fresh) store.
 */
export async function openBrowserStore(
  name: string,
  schemaVersion: number,
  config: { l1ChainId: number; rollupAddress: EthAddress; dataStoreMapSizeKb?: number },
  log: Logger = createLogger('pxe:data'),
): Promise<AztecSQLiteOPFSStore> {
  const identity = { l1ChainId: config.l1ChainId, rollupAddress: config.rollupAddress, schemaVersion };
  const storeName = effectiveStoreName(name, identity);
  log.info(`Creating ${storeName} SQLite-OPFS data store`, {
    storeName,
    dataStoreMapSizeKb: config.dataStoreMapSizeKb,
  });
  const openStore = () =>
    AztecSQLiteOPFSStore.open(createLogger('kv-store:sqlite-opfs'), storeName, false, storePoolDirectory(storeName));

  let store: AztecSQLiteOPFSStore;
  try {
    store = await openStore();
  } catch (err) {
    if (!(err instanceof SqliteCorruptionError)) {
      throw err;
    }
    // A corrupt image is unrecoverable — no retry against the same bytes helps. Wipe the store's OPFS directory
    // (safe: the failed open left no SAH-pool lock behind) and reopen a fresh, empty one, so the browser self-heals
    // into a normal first-run rather than dead-ending on "database disk image is malformed" every load.
    log.warn(`${storeName} store is corrupt (${err.message}); wiping and reopening fresh`);
    await deleteStore(storeName);
    store = await openStore();
  }
  try {
    await assertStoreIdentity(store, storeName, identity);
  } catch (err) {
    // The store handle owns a worker and OPFS locks; release them before surfacing the refusal.
    await store.close().catch(() => {});
    throw err;
  }
  return store;
}
