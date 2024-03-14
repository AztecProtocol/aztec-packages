import { PXE, Wallet } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-contracts.js';

import { setup } from './fixtures/utils.js';

describe('e2e_max_block_number', () => {
  let wallet: Wallet;
  let teardown: () => Promise<void>;

  let pxe: PXE;
  let contract: TestContract;

  beforeAll(async () => {
    ({ teardown, wallet, pxe } = await setup());
    contract = await TestContract.deploy(wallet).send().deployed();
  }, 25_000);

  afterAll(() => teardown());

  describe('when requesting max block numbers higher than the mined one', () => {
    let maxBlockNumber: number;

    beforeEach(async () => {
      maxBlockNumber = (await pxe.getBlockNumber()) + 20;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('does not invalidate the transaction', async () => {
        await contract.methods.request_max_block_number(maxBlockNumber, enqueuePublicCall).send().wait();
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('does not invalidate the transaction', async () => {
        await contract.methods.request_max_block_number(maxBlockNumber, enqueuePublicCall).send().wait();
      });
    });
  });

  // These currently cause the sequencer to error out with
  //   aztec:sequencer ERROR Rolling back world state DB due to error assembling block: Error: Assertion failed: kernel max_block_number is smaller than block number
  // and it it seemingly retries until the test timeouts.
  describe.skip('when requesting max block numbers lower than the mined one', () => {
    let maxBlockNumber: number;

    beforeEach(async () => {
      maxBlockNumber = await pxe.getBlockNumber();
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods.request_max_block_number(maxBlockNumber, enqueuePublicCall).send().wait(),
        ).rejects.toThrow();
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods.request_max_block_number(maxBlockNumber, enqueuePublicCall).send().wait(),
        ).rejects.toThrow();
      });
    });
  });
});
