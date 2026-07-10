import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { AztecSQLiteOPFSStore, storePoolDirectory } from '@aztec/kv-store/sqlite-opfs';

import { assertStoreIdentity, effectiveStoreName } from '../../storage/store_identity.js';

/**
 * Opens the persistent browser (sqlite-opfs) store selected by `name` and identity `(config.l1ChainId,
 * config.rollupAddress, schemaVersion)` triple. A store exists per identity: reopening with the same identity returns
 * the same data, a different identity selects a different (possibly fresh) store.
 */
export async function openPXEBrowserStore(
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
  const store = await AztecSQLiteOPFSStore.open(
    createLogger('kv-store:sqlite-opfs'),
    storeName,
    false,
    storePoolDirectory(storeName),
  );
  try {
    await assertStoreIdentity(store, storeName, identity);
  } catch (err) {
    // The store handle owns a worker and OPFS locks; release them before surfacing the refusal.
    await store.close().catch(() => {});
    throw err;
  }
  return store;
}
