import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { AddressStore } from '../address_store/address_store.js';
import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotArray, snapshotMap } from './kv_store_snapshot.js';

/**
 * Schema-compatibility test for `AddressStore`.
 */
describe('AddressStore schema compatibility', () => {
  it('persists registered complete addresses', async () => {
    const kvStore = await openTmpStore('pxe-schema-address-store', true);
    try {
      const addressStore = new AddressStore(kvStore);

      const first = await CompleteAddress.fromSecretKeyAndPartialAddress(new Fr(2n), new Fr(3n));
      const second = await CompleteAddress.fromSecretKeyAndPartialAddress(new Fr(5n), new Fr(7n));
      await addressStore.addCompleteAddress(first);
      await addressStore.addCompleteAddress(second);
      // Re-adding an already-registered address must be a no-op: duplicate detection should leave
      // both sub-stores unchanged. If this regresses, the snapshot picks up an extra array entry.
      await addressStore.addCompleteAddress(first);

      const completeAddresses = kvStore.openArray<Buffer>('complete_addresses');
      const completeAddressIndex = kvStore.openMap<string, number>('complete_address_index');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        complete_addresses: await snapshotArray(completeAddresses),
        complete_address_index: await snapshotMap(completeAddressIndex),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
