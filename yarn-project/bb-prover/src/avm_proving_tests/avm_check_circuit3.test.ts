import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { L2ToL1Message, ScopedL2ToL1Message } from '@aztec/stdlib/messaging';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 100_000;

describe('AVM check-circuit – unhappy paths 3', () => {
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
        /*appCalls=*/ [{ address: avmTestContractInstance.address, fnName: 'divide_by_zero', args: [0] }],
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
        /*appCalls=*/ [{ address: avmTestContractInstance.address, fnName: 'divide_by_zero', args: [0] }],
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
    'top-level exceptional halt in app logic, and remaining app logic calls are skipped, no teardown',
    async () => {
      await tester.simProveVerify(
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
          { address: avmTestContractInstance.address, fnName: 'divide_by_zero', args: [0] },
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
        ],
        /*teardownCall=*/ undefined,
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );

  it(
    'top-level exceptional halt in app logic, remaining app logic calls are skipped, and teardown is fine',
    async () => {
      await tester.simProveVerify(
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
          { address: avmTestContractInstance.address, fnName: 'divide_by_zero', args: [0] },
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
        ],
        // and progression to teardown should be fine!
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
    'top-level exceptional halt during revertible nullifiers (collision), remaining revertibles are skipped, and teardown is fine',
    async () => {
      await tester.simProveVerify(
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          // skipped after nullifier collision
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
        ],
        // and progression to teardown should be fine!
        /*teardownCall=*/ {
          address: avmTestContractInstance.address,
          fnName: 'add_args_return',
          args: [new Fr(1), new Fr(2)],
        },
        /*expectRevert=*/ true,
        /*feePayer=*/ sender,
        /*privateInsertions=*/ {
          revertible: {
            // nullifier collision ends revertible insertions and skips to teardown
            nullifiers: [
              new Fr(66666),
              new Fr(42000),
              /*duplicate*/ new Fr(66666),
              /*rest are skipped*/ new Fr(11111),
              new Fr(22222),
            ],
            // skipped ...
            noteHashes: [new Fr(11111), new Fr(22222), new Fr(33333), new Fr(44444), new Fr(55555)],
            // skipped ...
            l2ToL1Msgs: [
              new ScopedL2ToL1Message(
                new L2ToL1Message(EthAddress.fromNumber(0x1111), new Fr(0xdddd)),
                AztecAddress.fromNumber(0x1111),
              ),
              new ScopedL2ToL1Message(
                new L2ToL1Message(EthAddress.fromNumber(0x2222), new Fr(0xeeee)),
                AztecAddress.fromNumber(0x2222),
              ),
              new ScopedL2ToL1Message(
                new L2ToL1Message(EthAddress.fromNumber(0x3333), new Fr(0xffff)),
                AztecAddress.fromNumber(0x3333),
              ),
            ],
          },
          nonRevertible: {
            nullifiers: [/*firstNullifier=*/ new Fr(66000)], // required
          },
        },
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
        /*teardownCall=*/ { address: avmTestContractInstance.address, fnName: 'divide_by_zero', args: [0] },
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
