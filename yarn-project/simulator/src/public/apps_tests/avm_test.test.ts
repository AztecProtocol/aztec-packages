import { AztecAddress, type ContractInstanceWithAddress } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';

import { PublicTxSimulationTester } from '../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: AvmTestContract', () => {
  const deployer = AztecAddress.fromNumber(42);

  let avmTestContract: ContractInstanceWithAddress;
  let simTester: PublicTxSimulationTester;

  beforeEach(async () => {
    simTester = await PublicTxSimulationTester.create();

    avmTestContract = await simTester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      deployer,
      /*contractArtifact=*/ AvmTestContractArtifact,
    );
  });

  it('bulk testing', async () => {
    // Get a deployed contract instance to pass to the contract
    // for it to use as "expected" values when testing contract instance retrieval.
    const expectContractInstance = avmTestContract;
    const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const args = [
      argsField,
      argsU8,
      /*getInstanceForAddress=*/ expectContractInstance.address.toField(),
      /*expectedDeployer=*/ expectContractInstance.deployer.toField(),
      /*expectedClassId=*/ expectContractInstance.contractClassId.toField(),
      /*expectedInitializationHash=*/ expectContractInstance.initializationHash.toField(),
    ];

    const bulkResult = await simTester.simulateTx(
      /*sender=*/ deployer,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmTestContract.address,
          fnName: 'bulk_testing',
          args,
        },
      ],
    );
    expect(bulkResult.revertCode.isOK()).toBe(true);
  });
});
