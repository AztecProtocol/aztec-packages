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
});
