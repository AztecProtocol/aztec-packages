import {
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  FunctionSelector,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_PUBLIC_LOGS_PER_TX,
  PUBLIC_DISPATCH_SELECTOR,
} from '@aztec/circuits.js';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { type ProtocolContract } from '@aztec/protocol-contracts';
import { FeeJuiceArtifact, getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { getAvmTestContractBytecode } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester, AvmProvingTesterV2 } from './avm_proving_tester.js';

const TIMEOUT = 300_000;
const DISPATCH_FN_NAME = 'public_dispatch';
const DISPATCH_SELECTOR = new FunctionSelector(PUBLIC_DISPATCH_SELECTOR);

describe('AVM WitGen & Circuit', () => {
  describe('proving and verification', () => {
    const avmTestContractClassSeed = 0;
    const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
    let avmTestContractClass: ContractClassPublic;
    let avmTestContractInstance: ContractInstanceWithAddress;
    let tester: AvmProvingTester;

    beforeEach(async () => {
      avmTestContractClass = makeContractClassPublic(
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

  describe('check circuit', () => {
    const sender = AztecAddress.fromNumber(42);
    const avmTestContractClassSeed = 0;
    const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
    let avmTestContractClass: ContractClassPublic;
    let avmTestContractInstance: ContractInstanceWithAddress;
    let tester: AvmProvingTester;

    beforeEach(async () => {
      avmTestContractClass = makeContractClassPublic(
        /*seed=*/ avmTestContractClassSeed,
        /*publicDispatchFunction=*/ { bytecode: avmTestContractBytecode, selector: DISPATCH_SELECTOR },
      );
      avmTestContractInstance = await makeContractInstanceFromClassId(
        avmTestContractClass.id,
        /*seed=*/ avmTestContractClassSeed,
      );
      tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
      await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
      await tester.addContractInstance(avmTestContractInstance);
    });

    it(
      'perform too many storage writes and revert',
      async () => {
        await tester.simProveVerifyAppLogic(
          {
            address: avmTestContractInstance.address,
            fnName: 'n_storage_writes',
            args: [new Fr(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1)],
          },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'create too many note hashes and revert',
      async () => {
        await tester.simProveVerifyAppLogic(
          {
            address: avmTestContractInstance.address,
            fnName: 'n_new_note_hashes',
            args: [new Fr(MAX_NOTE_HASHES_PER_TX + 1)],
          },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'create too many nullifiers and revert',
      async () => {
        await tester.simProveVerifyAppLogic(
          {
            address: avmTestContractInstance.address,
            fnName: 'n_new_nullifiers',
            args: [new Fr(MAX_NULLIFIERS_PER_TX + 1)],
          },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'create too many l2tol1 messages and revert',
      async () => {
        await tester.simProveVerifyAppLogic(
          {
            address: avmTestContractInstance.address,
            fnName: 'n_new_l2_to_l1_msgs',
            args: [new Fr(MAX_L2_TO_L1_MSGS_PER_TX + 1)],
          },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'create too many public logs and revert',
      async () => {
        await tester.simProveVerifyAppLogic(
          {
            address: avmTestContractInstance.address,
            fnName: 'n_new_public_logs',
            args: [new Fr(MAX_PUBLIC_LOGS_PER_TX + 1)],
          },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'top-level exceptional halts in both app logic and teardown',
      async () => {
        await tester.simProveVerify(
          sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [{ address: avmTestContractInstance.address, fnName: 'divide_by_zero', args: [] }],
          /*teardownCall=*/ undefined,
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'top-level exceptional halt in app logic, but teardown succeeds',
      async () => {
        await tester.simProveVerify(
          sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [{ address: avmTestContractInstance.address, fnName: 'divide_by_zero', args: [] }],
          /*teardownCall=*/ {
            address: avmTestContractInstance.address,
            fnName: 'add_args_return',
            args: [new Fr(1), new Fr(2)],
          },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'top-level exceptional halt in teardown, but app logic succeeds',
      async () => {
        await tester.simProveVerify(
          sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
          ],
          /*teardownCall=*/ { address: avmTestContractInstance.address, fnName: 'divide_by_zero', args: [] },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'a nested exceptional halt propagate to top-level',
      async () => {
        await tester.simProveVerifyAppLogic(
          { address: avmTestContractInstance.address, fnName: 'external_call_to_divide_by_zero', args: [] },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'a nested exceptional halt is recovered from in caller',
      async () => {
        await tester.simProveVerifyAppLogic(
          { address: avmTestContractInstance.address, fnName: 'external_call_to_divide_by_zero_recovers', args: [] },
          /*expectRevert=*/ false,
        );
      },
      TIMEOUT,
    );
    it(
      'an exceptional halt due to a nested call to non-existent contract is propagated to top-level',
      async () => {
        await tester.simProveVerifyAppLogic(
          { address: avmTestContractInstance.address, fnName: 'nested_call_to_nothing', args: [] },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
    it(
      'an exceptional halt due to a nested call to non-existent contract is recovered from in caller',
      async () => {
        await tester.simProveVerifyAppLogic(
          { address: avmTestContractInstance.address, fnName: 'nested_call_to_nothing_recovers', args: [] },
          /*expectRevert=*/ false,
        );
      },
      TIMEOUT,
    );
    // FIXME(dbanks12): fails with "Lookup PERM_MAIN_ALU failed."
    it.skip('top-level exceptional halts due to a non-existent contract in app-logic and teardown', async () => {
      // don't insert contracts into trees, and make sure retrieval fails
      const tester = await AvmProvingTester.create(/*checkCircuitOnly=*/ true, /*skipContractDeployments=*/ true);
      await tester.simProveVerify(
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
        ],
        /*teardownCall=*/ {
          address: avmTestContractInstance.address,
          fnName: 'add_args_return',
          args: [new Fr(1), new Fr(2)],
        },
        /*expectRevert=*/ true,
      );
    });
    it(
      'enqueued calls in every phase, with enqueued calls that depend on each other',
      async () => {
        await tester.simProveVerify(
          sender,
          /*setupCalls=*/ [
            { address: avmTestContractInstance.address, fnName: 'read_assert_storage_single', args: [new Fr(0)] },
            { address: avmTestContractInstance.address, fnName: 'set_storage_single', args: [new Fr(5)] },
          ],
          /*appCalls=*/ [
            { address: avmTestContractInstance.address, fnName: 'read_assert_storage_single', args: [new Fr(5)] },
            { address: avmTestContractInstance.address, fnName: 'set_storage_single', args: [new Fr(10)] },
          ],
          /*teardownCall=*/ {
            address: avmTestContractInstance.address,
            fnName: 'read_assert_storage_single',
            args: [new Fr(10)],
          },
          /*expectRevert=*/ false,
        );
      },
      TIMEOUT,
    );
    it(
      'Should prove and verify a TX that reverts in teardown',
      async () => {
        await tester.simProveVerify(
          sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [],
          /*teardownCall=*/ {
            address: avmTestContractInstance.address,
            fnName: 'read_assert_storage_single',
            args: [new Fr(10)],
          },
          /*expectRevert=*/ true,
        );
      },
      TIMEOUT,
    );
  });

  describe('check circuit - contract class limits', () => {
    const deployer = AztecAddress.fromNumber(42);
    let instances: ContractInstanceWithAddress[];
    let tester: AvmProvingTester;
    let avmTestContractAddress: AztecAddress;

    beforeEach(async () => {
      tester = await AvmProvingTester.create(/*checkCircuitOnly=*/ true);
      // create enough unique contract classes to hit the limit
      instances = [];
      for (let i = 0; i <= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS; i++) {
        const instance = await tester.registerAndDeployContract(
          /*constructorArgs=*/ [],
          deployer,
          /*contractArtifact=*/ AvmTestContractArtifact,
          /*seed=*/ i,
        );
        instances.push(instance);
      }
      avmTestContractAddress = instances[0].address;
    });
    it(
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
          instances[0].contractClassId,
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
    it(
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

  // Add instance & class for fee juice token contract
  // Initialize balance of payer
  // Include payer in TX
  describe('public fee payment', () => {
    const sender = AztecAddress.fromNumber(42);
    const feePayer = sender;

    const initialFeeJuiceBalance = new Fr(10000);
    let feeJuice: ProtocolContract;
    let feeJuiceContractClassPublic: ContractClassPublic;

    const avmTestContractClassSeed = 0;
    const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
    let avmTestContractClass: ContractClassPublic;
    let avmTestContractInstance: ContractInstanceWithAddress;
    let tester: AvmProvingTester;

    beforeEach(async () => {
      feeJuice = await getCanonicalFeeJuice();
      feeJuiceContractClassPublic = {
        ...feeJuice.contractClass,
        privateFunctions: [],
        unconstrainedFunctions: [],
      };
      avmTestContractClass = makeContractClassPublic(
        /*seed=*/ avmTestContractClassSeed,
        /*publicDispatchFunction=*/ { bytecode: avmTestContractBytecode, selector: DISPATCH_SELECTOR },
      );
      avmTestContractInstance = await makeContractInstanceFromClassId(
        avmTestContractClass.id,
        /*seed=*/ avmTestContractClassSeed,
      );
      tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
      await tester.addContractClass(feeJuiceContractClassPublic, FeeJuiceArtifact);
      await tester.addContractInstance(feeJuice.instance);
      await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
      await tester.addContractInstance(avmTestContractInstance);
      await tester.setFeePayerBalance(feePayer, initialFeeJuiceBalance);
    });
    it(
      'fee payment',
      async () => {
        await tester.simProveVerify(
          sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
          ],
          /*teardownCall=*/ undefined,
          /*expectRevert=*/ false,
          feePayer,
        );
      },
      TIMEOUT,
    );
  });
});

describe('AVM v2', () => {
  const sender = AztecAddress.fromNumber(42);
  const avmTestContractClassSeed = 0;
  const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
  let avmTestContractClass: ContractClassPublic;
  let avmTestContractInstance: ContractInstanceWithAddress;

  let tester: AvmProvingTesterV2;

  beforeEach(async () => {
    avmTestContractClass = makeContractClassPublic(
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
