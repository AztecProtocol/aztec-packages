import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, type ContractInstanceWithAddress } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
import type { PublicStorageOverride, Wallet } from '@aztec/aztec.js/wallet';
import { AvmInitializerTestContract } from '@aztec/noir-test-contracts.js/AvmInitializerTest';
import { AvmTestContract } from '@aztec/noir-test-contracts.js/AvmTest';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 600_000;

describe('e2e_avm_simulator', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let aztecNode: AztecNode;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      aztecNode,
      accounts: [defaultAccountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
  });

  afterAll(() => teardown());

  describe('AvmTestContract', () => {
    // Read-only / non-mutating tests share a single deployment to keep slot-paced deploy txs
    // out of the per-test critical path under proposer pipelining.
    describe('with shared deployment', () => {
      let avmContract: AvmTestContract;
      let avmContractInstance: ContractInstanceWithAddress;

      beforeAll(async () => {
        ({ contract: avmContract, instance: avmContractInstance } = await AvmTestContract.deploy(wallet).send({
          from: defaultAccountAddress,
        }));
      });

      describe('Assertions & error enriching', () => {
        /**
         * Expect an error like:
         * Assertion failed: This assertion should fail! 'assert(not_true == true, "This assertion should fail!")'
         * ...
         * at assert(not_true == true, "This assertion should fail!") (../../../../../../../home/aztec-dev/aztec-packages/noir-projects/noir-contracts/contracts/test/avm_test_contract/src/main.nr:223:5)
         * at inner_helper_with_failed_assertion() (../../../../../../../home/aztec-dev/aztec-packages/noir-projects/noir-contracts/contracts/test/avm_test_contract/src/main.nr:228:9)
         * at quote { $self } (../std/meta/expr.nr:269:9)
         * at function.name();
         * let call = quote { $name($args) (/home/aztec-dev/aztec-packages/noir-projects/aztec-nr/aztec/src/macros/dispatch.nr:59:20)
         * at AvmTest.0xc3515746
         */
        describe('Not nested', () => {
          it('PXE processes user code assertions and recovers message (properly enriched)', async () => {
            await expect(
              avmContract.methods.assertion_failure().simulate({ from: defaultAccountAddress }),
            ).rejects.toThrow(
              expect.objectContaining({
                message: expect.stringMatching(
                  /Assertion failed: This assertion should fail! 'assert\(not_true == true, "This assertion should fail!"\)'/,
                ),
                stack: expect.stringMatching(/at inner_helper_with_failed_assertion[\s\S]*at AvmTest\..*/),
              }),
            );
          });
          it('PXE processes user code assertions and recovers message (complex)', async () => {
            await expect(
              avmContract.methods.assert_nullifier_exists(123).simulate({ from: defaultAccountAddress }),
            ).rejects.toThrow("Assertion failed: Nullifier doesn't exist!");
          });
          it('PXE processes intrinsic assertions and recovers message', async () => {
            await expect(
              avmContract.methods.divide_by_zero(0).simulate({ from: defaultAccountAddress }),
            ).rejects.toThrow('Division by zero');
          });
        });
        describe('Nested', () => {
          it('PXE processes user code assertions and recovers message', async () => {
            await expect(
              avmContract.methods.external_call_to_assertion_failure().simulate({ from: defaultAccountAddress }),
            ).rejects.toThrow('Assertion failed: This assertion should fail!');
          });
          it('PXE processes intrinsic assertions and recovers message', async () => {
            await expect(
              avmContract.methods.external_call_to_divide_by_zero().simulate({ from: defaultAccountAddress }),
            ).rejects.toThrow('Division by zero');
          });
        });
      });

      describe('From private', () => {
        it('Should enqueue a public function correctly', async () => {
          const request = await avmContract.methods.enqueue_public_from_private().request();
          const simulation = await wallet.simulateTx(request, { from: defaultAccountAddress });
          expect(simulation.publicOutput!.revertReason).toBeUndefined();
        });
      });

      describe('Gas metering', () => {
        it('Tracks L2 gas usage on simulation', async () => {
          const request = await avmContract.methods.add_args_return(20n, 30n).request();
          const simulation = await wallet.simulateTx(request, { from: defaultAccountAddress });
          // Subtract the teardown gas from the total gas to figure out the gas used by the contract logic.
          const l2TeardownGas = simulation.publicOutput!.gasUsed.teardownGas.l2Gas;
          const l2GasUsed = simulation.publicOutput!.gasUsed.totalGas.l2Gas - l2TeardownGas;
          // L2 gas used will vary a lot depending on codegen and other factors,
          // so we just set a wide range for it, and check it's not a suspiciously round number.
          expect(l2GasUsed).toBeGreaterThan(150);
          expect(l2GasUsed).toBeLessThan(1e6);
          expect(l2GasUsed! % 1000).not.toEqual(0);
        });
      });

      describe('Contract instance', () => {
        it('Works', async () => {
          const { receipt: tx } = await avmContract.methods
            .test_get_contract_instance_matches(
              avmContract.address,
              avmContractInstance.deployer,
              avmContractInstance.currentContractClassId,
              avmContractInstance.initializationHash,
              avmContractInstance.immutablesHash,
            )
            .send({ from: defaultAccountAddress });
          expect(tx.executionResult).toEqual(TxExecutionResult.SUCCESS);
        });
      });

      describe('L2 to L1 messages', () => {
        it('Should fail if emitting to an invalid ethereum address', async () => {
          const recipient = Fr.MAX_FIELD_VALUE;
          await expect(
            avmContract.methods
              .raw_l2_to_l1_msg({ address: recipient }, new Fr(1))
              .send({ from: defaultAccountAddress }),
          ).rejects.toThrow();
        });
      });

      describe('Nested calls', () => {
        it('Nested call to non-existent contract reverts & rethrows by default', async () => {
          // The nested call reverts and by default caller rethrows
          await expect(
            avmContract.methods.nested_call_to_nothing().simulate({ from: defaultAccountAddress }),
          ).rejects.toThrow(/not deployed/);
        });

        it('Nested CALL instruction to non-existent contract returns failure, but caller can recover', async () => {
          // The nested call reverts (returns failure), but the caller doesn't HAVE to rethrow.
          const { receipt: tx } = await avmContract.methods
            .nested_call_to_nothing_recovers()
            .send({ from: defaultAccountAddress });
          expect(tx.executionResult).toEqual(TxExecutionResult.SUCCESS);
        });
        it('Should NOT be able to emit the same unsiloed nullifier from the same contract', async () => {
          const nullifier = new Fr(1);
          await expect(
            avmContract.methods
              .create_same_nullifier_in_nested_call(avmContract.address, nullifier)
              .send({ from: defaultAccountAddress }),
          ).rejects.toThrow();
        });
      });
    });

    // State-mutating tests get a fresh deployment per test to avoid cross-test leakage of
    // storage writes or persisted nullifiers.
    describe('with fresh deployment per test', () => {
      let avmContract: AvmTestContract;
      let secondAvmContract: AvmTestContract;

      beforeEach(async () => {
        ({ contract: avmContract } = await AvmTestContract.deploy(wallet).send({
          from: defaultAccountAddress,
        }));
        ({ contract: secondAvmContract } = await AvmTestContract.deploy(wallet).send({ from: defaultAccountAddress }));
      });

      describe('Storage', () => {
        it('Modifies storage (Field)', async () => {
          await avmContract.methods.set_storage_single(20n).send({ from: defaultAccountAddress });
          expect(
            (await avmContract.methods.read_storage_single().simulate({ from: defaultAccountAddress })).result,
          ).toEqual(20n);
        });

        it('Modifies storage (Map)', async () => {
          const address = AztecAddress.fromBigInt(9090n);
          await avmContract.methods.set_storage_map(address, 100).send({ from: defaultAccountAddress });
          await avmContract.methods.add_storage_map(address, 100).send({ from: defaultAccountAddress });
          expect(
            (await avmContract.methods.read_storage_map(address).simulate({ from: defaultAccountAddress })).result,
          ).toEqual(200n);
        });

        it('Preserves storage across enqueued public calls', async () => {
          const address = AztecAddress.fromBigInt(9090n);
          // This will create 1 tx with 2 public calls in it.
          await new BatchCall(wallet, [
            avmContract.methods.set_storage_map(address, 100),
            avmContract.methods.add_storage_map(address, 100),
          ]).send({ from: defaultAccountAddress });
          // On a separate tx, we check the result.
          expect(
            (await avmContract.methods.read_storage_map(address).simulate({ from: defaultAccountAddress })).result,
          ).toEqual(200n);
        });
      });

      describe('Nullifiers', () => {
        // Nullifier will not yet be siloed by the kernel.
        it('Emit and check in the same tx', async () => {
          const { receipt: tx } = await avmContract.methods
            .emit_nullifier_and_check(123456)
            .send({ from: defaultAccountAddress });
          expect(tx.executionResult).toEqual(TxExecutionResult.SUCCESS);
        });

        // Nullifier will have been siloed by the kernel, but we check against the unsiloed one.
        it('Emit and check in separate tx', async () => {
          const nullifier = new Fr(123456);
          let { receipt: tx } = await avmContract.methods
            .new_nullifier(nullifier)
            .send({ from: defaultAccountAddress });
          expect(tx.executionResult).toEqual(TxExecutionResult.SUCCESS);

          ({ receipt: tx } = await avmContract.methods
            .assert_nullifier_exists(nullifier)
            .send({ from: defaultAccountAddress }));
          expect(tx.executionResult).toEqual(TxExecutionResult.SUCCESS);
        });

        it('Emit and check in separate enqueued calls but same tx', async () => {
          const nullifier = new Fr(123456);

          // This will create 1 tx with 2 public calls in it.
          await new BatchCall(wallet, [
            avmContract.methods.new_nullifier(nullifier),
            avmContract.methods.assert_nullifier_exists(nullifier),
          ]).send({ from: defaultAccountAddress });
        });
      });

      describe('Nested calls', () => {
        it('Should be able to emit different unsiloed nullifiers from the same contract', async () => {
          const nullifier = new Fr(1);
          const { receipt: tx } = await avmContract.methods
            .create_different_nullifier_in_nested_call(avmContract.address, nullifier)
            .send({ from: defaultAccountAddress });
          expect(tx.executionResult).toEqual(TxExecutionResult.SUCCESS);
        });

        it('Should be able to emit the same unsiloed nullifier from two different contracts', async () => {
          const nullifier = new Fr(1);
          const { receipt: tx } = await avmContract.methods
            .create_same_nullifier_in_nested_call(secondAvmContract.address, nullifier)
            .send({ from: defaultAccountAddress });
          expect(tx.executionResult).toEqual(TxExecutionResult.SUCCESS);
        });

        it('Should be able to emit different unsiloed nullifiers from two different contracts', async () => {
          const nullifier = new Fr(1);
          const { receipt: tx } = await avmContract.methods
            .create_different_nullifier_in_nested_call(secondAvmContract.address, nullifier)
            .send({ from: defaultAccountAddress });
          expect(tx.executionResult).toEqual(TxExecutionResult.SUCCESS);
        });
      });
    });
  });

  describe('publicDataOverrides', () => {
    // AvmTestContract: `single` is the first storage variable and lives at raw slot 1.
    const SINGLE_SLOT = new Fr(1n);
    let avmContract: AvmTestContract;

    beforeEach(async () => {
      ({ contract: avmContract } = await AvmTestContract.deploy(wallet).send({ from: defaultAccountAddress }));
    });

    it('simulated read of an unwritten slot returns the override; real storage is untouched', async () => {
      const overrideValue = new Fr(0xdeadbeefn);
      const publicStorage: PublicStorageOverride[] = [
        { contract: avmContract.address, slot: SINGLE_SLOT, value: overrideValue },
      ];

      const simResult = await avmContract.methods
        .read_storage_single()
        .simulate({ from: defaultAccountAddress, overrides: { publicStorage } });
      expect(simResult.result).toEqual(overrideValue.toBigInt());

      // Real state is untouched — the slot was never written.
      const realValue = await aztecNode.getPublicStorageAt('latest', avmContract.address, SINGLE_SLOT);
      expect(realValue.toBigInt()).toEqual(0n);
    });

    it('simulated read returns the override when a slot was previously written by a real tx', async () => {
      const realValue = new Fr(100n);
      await avmContract.methods.set_storage_single(realValue).send({ from: defaultAccountAddress });

      const overrideValue = new Fr(999n);
      const publicStorage: PublicStorageOverride[] = [
        { contract: avmContract.address, slot: SINGLE_SLOT, value: overrideValue },
      ];

      const simResult = await avmContract.methods
        .read_storage_single()
        .simulate({ from: defaultAccountAddress, overrides: { publicStorage } });
      expect(simResult.result).toEqual(overrideValue.toBigInt());

      // Real storage still holds the original written value.
      const storedValue = await aztecNode.getPublicStorageAt('latest', avmContract.address, SINGLE_SLOT);
      expect(storedValue.toBigInt()).toEqual(realValue.toBigInt());
    });
  });

  describe('AvmInitializerTestContract', () => {
    let avmContract: AvmInitializerTestContract;

    beforeEach(async () => {
      ({ contract: avmContract } = await AvmInitializerTestContract.deploy(wallet).send({
        from: defaultAccountAddress,
      }));
    });

    describe('Storage', () => {
      it('Read immutable (initialized) storage (Field)', async () => {
        expect(
          (await avmContract.methods.read_storage_immutable().simulate({ from: defaultAccountAddress })).result,
        ).toEqual(42n);
      });
    });
  });
});
