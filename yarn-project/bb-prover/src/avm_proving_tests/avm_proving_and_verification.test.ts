import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  FunctionSelector,
  PUBLIC_DISPATCH_SELECTOR,
} from '@aztec/circuits.js';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { getAvmTestContractBytecode } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;
const DISPATCH_FN_NAME = 'public_dispatch';
const DISPATCH_SELECTOR = new FunctionSelector(PUBLIC_DISPATCH_SELECTOR);

describe('AVM WitGen & Circuit – proving and verification', () => {
  const avmTestContractClassSeed = 0;
  const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
  let avmTestContractClass: ContractClassPublic;
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    avmTestContractClass = await makeContractClassPublic(
      /*seed=*/ avmTestContractClassSeed,
      /*publicDispatchFunction=*/ { bytecode: avmTestContractBytecode, selector: DISPATCH_SELECTOR },
    );
    avmTestContractInstance = await makeContractInstanceFromClassId(
      avmTestContractClass.id,
      /*seed=*/ avmTestContractClassSeed,
    );
    tester = await AvmProvingTester.create(/*checkCircuitOnly*/ false);
    await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
    await tester.addContractInstance(avmTestContractInstance);
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
        /*expectedClassId=*/ expectContractInstance.contractClassId.toField(),
        /*expectedInitializationHash=*/ expectContractInstance.initializationHash.toField(),
      ];

      await tester.simProveVerifyAppLogic({ address: avmTestContractInstance.address, fnName: 'bulk_testing', args });
    },
    TIMEOUT,
  );
});
