import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { type ContractInstanceWithAddress } from '@aztec/circuits.js/contract';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';

import { AvmProvingTesterV2 } from './avm_proving_tester.js';

describe('AVM v2', () => {
  const sender = AztecAddress.fromNumber(42);
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTesterV2;

  beforeEach(async () => {
    tester = await AvmProvingTesterV2.create();
    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });

  it('bulk_testing v2', async () => {
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

    await tester.simProveVerifyV2(
      sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [{ address: avmTestContractInstance.address, fnName: 'bulk_testing', args }],
      /*teardownCall=*/ undefined,
      /*expectRevert=*/ false,
    );
  }, 180_000);
});
