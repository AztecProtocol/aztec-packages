import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { L2Block } from '@aztec/stdlib/block';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotMap } from './kv_store_snapshot.js';

describe('L2TipsKVStore schema compatibility', () => {
  it("persists tips and block hashes after a 'blocks-added' event", async () => {
    const kvStore = await openTmpStore('pxe-schema-l2-tips', true);
    try {
      const l2TipsStore = new L2TipsKVStore(kvStore, 'pxe');

      await l2TipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: [L2Block.empty()] });

      const tips = kvStore.openMap<string, number>('pxe_l2_tips');
      const blockHashes = kvStore.openMap<number, string>('pxe_l2_block_hashes');
      const blockToCheckpoint = kvStore.openMap<number, number>('pxe_l2_block_number_to_checkpoint_number');
      const checkpoints = kvStore.openMap<number, Buffer>('pxe_l2_checkpoint_store');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        pxe_l2_tips: await snapshotMap(tips),
        pxe_l2_block_hashes: await snapshotMap(blockHashes),
        pxe_l2_block_number_to_checkpoint_number: await snapshotMap(blockToCheckpoint),
        pxe_l2_checkpoint_store: await snapshotMap(checkpoints),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
