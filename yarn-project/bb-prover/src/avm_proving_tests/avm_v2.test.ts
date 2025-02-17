import {
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  FunctionSelector,
} from '@aztec/circuits.js';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { PUBLIC_DISPATCH_SELECTOR } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { getAvmTestContractBytecode } from '@aztec/simulator/public/fixtures';

import { AvmProvingTesterV2 } from './avm_proving_tester.js';

const DISPATCH_FN_NAME = 'public_dispatch';
const DISPATCH_SELECTOR = new FunctionSelector(PUBLIC_DISPATCH_SELECTOR);

describe('AVM v2', () => {
  const sender = AztecAddress.fromNumber(42);
  const avmTestContractClassSeed = 0;
  const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
  let avmTestContractClass: ContractClassPublic;
  let avmTestContractInstance: ContractInstanceWithAddress;

  let tester: AvmProvingTesterV2;

  beforeEach(async () => {
    avmTestContractClass = await makeContractClassPublic(
      /*seed=*/ avmTestContractClassSeed,
      /*publicDispatchFunction=*/ { bytecode: avmTestContractBytecode, selector: DISPATCH_SELECTOR },
    );
    avmTestContractInstance = await makeContractInstanceFromClassId(
      avmTestContractClass.id,
      /*seed=*/ avmTestContractClassSeed,
    );
    tester = await AvmProvingTesterV2.create();
    await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
    await tester.addContractInstance(avmTestContractInstance);
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
      /*expectedClassId=*/ expectContractInstance.contractClassId.toField(),
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
