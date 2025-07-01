import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;

describe.skip('AVM WitGen & Circuit – check circuit', () => {
  const sender = AztecAddress.fromNumber(42);
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true);
    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });

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
    const tester = await AvmProvingTester.new(/*checkCircuitOnly=*/ true);
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
