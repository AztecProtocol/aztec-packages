import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotMap } from './kv_store_snapshot.js';

describe('KeyStore schema compatibility', () => {
  it('persists derived keys after adding an account', async () => {
    const kvStore = await openTmpStore('pxe-schema-key-store', true);
    try {
      const keyStore = new KeyStore(kvStore);

      await keyStore.addAccount(new Fr(2n), new Fr(3n));

      const keys = kvStore.openMap<string, Buffer>('key_store');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        key_store: await snapshotMap(keys),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
