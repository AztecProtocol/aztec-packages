import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { CapsuleStore } from '../capsule_store/capsule_store.js';
import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotMap } from './kv_store_snapshot.js';

describe('CapsuleStore schema compatibility', () => {
  it('persists set capsules after commit', async () => {
    const kvStore = await openTmpStore('pxe-schema-capsule-store', true);
    try {
      const capsuleStore = new CapsuleStore(kvStore);

      const jobId = 'fixture-job';
      const contractAddress = AztecAddress.fromBigInt(2n);
      const scope = AztecAddress.fromBigInt(3n);

      capsuleStore.setCapsule(contractAddress, new Fr(5n), [new Fr(7n), new Fr(11n)], jobId, scope);
      capsuleStore.setCapsule(contractAddress, new Fr(13n), [new Fr(17n)], jobId, scope);
      capsuleStore.setCapsule(contractAddress, new Fr(19n), [], jobId, scope);
      await kvStore.transactionAsync(() => capsuleStore.commit(jobId));

      const capsules = kvStore.openMap<string, Buffer>('capsules');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        capsules: await snapshotMap(capsules),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
