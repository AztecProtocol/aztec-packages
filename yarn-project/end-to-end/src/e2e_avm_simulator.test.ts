import { type AccountWallet, AztecAddress, BatchCall, Fr, TxStatus } from '@aztec/aztec.js';
import { AvmInitializerTestContract } from '@aztec/noir-test-contracts.js/AvmInitializerTest';
import { AvmTestContract } from '@aztec/noir-test-contracts.js/AvmTest';

import { jest } from '@jest/globals';

import { ensureAccountContractsPublished, setup } from './fixtures/utils.js';

const TIMEOUT = 100_000;

describe('e2e_avm_simulator', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: AccountWallet;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallet } = await setup(1));
    await ensureAccountContractsPublished(wallet, [wallet]);
  });

  afterAll(() => teardown());

  describe('AvmTestContract', () => {
    let avmContract: AvmTestContract;
    let secondAvmContract: AvmTestContract;

    beforeEach(async () => {
      avmContract = await AvmTestContract.deploy(wallet).send().deployed();
      secondAvmContract = await AvmTestContract.deploy(wallet).send().deployed();
    });

    describe('Assertions & error enriching', () => {
      /**
       * Expect an error like:
       * Assertion failed: This assertion should fail! 'not_true == true'
       * ...
       * at not_true == true (../../../../../../../home/aztec-dev/aztec-packages/noir-projects/noir-contracts/contracts/test/avm_test_contract/src/main.nr:223:16)
       * at inner_helper_with_failed_assertion() (../../../../../../../home/aztec-dev/aztec-packages/noir-projects/noir-contracts/contracts/test/avm_test_contract/src/main.nr:228:9)
       * at quote { $self } (../std/meta/expr.nr:269:9)
       * at function.name();
       * let call = quote { $name($args) (/home/aztec-dev/aztec-packages/noir-projects/aztec-nr/aztec/src/macros/dispatch.nr:59:20)
       * at AvmTest.0xc3515746
       */
      describe('Not nested', () => {
        it('PXE processes user code assertions and recovers message (properly enriched)', async () => {
          await expect(avmContract.methods.assertion_failure().simulate()).rejects.toThrow(
            expect.objectContaining({
              message: expect.stringMatching(/Assertion failed: This assertion should fail! 'not_true == true'/),
              stack: expect.stringMatching(/at inner_helper_with_failed_assertion[\s\S]*at AvmTest\..*/),
            }),
          );
        });
        it('PXE processes user code assertions and recovers message (complex)', async () => {
          await expect(avmContract.methods.assert_nullifier_exists(123).simulate()).rejects.toThrow(
            "Assertion failed: Nullifier doesn't exist!",
          );
        });
        it('PXE processes intrinsic assertions and recovers message', async () => {
          await expect(avmContract.methods.divide_by_zero().simulate()).rejects.toThrow('Division by zero');
        });
      });
      describe('Nested', () => {
        it('PXE processes user code assertions and recovers message', async () => {
          await expect(avmContract.methods.external_call_to_assertion_failure().simulate()).rejects.toThrow(
            'Assertion failed: This assertion should fail!',
          );
        });
        it('PXE processes intrinsic assertions and recovers message', async () => {
          await expect(avmContract.methods.external_call_to_divide_by_zero().simulate()).rejects.toThrow(
            'Division by zero',
          );
        });
      });
    });

    describe('From private', () => {
      it('Should enqueue a public function correctly', async () => {
        const request = await avmContract.methods.enqueue_public_from_private().create();
        const simulation = await wallet.simulateTx(request, true);
        expect(simulation.publicOutput!.revertReason).toBeUndefined();
      });
    });

    describe('Gas metering', () => {
      it('Tracks L2 gas usage on simulation', async () => {
        const request = await avmContract.methods.add_args_return(20n, 30n).create();
        const simulation = await wallet.simulateTx(request, true);
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

    describe('Storage', () => {
      it('Modifies storage (Field)', async () => {
        await avmContract.methods.set_storage_single(20n).send().wait();
        expect(await avmContract.methods.read_storage_single().simulate()).toEqual(20n);
      });

      it('Modifies storage (Map)', async () => {
        const address = AztecAddress.fromBigInt(9090n);
        await avmContract.methods.set_storage_map(address, 100).send().wait();
        await avmContract.methods.add_storage_map(address, 100).send().wait();
        expect(await avmContract.methods.read_storage_map(address).simulate()).toEqual(200n);
      });

      it('Preserves storage across enqueued public calls', async () => {
        const address = AztecAddress.fromBigInt(9090n);
        // This will create 1 tx with 2 public calls in it.
        await new BatchCall(wallet, [
          avmContract.methods.set_storage_map(address, 100),
          avmContract.methods.add_storage_map(address, 100),
        ])
          .send()
          .wait();
        // On a separate tx, we check the result.
        expect(await avmContract.methods.read_storage_map(address).simulate()).toEqual(200n);
      });
    });

    describe('Contract instance', () => {
      it('Works', async () => {
        const tx = await avmContract.methods
          .test_get_contract_instance_matches(
            avmContract.address,
            avmContract.instance.deployer,
            avmContract.instance.currentContractClassId,
            avmContract.instance.initializationHash,
          )
          .send()
          .wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);
      });
    });

    describe('Nullifiers', () => {
      // Nullifier will not yet be siloed by the kernel.
      it('Emit and check in the same tx', async () => {
        const tx = await avmContract.methods.emit_nullifier_and_check(123456).send().wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);
      });

      // Nullifier will have been siloed by the kernel, but we check against the unsiloed one.
      it('Emit and check in separate tx', async () => {
        const nullifier = new Fr(123456);
        let tx = await avmContract.methods.new_nullifier(nullifier).send().wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);

        tx = await avmContract.methods.assert_nullifier_exists(nullifier).send().wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);
      });

      it('Emit and check in separate enqueued calls but same tx', async () => {
        const nullifier = new Fr(123456);

        // This will create 1 tx with 2 public calls in it.
        await new BatchCall(wallet, [
          avmContract.methods.new_nullifier(nullifier),
          avmContract.methods.assert_nullifier_exists(nullifier),
        ])
          .send()
          .wait();
      });
    });

    describe('Nested calls', () => {
      it('Nested call to non-existent contract reverts & rethrows by default', async () => {
        // The nested call reverts and by default caller rethrows
        await expect(avmContract.methods.nested_call_to_nothing().simulate()).rejects.toThrow(/No bytecode/);
      });
      it('Nested CALL instruction to non-existent contract returns failure, but caller can recover', async () => {
        // The nested call reverts (returns failure), but the caller doesn't HAVE to rethrow.
        const tx = await avmContract.methods.nested_call_to_nothing_recovers().send().wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);
      });
      it('Should NOT be able to emit the same unsiloed nullifier from the same contract', async () => {
        const nullifier = new Fr(1);
        await expect(
          avmContract.methods.create_same_nullifier_in_nested_call(avmContract.address, nullifier).send().wait(),
        ).rejects.toThrow();
      });

      it('Should be able to emit different unsiloed nullifiers from the same contract', async () => {
        const nullifier = new Fr(1);
        const tx = await avmContract.methods
          .create_different_nullifier_in_nested_call(avmContract.address, nullifier)
          .send()
          .wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);
      });

      it('Should be able to emit the same unsiloed nullifier from two different contracts', async () => {
        const nullifier = new Fr(1);
        const tx = await avmContract.methods
          .create_same_nullifier_in_nested_call(secondAvmContract.address, nullifier)
          .send()
          .wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);
      });

      it('Should be able to emit different unsiloed nullifiers from two different contracts', async () => {
        const nullifier = new Fr(1);
        const tx = await avmContract.methods
          .create_different_nullifier_in_nested_call(secondAvmContract.address, nullifier)
          .send()
          .wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);
      });
    });
  });

  describe('AvmInitializerTestContract', () => {
    let avmContract: AvmInitializerTestContract;

    beforeEach(async () => {
      avmContract = await AvmInitializerTestContract.deploy(wallet).send().deployed();
    });

    describe('Storage', () => {
      it('Read immutable (initialized) storage (Field)', async () => {
        expect(await avmContract.methods.read_storage_immutable().simulate()).toEqual(42n);
      });
    });
  });
});
