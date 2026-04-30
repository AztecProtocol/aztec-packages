import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ExtendedDirectionalAppTaggingSecret, type TaggingIndexRange } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { SenderTaggingStore } from '../tagging_store/index.js';
import { snapshotMap } from './kv_store_snapshot.js';

describe('SenderTaggingStore schema compatibility', () => {
  it('persists multi-element pending arrays, single-element pending arrays, and finalized indexes', async () => {
    const kvStore = await openTmpStore('pxe-schema-sender-tagging', true);
    try {
      const senderTaggingStore = new SenderTaggingStore(kvStore);

      const jobId = 'fixture-job';
      const secretA = new ExtendedDirectionalAppTaggingSecret(new Fr(2n), AztecAddress.fromBigInt(3n));
      const secretB = new ExtendedDirectionalAppTaggingSecret(new Fr(5n), AztecAddress.fromBigInt(7n));
      const secretC = new ExtendedDirectionalAppTaggingSecret(new Fr(11n), AztecAddress.fromBigInt(13n));
      const txHashA = TxHash.fromBigInt(17n);
      const txHashB = TxHash.fromBigInt(19n);
      const txHashC = TxHash.fromBigInt(23n);
      const txHashD = TxHash.fromBigInt(29n);

      const txHashARanges: TaggingIndexRange[] = [
        { extendedSecret: secretA, lowestIndex: 1, highestIndex: 3 },
        { extendedSecret: secretB, lowestIndex: 1, highestIndex: 5 },
      ];
      await senderTaggingStore.storePendingIndexes(txHashARanges, txHashA, jobId);

      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretA, lowestIndex: 4, highestIndex: 7 }],
        txHashB,
        jobId,
      );

      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretA, lowestIndex: 4, highestIndex: 7 }],
        txHashB,
        jobId,
      );

      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretA, lowestIndex: 8, highestIndex: 11 }],
        txHashC,
        jobId,
      );

      // secretC's range is never finalized, so it survives commit as a single-element pending array (contrast with
      // secretA's multi-element shape).
      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretC, lowestIndex: 1, highestIndex: 9 }],
        txHashD,
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
