import { AztecAddress, TxStatus, type Wallet, retryUntil } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

describe('e2e_mempool_limit', () => {
  let wallet: Wallet;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let token: TokenContract;

  beforeAll(async () => {
    ({ aztecNodeAdmin, wallet } = await setup(1));

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }

    token = await TokenContract.deploy(wallet, wallet.getAddress(), 'TEST', 'T', 18).send().deployed();
    await token.methods
      .mint_to_public(wallet.getAddress(), 10n ** 18n)
      .send()
      .wait();
  });

  it('should evict txs if there are too many', async () => {
    const tx1 = await token.methods.transfer_in_public(wallet.getAddress(), await AztecAddress.random(), 1, 0).prove();
    const txSize = tx1.getSize();

    // set a min tx greater than the mempool so that the sequencer doesn't all of a sudden build a block
    await aztecNodeAdmin!.setConfig({ maxTxPoolSize: Math.floor(2.5 * txSize), minTxsPerBlock: 4 });

    const tx2 = await token.methods.transfer_in_public(wallet.getAddress(), await AztecAddress.random(), 1, 0).prove();
    const tx3 = await token.methods.transfer_in_public(wallet.getAddress(), await AztecAddress.random(), 1, 0).prove();

    const sentTx1 = tx1.send();
    await expect(sentTx1.getReceipt()).resolves.toEqual(expect.objectContaining({ status: TxStatus.PENDING }));

    const sentTx2 = tx2.send();
    await expect(sentTx1.getReceipt()).resolves.toEqual(expect.objectContaining({ status: TxStatus.PENDING }));
    await expect(sentTx2.getReceipt()).resolves.toEqual(expect.objectContaining({ status: TxStatus.PENDING }));

    const sendSpy = jest.spyOn(wallet, 'sendTx');
    const sentTx3 = tx3.send();

    // this retry is needed because tx3 is sent asynchronously and we need to wait for the event loop to fully drain
    await retryUntil(() => sendSpy.mock.results[0]?.value);

    // one of the txs will be dropped. Which one is picked is somewhat random because all three will have the same fee
    const receipts = await Promise.all([sentTx1.getReceipt(), sentTx2.getReceipt(), sentTx3.getReceipt()]);
    expect(receipts.reduce((count, r) => (r.status === TxStatus.PENDING ? count + 1 : count), 0)).toBeLessThan(3);
  });
});
