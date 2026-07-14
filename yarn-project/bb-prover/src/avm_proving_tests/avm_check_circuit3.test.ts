import { MAX_NULLIFIERS_PER_TX, MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT, MAX_PROCESSABLE_L2_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Gas } from '@aztec/stdlib/gas';
import { L2ToL1Message, ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { NativeWorldStateService } from '@aztec/world-state';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 100_000;

describe('AVM check-circuit – unhappy paths 3', () => {
  const sender = AztecAddress.fromNumberUnsafe(42);
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(worldStateService, /*checkCircuitOnly*/ true);
    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumberUnsafe(420),
      AvmTestContractArtifact,
    );
  });

  afterEach(async () => {
    await worldStateService.close();
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
    'top-level exceptional halt during revertible nullifiers (limit reached), remaining revertibles are skipped, and teardown is fine',
    async () => {
      // Note: nullifier *collisions* during revertible insertions are unprovable (not revertible),
      // so we use the side-effect limit path to exercise the skip-to-teardown behavior.
      // 1 non-revertible + MAX_NULLIFIERS_PER_TX revertible exceeds the limit on the last revertible
      // nullifier insertion; subsequent revertible note hashes and L2→L1 messages are skipped.
      const revertibleNullifiers = Array.from({ length: MAX_NULLIFIERS_PER_TX }, (_, i) => new Fr(100_000 + i));
      await tester.simProveVerify(
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          // skipped after the revertible insertion failure
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
            nullifiers: revertibleNullifiers,
            // skipped ...
            noteHashes: [new Fr(11111), new Fr(22222), new Fr(33333), new Fr(44444), new Fr(55555)],
            // skipped ...
            l2ToL1Msgs: [
              new ScopedL2ToL1Message(
                new L2ToL1Message(EthAddress.fromNumber(0x1111), new Fr(0xdddd)),
                AztecAddress.fromNumberUnsafe(0x1111),
              ),
              new ScopedL2ToL1Message(
                new L2ToL1Message(EthAddress.fromNumber(0x2222), new Fr(0xeeee)),
                AztecAddress.fromNumberUnsafe(0x2222),
              ),
              new ScopedL2ToL1Message(
                new L2ToL1Message(EthAddress.fromNumber(0x3333), new Fr(0xffff)),
                AztecAddress.fromNumberUnsafe(0x3333),
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
      // The contract requires >200k DA gas (it allocates da_gas_left - 200_000 to the nested call).
      // Use a higher DA gas limit than the default since the per-block DA share is ~196k at 4 blocks/checkpoint.
      const gasLimits = new Gas(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT, MAX_PROCESSABLE_L2_GAS);
      await tester.simProveVerifyAppLogic(
        { address: avmTestContractInstance.address, fnName: 'external_call_to_divide_by_zero_recovers', args: [] },
        /*expectRevert=*/ false,
        /*txLabel=*/ 'unlabeledTx',
        gasLimits,
      );
    },
    TIMEOUT,
  );
});
