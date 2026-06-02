import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { TxStatus } from '@aztec/aztec.js/tx';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { type EndToEndContext, setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

describe('e2e_mempool_limit', () => {
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
    } = await setup(1, {
      ...AUTOMINE_E2E_OPTS,
      proverTestVerificationDelayMs: undefined,
    }));

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }

    ({ contract: token } = await TokenContract.deploy(wallet, defaultAccountAddress, 'TEST', 'T', 18).send({
      from: defaultAccountAddress,
    }));
    await token.methods.mint_to_public(defaultAccountAddress, 10n ** 18n).send({ from: defaultAccountAddress });
  });

  afterAll(() => teardown());

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
