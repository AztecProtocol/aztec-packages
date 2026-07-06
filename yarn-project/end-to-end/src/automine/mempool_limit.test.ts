import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { TxStatus } from '@aztec/aztec.js/tx';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import type { EndToEndContext } from '../fixtures/utils.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { AutomineTestContext } from './automine_test_context.js';

// Verifies that the node rejects incoming transactions when the mempool is at capacity. Uses a
// single automine node with aztecNodeAdmin access; sequencer is paused to let txs accumulate.
describe('automine/mempool_limit', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let teardown: EndToEndContext['teardown'];
  let token: TokenContract;

  beforeAll(async () => {
    ({
      teardown,
      aztecNode,
      aztecNodeAdmin,
      wallet,
      accounts: [defaultAccountAddress],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }

    ({ contract: token } = await TokenContract.deploy(wallet, defaultAccountAddress, 'TEST', 'T', 18).send({
      from: defaultAccountAddress,
    }));
    await token.methods.mint_to_public(defaultAccountAddress, 10n ** 18n).send({ from: defaultAccountAddress });
  });

  afterAll(() => teardown());

  // Sets maxPendingTxCount=2, pauses the sequencer, submits 3 proven txs in order, and asserts
  // the first two are accepted (status PENDING) while the third is rejected with LOW_PRIORITY_FEE.
  it('should evict txs if there are too many', async () => {
    const tx1 = await proveInteraction(
      wallet,
      token.methods.transfer_in_public(defaultAccountAddress, await AztecAddress.random(), 1, 0),
      { from: defaultAccountAddress },
    );

    // Cap the mempool, then pause the sequencer so pending txs accumulate without being mined.
    await aztecNodeAdmin!.setConfig({ maxPendingTxCount: 2 });
    await aztecNodeAdmin!.pauseSequencer();

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

    // tx3 should be rejected because pool is at capacity and its priority is not higher than existing txs
    await expect(tx3.send({ wait: NO_WAIT })).rejects.toMatchObject({
      data: { code: 'LOW_PRIORITY_FEE' },
    });
  });
});
