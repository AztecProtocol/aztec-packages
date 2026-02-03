import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { TxStatus } from '@aztec/aztec.js/tx';
import { retryUntil } from '@aztec/foundation/retry';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TestWallet } from '@aztec/test-wallet/server';
import { proveInteraction } from '@aztec/test-wallet/server';

import { setup } from './fixtures/utils.js';

describe('e2e_mempool_limit', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let token: TokenContract;

  beforeAll(async () => {
    ({
      aztecNode,
      aztecNodeAdmin,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1, {
      proverTestVerificationDelayMs: undefined,
    }));

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }

    token = await TokenContract.deploy(wallet, defaultAccountAddress, 'TEST', 'T', 18).send({
      from: defaultAccountAddress,
    });
    await token.methods.mint_to_public(defaultAccountAddress, 10n ** 18n).send({ from: defaultAccountAddress });
  });

  it('should evict txs if there are too many', async () => {
    const tx1 = await proveInteraction(
      wallet,
      token.methods.transfer_in_public(defaultAccountAddress, await AztecAddress.random(), 1, 0),
      { from: defaultAccountAddress },
    );

    // set a min tx greater than the mempool so that the sequencer doesn't all of a sudden build a block
    await aztecNodeAdmin!.setConfig({ maxPendingTxCount: 2, minTxsPerBlock: 4 });

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

    const txHash1 = await tx1.send({ wait: NO_WAIT });
    await expect(aztecNode.getTxReceipt(txHash1)).resolves.toEqual(
      expect.objectContaining({ status: TxStatus.PENDING }),
    );

    const txHash2 = await tx2.send({ wait: NO_WAIT });
    await expect(aztecNode.getTxReceipt(txHash1)).resolves.toEqual(
      expect.objectContaining({ status: TxStatus.PENDING }),
    );
    await expect(aztecNode.getTxReceipt(txHash2)).resolves.toEqual(
      expect.objectContaining({ status: TxStatus.PENDING }),
    );

    const txHash3 = await tx3.send({ wait: NO_WAIT });

    const txDropped = await retryUntil(
      async () => {
        // one of the txs will be dropped. Which one is picked is somewhat random because all three will have the same fee
        const receipts = await Promise.all([
          aztecNode.getTxReceipt(txHash1),
          aztecNode.getTxReceipt(txHash2),
          aztecNode.getTxReceipt(txHash3),
        ]);
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
