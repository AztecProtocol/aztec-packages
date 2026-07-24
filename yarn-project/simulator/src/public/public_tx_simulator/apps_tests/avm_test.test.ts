import { MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { makeContractInstanceFromClassId } from '@aztec/stdlib/testing';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { bulkTest } from '../../fixtures/bulk_test.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: AvmTestContract', () => {
  const logger = createLogger('avm-test-contract-tests');

  let worldStateService: NativeWorldStateService;
  let simTester: PublicTxSimulationTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    simTester = await PublicTxSimulationTester.create(
      worldStateService,
      /*globals=*/ undefined,
      /*metrics=*/ undefined,
    );
  });

  afterEach(async () => {
    await simTester.close();
    await worldStateService.close();
  });

  it('bulk testing', async () => {
    const result = await bulkTest(simTester, logger, AvmTestContractArtifact);
    expect(result.revertCode.isOK()).toBe(true);
    // The simulator reports how many AVM instructions the tx executed; the bulk test runs many.
    expect(result.totalInstructionsExecuted).toBeGreaterThan(0);
  });

  describe('unique contract class limit and exceptional halts', () => {
    const deployer = AztecAddress.fromNumberUnsafe(42);
    const sender = AztecAddress.fromNumberUnsafe(4200);
    let instances: ContractInstanceWithAddress[];
    let testContractAddress: AztecAddress;

    beforeEach(async () => {
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

    it('call max unique contract classes', async () => {
      // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS contract addresses with unique class IDs
      const instanceAddresses = instances
        .map(instance => instance.address)
        .slice(0, MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS);

      // include the first contract again at the end to ensure that we can call it even after the limit is reached
      instanceAddresses.push(instanceAddresses[0]);

      // include another contract address that reuses a class ID to ensure that we can call it even after the limit is reached
      const instanceSameClassAsFirstContract = await makeContractInstanceFromClassId(
        instances[0].currentContractClassId,
        /*seed=*/ 1000,
      );
      instanceAddresses.push(instanceSameClassAsFirstContract.address);
      // add it to the contract data source so it is found
      await simTester.addContractInstance(instanceSameClassAsFirstContract);

      const result = await simTester.simulateTxWithLabel(
        /*txLabel=*/ 'AvmTest/nested_call_to_add_n_times_different_addresses',
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: testContractAddress,
            fnName: 'nested_call_to_add_n_times_different_addresses',
            args: [instanceAddresses],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('call too many unique contract classes fails', async () => {
      // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+1 contract addresses with unique class IDs
      // should fail because we are trying to call MAX+1 unique class IDs
      const instanceAddresses = instances.map(instance => instance.address.toField());
      // push an empty one (just padding to match function calldata size of MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+2)
      instanceAddresses.push(new Fr(0));
      const result = await simTester.simulateTxWithLabel(
        /*txLabel=*/ 'AvmTest/nested_call_to_add_n_times_different_addresses_too_many',
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: testContractAddress,
            fnName: 'nested_call_to_add_n_times_different_addresses',
            args: [instanceAddresses],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(false);
    });

    it('an exceptional halt due to a nested call to non-existent contract is recovered from in caller', async () => {
      const result = await simTester.simulateTxWithLabel(
        /*txLabel=*/ 'AvmTest/nested_call_to_nothing_recovers',
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: testContractAddress,
            fnName: 'nested_call_to_nothing_recovers',
            args: [],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });
  });
});
