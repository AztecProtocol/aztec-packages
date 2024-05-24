import { type AccountWallet, AztecAddress, BatchCall, Fr, FunctionSelector, TxStatus } from '@aztec/aztec.js';
import { GasSettings } from '@aztec/circuits.js';
import {
  AvmAcvmInteropTestContract,
  AvmInitializerTestContract,
  AvmNestedCallsTestContract,
  AvmTestContract,
} from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { publicDeployAccounts, setup } from './fixtures/utils.js';

const TIMEOUT = 100_000;

describe('e2e_avm_simulator', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: AccountWallet;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallet } = await setup());
    await publicDeployAccounts(wallet, [wallet]);
  });

  afterAll(() => teardown());

  describe('AvmTestContract', () => {
    let avmContract: AvmTestContract;

    beforeEach(async () => {
      avmContract = await AvmTestContract.deploy(wallet).send().deployed();
    });

    describe('Assertions', () => {
      it('PXE processes failed assertions and fills in the error message with the expression', async () => {
        await expect(avmContract.methods.assertion_failure().simulate()).rejects.toThrow(
          "Assertion failed: This assertion should fail! 'not_true == true'",
        );
      });
      it('PXE processes failed assertions and fills in the error message with the expression (even complex ones)', async () => {
        await expect(avmContract.methods.assert_nullifier_exists(123).simulate()).rejects.toThrow(
          "Assertion failed: Nullifier doesn't exist! 'context.nullifier_exists(nullifier, context.this_address())'",
        );
      });
    });

    describe('From private', () => {
      it('Should enqueue a public function correctly', async () => {
        await avmContract.methods.enqueue_public_from_private().simulate();
      });
    });

    describe('Gas metering', () => {
      it('Tracks L2 gas usage on simulation', async () => {
        const request = await avmContract.methods.add_args_return(20n, 30n).create();
        const simulation = await wallet.simulateTx(request, true, wallet.getAddress());
        // Subtract the teardown gas allocation from the gas used to figure out the gas used by the contract logic.
        const l2TeardownAllocation = GasSettings.simulation().getTeardownLimits().l2Gas;
        const l2GasUsed = simulation.publicOutput!.end.gasUsed.l2Gas! - l2TeardownAllocation;
        // L2 gas used will vary a lot depending on codegen and other factors,
        // so we just set a wide range for it, and check it's not a suspiciously round number.
        expect(l2GasUsed).toBeGreaterThan(1e3);
        expect(l2GasUsed).toBeLessThan(1e6);
        expect(l2GasUsed! % 1000).not.toEqual(0);
      });
    });

    describe('Storage', () => {
      it('Modifies storage (Field)', async () => {
        await avmContract.methods.set_storage_single(20n).send().wait();
        expect(await avmContract.methods.view_storage_single().simulate()).toEqual(20n);
      });

      it('Modifies storage (Map)', async () => {
        const address = AztecAddress.fromBigInt(9090n);
        await avmContract.methods.set_storage_map(address, 100).send().wait();
        await avmContract.methods.add_storage_map(address, 100).send().wait();
        expect(await avmContract.methods.view_storage_map(address).simulate()).toEqual(200n);
      });

      it('Preserves storage across enqueued public calls', async () => {
        const address = AztecAddress.fromBigInt(9090n);
        // This will create 1 tx with 2 public calls in it.
        await new BatchCall(wallet, [
          avmContract.methods.set_storage_map(address, 100).request(),
          avmContract.methods.add_storage_map(address, 100).request(),
        ])
          .send()
          .wait();
        // On a separate tx, we check the result.
        expect(await avmContract.methods.view_storage_map(address).simulate()).toEqual(200n);
      });
    });

    describe('Contract instance', () => {
      it('Works', async () => {
        const tx = await avmContract.methods.test_get_contract_instance().send().wait();
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
          avmContract.methods.new_nullifier(nullifier).request(),
          avmContract.methods.assert_nullifier_exists(nullifier).request(),
        ])
          .send()
          .wait();
      });
    });
  });

  describe.skip('ACVM interoperability', () => {
    let avmContract: AvmAcvmInteropTestContract;

    beforeEach(async () => {
      avmContract = await AvmAcvmInteropTestContract.deploy(wallet).send().deployed();
    });

    it('Can execute ACVM function among AVM functions', async () => {
      expect(await avmContract.methods.constant_field_acvm().simulate()).toEqual(123456n);
    });

    it('Can call AVM function from ACVM', async () => {
      expect(await avmContract.methods.call_avm_from_acvm().simulate()).toEqual(123456n);
    });

    it('Can call ACVM function from AVM', async () => {
      expect(await avmContract.methods.call_acvm_from_avm().simulate()).toEqual(123456n);
    });

    it('AVM sees settled nullifiers by ACVM', async () => {
      const nullifier = new Fr(123456);
      await avmContract.methods.new_nullifier(nullifier).send().wait();
      await avmContract.methods.assert_unsiloed_nullifier_acvm(nullifier).send().wait();
    });

    it('AVM nested call to ACVM sees settled nullifiers', async () => {
      const nullifier = new Fr(123456);
      await avmContract.methods.new_nullifier(nullifier).send().wait();
      await avmContract.methods
        .avm_to_acvm_call(FunctionSelector.fromSignature('assert_unsiloed_nullifier_acvm(Field)'), nullifier)
        .send()
        .wait();
    });

    // TODO: Enable (or delete) authwit tests once the AVM is fully functional.
    describe.skip('Authwit', () => {
      it('Works if authwit provided', async () => {
        const recipient = AztecAddress.random();
        const action = avmContract.methods.test_authwit_send_money(
          /*from=*/ wallet.getCompleteAddress(),
          recipient,
          100,
        );
        let tx = await wallet
          .setPublicAuthWit({ caller: wallet.getCompleteAddress().address, action }, /*authorized=*/ true)
          .send()
          .wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);

        tx = await avmContract.methods
          .test_authwit_send_money(/*from=*/ wallet.getCompleteAddress(), recipient, 100)
          .send()
          .wait();
        expect(tx.status).toEqual(TxStatus.SUCCESS);
      });

      it('Fails if authwit not provided', async () => {
        await expect(
          async () =>
            await avmContract.methods
              .test_authwit_send_money(/*from=*/ wallet.getCompleteAddress(), /*to=*/ AztecAddress.random(), 100)
              .send()
              .wait(),
        ).rejects.toThrow(/Message not authorized by account/);
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

  describe('AvmNestedCallsTestContract', () => {
    let avmContract: AvmNestedCallsTestContract;
    let secondAvmContract: AvmNestedCallsTestContract;

    beforeEach(async () => {
      avmContract = await AvmNestedCallsTestContract.deploy(wallet).send().deployed();
      secondAvmContract = await AvmNestedCallsTestContract.deploy(wallet).send().deployed();
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
