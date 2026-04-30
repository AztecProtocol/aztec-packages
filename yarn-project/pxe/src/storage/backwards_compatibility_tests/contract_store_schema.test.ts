import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BenchmarkingContractArtifact } from '@aztec/noir-test-contracts.js/Benchmarking';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { ContractStore } from '../contract_store/contract_store.js';
import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotMap } from './kv_store_snapshot.js';

describe('ContractStore schema compatibility', () => {
  it('persists registered contract artifacts, classes, and instances', async () => {
    const kvStore = await openTmpStore('pxe-schema-contract-store', true);
    try {
      const contractStore = new ContractStore(kvStore);

      // Register an artifact with a precomputed class so the `contract_classes` bytes are
      // controlled by primes rather than derived from `getContractClassFromArtifact`. Decouples
      // the snapshot from artifact-recompilation churn and from the hashing chain (which is
      // covered by stdlib tests, not by this schema test).
      const populatedClass = {
        version: 1 as const,
        id: new Fr(2n),
        artifactHash: new Fr(3n),
        privateFunctionsRoot: new Fr(5n),
        publicBytecodeCommitment: new Fr(7n),
        privateFunctions: [
          { selector: FunctionSelector.fromField(new Fr(11n)), vkHash: new Fr(13n) },
          { selector: FunctionSelector.fromField(new Fr(17n)), vkHash: new Fr(19n) },
        ],
        packedBytecode: Buffer.alloc(0),
      };
      await contractStore.addContractArtifact(BenchmarkingContractArtifact, populatedClass);

      // Same artifact, different class with empty `privateFunctions`. Pins the zero-length-vector
      // encoding for the private-functions field, which the populated case can't reach.
      await contractStore.addContractArtifact(BenchmarkingContractArtifact, {
        version: 1 as const,
        id: new Fr(23n),
        artifactHash: new Fr(29n),
        privateFunctionsRoot: new Fr(31n),
        publicBytecodeCommitment: new Fr(37n),
        privateFunctions: [],
        packedBytecode: Buffer.alloc(0),
      });

      // Re-register the populated class -- must hit the `#contractArtifactCache` short-circuit
      // and leave both `contract_artifacts` and `contract_classes` unchanged.
      await contractStore.addContractArtifact(BenchmarkingContractArtifact, populatedClass);

      // Register a contract instance with deterministic fields -- writes to `contracts_instances`.
      const publicKeys = new PublicKeys(
        new Point(new Fr(41n), new Fr(43n), false),
        new Point(new Fr(47n), new Fr(53n), false),
        new Point(new Fr(59n), new Fr(61n), false),
        new Point(new Fr(67n), new Fr(71n), false),
      );
      const instance = new SerializableContractInstance({
        version: 1,
        salt: new Fr(73n),
        deployer: AztecAddress.fromBigInt(79n),
        currentContractClassId: new Fr(83n),
        originalContractClassId: new Fr(89n),
        initializationHash: new Fr(97n),
        publicKeys,
      }).withAddress(AztecAddress.fromBigInt(101n));
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
