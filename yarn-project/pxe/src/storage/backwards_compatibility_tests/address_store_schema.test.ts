import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { openPxeStores } from '../open_pxe_stores.js';
import { snapshotArray, snapshotMap } from './kv_store_snapshot.js';

/**
 * Schema-compatibility test for `AddressStore`. Drives `addCompleteAddress` with deterministic
 * `CompleteAddress`es and snapshots both LMDB sub-stores it owns. Reads the stores by name
 * (independent of `AddressStore`'s private views) so the snapshot reflects on-disk bytes
 * rather than re-serialised in-memory state.
 */
describe('AddressStore schema compatibility', () => {
  it('persists registered complete addresses', async () => {
    const kvStore = await openTmpStore('pxe-schema-address-store', true);
    try {
      const { addressStore } = openPxeStores(kvStore);

      const first = await CompleteAddress.fromSecretKeyAndPartialAddress(new Fr(2n), new Fr(3n));
      const second = await CompleteAddress.fromSecretKeyAndPartialAddress(new Fr(5n), new Fr(7n));
      await addressStore.addCompleteAddress(first);
      await addressStore.addCompleteAddress(second);

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
