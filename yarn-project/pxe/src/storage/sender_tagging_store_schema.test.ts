import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ExtendedDirectionalAppTaggingSecret, type TaggingIndexRange } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import { PXE_DATA_SCHEMA_VERSION } from './metadata.js';
import { openPxeStores } from './open_pxe_stores.js';
import { snapshotMap } from './snapshot_kv_entries.js';

describe('SenderTaggingStore schema compatibility', () => {
  it('persists pending and finalized indexes after commit', async () => {
    const kvStore = await openTmpStore('pxe-schema-sender-tagging', true);
    try {
      const { senderTaggingStore } = openPxeStores(kvStore);

      const jobId = 'fixture-job';
      const secretA = new ExtendedDirectionalAppTaggingSecret(new Fr(2n), AztecAddress.fromBigInt(3n));
      const secretB = new ExtendedDirectionalAppTaggingSecret(new Fr(5n), AztecAddress.fromBigInt(7n));
      const txHashA = TxHash.fromBigInt(11n);
      const txHashB = TxHash.fromBigInt(13n);

      const ranges: TaggingIndexRange[] = [
        { extendedSecret: secretA, lowestIndex: 1, highestIndex: 3 },
        { extendedSecret: secretB, lowestIndex: 1, highestIndex: 5 },
      ];

      await senderTaggingStore.storePendingIndexes(ranges, txHashA, jobId);
      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretA, lowestIndex: 4, highestIndex: 7 }],
        txHashB,
        jobId,
      );
      await senderTaggingStore.finalizePendingIndexes([txHashA], jobId);
      await kvStore.transactionAsync(() => senderTaggingStore.commit(jobId));

      const pendingIndexes = kvStore.openMap<string, Buffer>('pending_indexes');
      const lastFinalizedIndexes = kvStore.openMap<string, number>('last_finalized_indexes');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        pending_indexes: await snapshotMap(pendingIndexes),
        last_finalized_indexes: await snapshotMap(lastFinalizedIndexes),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
