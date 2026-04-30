import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { openPxeStores } from '../open_pxe_stores.js';
import { snapshotMap } from './snapshot_kv_entries.js';

describe('SenderAddressBookStore schema compatibility', () => {
  it('persists registered senders', async () => {
    const kvStore = await openTmpStore('pxe-schema-sender-address-book', true);
    try {
      const { senderAddressBookStore } = openPxeStores(kvStore);

      await senderAddressBookStore.addSender(AztecAddress.fromBigInt(2n));
      await senderAddressBookStore.addSender(AztecAddress.fromBigInt(3n));
      await senderAddressBookStore.addSender(AztecAddress.fromBigInt(5n));

      const addressBook = kvStore.openMap<string, true>('address_book');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        address_book: await snapshotMap(addressBook),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
