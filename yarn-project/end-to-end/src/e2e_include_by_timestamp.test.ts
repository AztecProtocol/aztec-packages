import type { AztecNode, Wallet } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP } from '@aztec/stdlib/tx';

import { setup } from './fixtures/utils.js';

describe('e2e_include_by_timestamp', () => {
  let wallet: Wallet;
  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  beforeAll(async () => {
    ({ teardown, wallet, aztecNode } = await setup());
    contract = await TestContract.deploy(wallet).send().deployed();
  });

  afterAll(() => teardown());

  describe('when requesting expiration timestamp higher than the one of a mined block', () => {
    let includeByTimestamp: bigint;

    beforeEach(async () => {
      const header = await aztecNode.getBlockHeader();
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_include_by_timestamp.test.ts');
      }
      includeByTimestamp = header.globalVariables.timestamp + 720n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets the include by timestamp', async () => {
        const tx = await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.includeByTimestamp.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(includeByTimestamp);
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
        expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(includeByTimestamp);
      });

      it('does not invalidate the transaction', async () => {
        await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).send().wait();
      });
    });
  });

  describe('when requesting expiration timestamp lower than the one of a mined block', () => {
    let includeByTimestamp: bigint;

    beforeEach(async () => {
      const header = await aztecNode.getBlockHeader();
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_include_by_timestamp.test.ts');
      }
      includeByTimestamp = header.globalVariables.timestamp - 720n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets include by timestamp', async () => {
        const tx = await contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).prove();
        expect(tx.data.rollupValidationRequests.includeByTimestamp.isSome).toEqual(true);
        expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(includeByTimestamp);
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
        expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(includeByTimestamp);
      });

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods.set_include_by_timestamp(includeByTimestamp, enqueuePublicCall).send().wait(),
        ).rejects.toThrow(TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP);
      });
    });
  });
});
