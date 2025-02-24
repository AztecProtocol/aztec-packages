import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { type ContractInstanceWithAddress } from '@aztec/circuits.js/contract';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;

describe('AVM WitGen & Circuit – proving and verification', () => {
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.create(/*checkCircuitOnly*/ false);
    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });

  it(
    'bulk_testing v1',
    async () => {
      // Get a deployed contract instance to pass to the contract
      // for it to use as "expected" values when testing contract instance retrieval.
      const expectContractInstance = avmTestContractInstance;
      const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
      const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
      const args = [
        argsField,
        argsU8,
        /*getInstanceForAddress=*/ expectContractInstance.address.toField(),
        /*expectedDeployer=*/ expectContractInstance.deployer.toField(),
        /*expectedClassId=*/ expectContractInstance.currentContractClassId.toField(),
        /*expectedInitializationHash=*/ expectContractInstance.initializationHash.toField(),
      ];

      await tester.simProveVerifyAppLogic({ address: avmTestContractInstance.address, fnName: 'bulk_testing', args });
    },
    TIMEOUT,
  );
});
