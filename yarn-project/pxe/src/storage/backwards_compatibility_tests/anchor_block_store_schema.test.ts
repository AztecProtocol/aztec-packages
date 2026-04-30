import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BlockHeader } from '@aztec/stdlib/tx';

import { AnchorBlockStore } from '../anchor_block_store/anchor_block_store.js';
import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotSingleton } from './kv_store_snapshot.js';

describe('AnchorBlockStore schema compatibility', () => {
  it('persists the synchronized block header', async () => {
    const kvStore = await openTmpStore('pxe-schema-anchor-block', true);
    try {
      const anchorBlockStore = new AnchorBlockStore(kvStore);

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
