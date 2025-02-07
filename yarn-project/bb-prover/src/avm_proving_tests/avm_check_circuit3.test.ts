import {
  AztecAddress,
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

describe('AVM WitGen & Circuit – check circuit', () => {
  const sender = AztecAddress.fromNumber(42);
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
    tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
    await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
    await tester.addContractInstance(avmTestContractInstance);
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
