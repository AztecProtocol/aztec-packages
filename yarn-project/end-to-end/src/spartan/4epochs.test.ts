import { EthCheatCodes, readFieldCompressedString } from '@aztec/aztec.js';
import { AZTEC_EPOCH_DURATION } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { RollupCheatCodes } from '../../../aztec.js/src/utils/cheat_codes.js';
import { type TestWallets, setupTestWalletsWithTokens } from './setup_test_wallets.js';

const { PXE_URL, ETHEREUM_HOST } = process.env;
if (!PXE_URL) {
  throw new Error('PXE_URL env variable must be set');
}
if (!ETHEREUM_HOST) {
  throw new Error('ETHEREUM_HOST env variable must be set');
}

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 4000); // 40 minutes

  const logger = createDebugLogger(`aztec:spartan:4epochs`);
  // We want plenty of minted tokens for a lot of slots that fill up multiple epochs
  const MINT_AMOUNT = 2000000n;
  const TEST_EPOCHS = 4;
  const ROUNDS = BigInt(AZTEC_EPOCH_DURATION * TEST_EPOCHS);

  let testWallets: TestWallets;

  beforeAll(async () => {
    testWallets = await setupTestWalletsWithTokens(PXE_URL, MINT_AMOUNT, logger);
    expect(ROUNDS).toBeLessThanOrEqual(MINT_AMOUNT);
  });

  it('can get info', async () => {
    const name = readFieldCompressedString(await testWallets.tokenAdminWallet.methods.private_get_name().simulate());
    expect(name).toBe(testWallets.tokenName);
  });

  it('transfer tokens for 4 epochs', async () => {
    const ethCheatCodes = new EthCheatCodes(ETHEREUM_HOST);
    // Get 4 epochs
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await testWallets.pxe.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    const recipient = testWallets.recipientWallet.getAddress();
    const transferAmount = 1n;

    testWallets.wallets.forEach(async w => {
      expect(MINT_AMOUNT).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate());
    });

    expect(0n).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate());

    // For each round, make both private and public transfers
    const startSlot = await rollupCheatCodes.getSlot();
    for (let i = 1n; i <= ROUNDS; i++) {
      const interactions = await Promise.all([
        ...testWallets.wallets.map(async w =>
          (
            await TokenContract.at(testWallets.tokenAddress, w)
          ).methods.transfer_public(w.getAddress(), recipient, transferAmount, 0),
        ),
      ]);

      const txs = await Promise.all(interactions.map(async i => await i.prove()));

      await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));
      const currentSlot = await rollupCheatCodes.getSlot();
      expect(currentSlot).toBe(startSlot + i);
      const startEpoch = await rollupCheatCodes.getEpoch();
      logger.debug(
        `Successfully reached slot ${currentSlot} (iteration ${
          currentSlot - startSlot
        }/${ROUNDS}) (Epoch ${startEpoch})`,
      );
    }

    testWallets.wallets.forEach(async w => {
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate(),
      );
    });

    expect(ROUNDS * transferAmount * BigInt(testWallets.wallets.length)).toBe(
      await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate(),
    );
  });
});
