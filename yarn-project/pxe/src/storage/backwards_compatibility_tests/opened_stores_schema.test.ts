import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { openPxeStores } from '../open_pxe_stores.js';
import { createStoreSpy } from './store_spy.js';

describe('Opened stores schema compatibility', () => {
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
