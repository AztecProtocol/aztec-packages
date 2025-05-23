import { MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS } from '@aztec/constants';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { makeContractInstanceFromClassId } from '@aztec/stdlib/testing';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;

describe('AVM WitGen & Circuit – check circuit - contract class limits', () => {
  const deployer = AztecAddress.fromNumber(42);
  let instances: ContractInstanceWithAddress[];
  let tester: AvmProvingTester;
  let avmTestContractAddress: AztecAddress;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly=*/ true);
    // create enough unique contract classes to hit the limit
    instances = [];
    for (let i = 0; i <= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS; i++) {
      const instance = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        deployer,
        /*contractArtifact=*/ AvmTestContractArtifact,
        /*skipNullifierInsertion=*/ false,
        /*seed=*/ i,
      );
      instances.push(instance);
    }
    avmTestContractAddress = instances[0].address;
  });
  it.skip(
    'call the max number of unique contract classes',
    async () => {
      // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS contract addresses with unique class IDs
      const instanceAddresses = instances
        .map(instance => instance.address)
        .slice(0, MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS);

      // include the first contract again again at the end to ensure that we can call it even after the limit is reached
      instanceAddresses.push(instanceAddresses[0]);

      // include another contract address that reuses a class ID to ensure that we can call it even after the limit is reached
      const instanceSameClassAsFirstContract = await makeContractInstanceFromClassId(
        instances[0].currentContractClassId,
        /*seed=*/ 1000,
      );
      instanceAddresses.push(instanceSameClassAsFirstContract.address);
      // add it to the contract data source so it is found
      await tester.addContractInstance(instanceSameClassAsFirstContract);

      await tester.simProveVerifyAppLogic(
        {
          address: avmTestContractAddress,
          fnName: 'nested_call_to_add_n_times_different_addresses',
          args: [instanceAddresses],
        },
        /*expectRevert=*/ false,
      );
    },
    TIMEOUT,
  );
  it.skip(
    'attempt too many calls to unique contract class ids',
    async () => {
      // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+1 contract addresses with unique class IDs
      // should fail because we are trying to call MAX+1 unique class IDs
      const instanceAddresses = instances.map(instance => instance.address);
      // push an empty one (just padding to match function calldata size of MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+2)
      instanceAddresses.push(AztecAddress.zero());
      await tester.simProveVerifyAppLogic(
        {
          address: avmTestContractAddress,
          fnName: 'nested_call_to_add_n_times_different_addresses',
          args: [instanceAddresses],
        },
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
});
