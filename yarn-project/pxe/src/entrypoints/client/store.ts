import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { AztecSQLiteOPFSStore, storePoolDirectory } from '@aztec/kv-store/sqlite-opfs';

import { assertStoreIdentity, effectiveStoreName, requireCompleteIdentity } from '../../storage/store_identity.js';

/**
 * Opens the persistent browser (sqlite-opfs) store selected by `name` and the identity `(config.l1ChainId,
 * config.rollupAddress, schemaVersion)`. A store exists per identity: reopening with the same identity returns the
 * same data, a different identity selects a different (possibly fresh) store. Nothing is ever cleared.
 *
 * @throws If `config.rollupAddress` or `config.l1ChainId` is missing — an incomplete identity must never silently
 * default to the zero identity.
 */
export async function openPXEBrowserStore(
  name: string,
  schemaVersion: number,
  config: { l1ChainId?: number; rollupAddress?: EthAddress; dataStoreMapSizeKb?: number },
  log: Logger = createLogger('pxe:data'),
): Promise<AztecSQLiteOPFSStore> {
  const identity = requireCompleteIdentity(name, config, schemaVersion);
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
