import { AztecAddress } from '@aztec/aztec.js/addresses';
import { TxStatus } from '@aztec/aztec.js/tx';
import { retryUntil } from '@aztec/foundation/retry';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TestWallet } from '@aztec/test-wallet/server';
import { proveInteraction } from '@aztec/test-wallet/server';

import { setup } from './fixtures/utils.js';

describe('e2e_mempool_limit', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let token: TokenContract;

  beforeAll(async () => {
    ({
      aztecNodeAdmin,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1, {
      proverTestVerificationDelayMs: undefined,
    }));

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }

    token = await TokenContract.deploy(wallet, defaultAccountAddress, 'TEST', 'T', 18)
      .send({ from: defaultAccountAddress })
      .deployed();
    await token.methods
      .mint_to_public(defaultAccountAddress, 10n ** 18n)
      .send({ from: defaultAccountAddress })
      .wait();
  });

  it('should evict txs if there are too many', async () => {
    const tx1 = await proveInteraction(
      wallet,
      token.methods.transfer_in_public(defaultAccountAddress, await AztecAddress.random(), 1, 0),
      { from: defaultAccountAddress },
    );
    const txSize = tx1.getSize();

    // set a min tx greater than the mempool so that the sequencer doesn't all of a sudden build a block
    await aztecNodeAdmin!.setConfig({ maxTxPoolSize: Math.floor(2.5 * txSize), minTxsPerBlock: 4 });

    const tx2 = await proveInteraction(
      wallet,
      token.methods.transfer_in_public(defaultAccountAddress, await AztecAddress.random(), 1, 0),
      { from: defaultAccountAddress },
    );
    const tx3 = await proveInteraction(
      wallet,
      token.methods.transfer_in_public(defaultAccountAddress, await AztecAddress.random(), 1, 0),
      { from: defaultAccountAddress },
    );

    const sentTx1 = tx1.send();
    await expect(sentTx1.getReceipt()).resolves.toEqual(expect.objectContaining({ status: TxStatus.PENDING }));

    const sentTx2 = tx2.send();
    await expect(sentTx1.getReceipt()).resolves.toEqual(expect.objectContaining({ status: TxStatus.PENDING }));
    await expect(sentTx2.getReceipt()).resolves.toEqual(expect.objectContaining({ status: TxStatus.PENDING }));

    const sentTx3 = tx3.send();

    const txDropped = await retryUntil(
      async () => {
        // one of the txs will be dropped. Which one is picked is somewhat random because all three will have the same fee
        const receipts = await Promise.all([sentTx1.getReceipt(), sentTx2.getReceipt(), sentTx3.getReceipt()]);
        const numPending = receipts.reduce((count, r) => (r.status === TxStatus.PENDING ? count + 1 : count), 0);
        return numPending < 3;
      },
      'Waiting for one of the txs to be evicted from the mempool',
      60,
      1,
    );

    expect(txDropped).toBe(true);
  });
});
