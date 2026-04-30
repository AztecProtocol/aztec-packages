import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ExtendedDirectionalAppTaggingSecret } from '@aztec/stdlib/logs';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { openPxeStores } from '../open_pxe_stores.js';
import { snapshotMap } from './snapshot_kv_entries.js';

describe('RecipientTaggingStore schema compatibility', () => {
  it('persists highest aged and finalized indexes after commit', async () => {
    const kvStore = await openTmpStore('pxe-schema-recipient-tagging', true);
    try {
      const { recipientTaggingStore } = openPxeStores(kvStore);

      const jobId = 'fixture-job';
      const secretA = new ExtendedDirectionalAppTaggingSecret(new Fr(2n), AztecAddress.fromBigInt(3n));
      const secretB = new ExtendedDirectionalAppTaggingSecret(new Fr(5n), AztecAddress.fromBigInt(7n));

      await recipientTaggingStore.updateHighestFinalizedIndex(secretA, 11, jobId);
      await recipientTaggingStore.updateHighestAgedIndex(secretA, 13, jobId);
      await recipientTaggingStore.updateHighestFinalizedIndex(secretB, 17, jobId);
      await kvStore.transactionAsync(() => recipientTaggingStore.commit(jobId));

      const highestAgedIndex = kvStore.openMap<string, number>('highest_aged_index');
      const highestFinalizedIndex = kvStore.openMap<string, number>('highest_finalized_index');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        highest_aged_index: await snapshotMap(highestAgedIndex),
        highest_finalized_index: await snapshotMap(highestFinalizedIndex),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
