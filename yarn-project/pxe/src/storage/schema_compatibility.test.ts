import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { PXE_DATA_SCHEMA_VERSION } from './metadata.js';
import { openPxeStores } from './open_pxe_stores.js';
import { createStoreSpy } from './store_spy.js';

/**
 * PXE wipes its database when `PXE_DATA_SCHEMA_VERSION` doesn't match what's on disk, so any uncoordinated change to
 * the on-disk schema destroys user data. This suite (together with the per-store-class `*_schema.test.ts` files in
 * this directory) pins the schema fingerprint so a schema change forces an explicit and intentional version bump.
 */
describe('PXE schema compatibility', () => {
  it('matches snapshot of collection of stores opened by PXE', async () => {
    const kvStore = await openTmpStore('pxe-schema-stores', true);
    try {
      const { store, openedStores } = createStoreSpy(kvStore);
      openPxeStores(store);
      expect({ schemaVersion: PXE_DATA_SCHEMA_VERSION, stores: openedStores() }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
