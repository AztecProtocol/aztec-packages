import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BenchmarkingContractArtifact } from '@aztec/noir-test-contracts.js/Benchmarking';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { openPxeStores } from '../open_pxe_stores.js';
import { snapshotMap } from './snapshot_kv_entries.js';

describe('ContractStore schema compatibility', () => {
  it('persists registered contract artifacts and instances', async () => {
    const kvStore = await openTmpStore('pxe-schema-contract-store', true);
    try {
      const { contractStore } = openPxeStores(kvStore);

      // Register an artifact -- this writes to both `contract_artifacts` and `contract_classes`.
      await contractStore.addContractArtifact(BenchmarkingContractArtifact);

      // Register a contract instance with deterministic fields -- writes to `contracts_instances`.
      const publicKeys = new PublicKeys(
        new Point(new Fr(31n), new Fr(37n), false),
        new Point(new Fr(41n), new Fr(43n), false),
        new Point(new Fr(47n), new Fr(53n), false),
        new Point(new Fr(59n), new Fr(61n), false),
      );
      const instance = new SerializableContractInstance({
        version: 1,
        salt: new Fr(2n),
        deployer: AztecAddress.fromBigInt(3n),
        currentContractClassId: new Fr(5n),
        originalContractClassId: new Fr(7n),
        initializationHash: new Fr(11n),
        publicKeys,
      }).withAddress(AztecAddress.fromBigInt(13n));
      await contractStore.addContractInstance(instance);

      const contractArtifacts = kvStore.openMap<string, Buffer>('contract_artifacts');
      const contractClasses = kvStore.openMap<string, Buffer>('contract_classes');
      const contractInstances = kvStore.openMap<string, Buffer>('contracts_instances');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        contract_artifacts: await snapshotMap(contractArtifacts),
        contract_classes: await snapshotMap(contractClasses),
        contracts_instances: await snapshotMap(contractInstances),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
