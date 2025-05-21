import { MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { makeContractInstanceFromClassId } from '@aztec/stdlib/testing';

import { AvmSimulationTester } from '../fixtures/avm_simulation_tester.js';

describe('AVM simulator apps tests: AvmTestContract', () => {
  const deployer = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(4200);
  let testContractAddress: AztecAddress;
  let instances: ContractInstanceWithAddress[];
  let simTester: AvmSimulationTester;

  beforeEach(async () => {
    simTester = await AvmSimulationTester.create();
    // create enough unique contract classes to hit the limit
    instances = [];
    for (let i = 0; i <= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS; i++) {
      const instance = await simTester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        deployer,
        /*contractArtifact=*/ AvmTestContractArtifact,
        /*skipNullifierInsertion=*/ false,
        /*seed=*/ i,
      );
      instances.push(instance);
    }
    testContractAddress = instances[0].address;
  });

  it('bulk testing', async () => {
    // Get a deployed contract instance to pass to the contract
    // for it to use as "expected" values when testing contract instance retrieval.
    const expectContractInstance = instances[1];
    const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const args = [
      argsField,
      argsU8,
      /*getInstanceForAddress=*/ expectContractInstance.address,
      /*expectedDeployer=*/ expectContractInstance.deployer,
      /*expectedClassId=*/ expectContractInstance.currentContractClassId,
      /*expectedInitializationHash=*/ expectContractInstance.initializationHash,
    ];
    const results = await simTester.simulateCall(sender, /*address=*/ testContractAddress, 'bulk_testing', args);
    expect(results.reverted).toBe(false);
  });

  it('call max unique contract classes', async () => {
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
    await simTester.addContractInstance(instanceSameClassAsFirstContract);

    const results = await simTester.simulateCall(
      sender,
      /*address=*/ testContractAddress,
      'nested_call_to_add_n_times_different_addresses',
      /*args=*/ [instanceAddresses],
    );
    expect(results.reverted).toBe(false);
  });

  it('call too many unique contract classes fails', async () => {
    // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+1 contract addresses with unique class IDs
    // should fail because we are trying to call MAX+1 unique class IDs
    const instanceAddresses = instances.map(instance => instance.address.toField());
    // push an empty one (just padding to match function calldata size of MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+2)
    instanceAddresses.push(new Fr(0));
    const results = await simTester.simulateCall(
      sender,
      /*address=*/ testContractAddress,
      'nested_call_to_add_n_times_different_addresses',
      /*args=*/ [instanceAddresses],
    );
    expect(results.reverted).toBe(true);
  });

  it('an exceptional halt due to a nested call to non-existent contract is recovered from in caller', async () => {
    await simTester.simulateCall(
      sender,
      /*address=*/ testContractAddress,
      'nested_call_to_nothing_recovers',
      /*args=*/ [],
    );
  });
});
