import type { PXE, Wallet } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TX_ERROR_INVALID_MAX_BLOCK_NUMBER } from '@aztec/stdlib/tx';

import { setup } from './fixtures/utils.js';

describe('e2e_max_block_number', () => {
  let wallet: Wallet;
  let pxe: PXE;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  beforeAll(async () => {
    ({ teardown, wallet, pxe } = await setup());
    contract = await TestContract.deploy(wallet).send().deployed();
  });

  afterAll(() => teardown());

  describe('when requesting max block numbers higher than the mined one', () => {
    let maxBlockNumber: number;

    beforeEach(async () => {
      maxBlockNumber = (await pxe.getBlockNumber()) + 20;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets the max block number', async () => {
        const tx = await contract.methods.set_tx_max_block_number(maxBlockNumber, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.maxBlockNumber.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.maxBlockNumber.value).toEqual(maxBlockNumber);
      });

      it('does not invalidate the transaction', async () => {
        await contract.methods.set_tx_max_block_number(maxBlockNumber, enqueuePublicCall).send().wait();
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('sets the max block number', async () => {
        const tx = await contract.methods.set_tx_max_block_number(maxBlockNumber, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.maxBlockNumber.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.maxBlockNumber.value).toEqual(maxBlockNumber);
      });

      it('does not invalidate the transaction', async () => {
        await contract.methods.set_tx_max_block_number(maxBlockNumber, enqueuePublicCall).send().wait();
      });
    });
  });

  describe('when requesting max block numbers lower than the mined one', () => {
    let maxBlockNumber: number;

    beforeEach(async () => {
      maxBlockNumber = await pxe.getBlockNumber();
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets the max block number', async () => {
        const tx = await contract.methods.set_tx_max_block_number(maxBlockNumber, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.maxBlockNumber.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.maxBlockNumber.value).toEqual(maxBlockNumber);
      });

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods.set_tx_max_block_number(maxBlockNumber, enqueuePublicCall).send().wait(),
        ).rejects.toThrow(TX_ERROR_INVALID_MAX_BLOCK_NUMBER);
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('sets the max block number', async () => {
        const tx = await contract.methods.set_tx_max_block_number(maxBlockNumber, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.maxBlockNumber.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.maxBlockNumber.value).toEqual(maxBlockNumber);
      });

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods.set_tx_max_block_number(maxBlockNumber, enqueuePublicCall).send().wait(),
        ).rejects.toThrow(TX_ERROR_INVALID_MAX_BLOCK_NUMBER);
      });
    });
  });
});
