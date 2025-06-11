import { Fr, type PXE, type Wallet } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP } from '@aztec/stdlib/tx';

import { setup } from './fixtures/utils.js';

describe('e2e_include_by_timestamp', () => {
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
    let includeByTimestamp: number;

    beforeEach(async () => {
      includeByTimestamp = (await pxe.getBlockNumber()) + 20;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets the include by timestamp', async () => {
        const tx = await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.includeByTimestamp.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(new Fr(includeByTimestamp));
      });

      it('does not invalidate the transaction', async () => {
        await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).send().wait();
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('sets include by timestamp', async () => {
        const tx = await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.includeByTimestamp.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(new Fr(includeByTimestamp));
      });

      it('does not invalidate the transaction', async () => {
        await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).send().wait();
      });
    });
  });

  describe('when requesting max block numbers lower than the mined one', () => {
    let includeByTimestamp: number;

    beforeEach(async () => {
      includeByTimestamp = await pxe.getBlockNumber();
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets include by timestamp', async () => {
        const tx = await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.includeByTimestamp.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(new Fr(includeByTimestamp));
      });

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).send().wait(),
        ).rejects.toThrow(TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP);
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('sets include by timestamp', async () => {
        const tx = await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.includeByTimestamp.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(new Fr(includeByTimestamp));
      });

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).send().wait(),
        ).rejects.toThrow(TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP);
      });
    });
  });
});
