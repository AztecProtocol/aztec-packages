import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BlockHeader } from '@aztec/stdlib/tx';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { openPxeStores } from '../open_pxe_stores.js';
import { snapshotSingleton } from './snapshot_kv_entries.js';

describe('AnchorBlockStore schema compatibility', () => {
  it('persists the synchronized block header', async () => {
    const kvStore = await openTmpStore('pxe-schema-anchor-block', true);
    try {
      const { anchorBlockStore } = openPxeStores(kvStore);

      await anchorBlockStore.setHeader(BlockHeader.empty());

      const header = kvStore.openSingleton<Buffer>('header');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        header: await snapshotSingleton(header),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
