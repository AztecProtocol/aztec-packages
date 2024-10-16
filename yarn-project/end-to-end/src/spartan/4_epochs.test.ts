import { EthCheatCodes, readFieldCompressedString } from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { type TestWallets, setupTestWalletsWithTokens } from './setup_test_wallets.js';
import { RollupCheatCodes } from '../../../aztec.js/src/utils/cheat_codes.js';

const { PXE_URL } = process.env;
if (!PXE_URL) {
  throw new Error('PXE_URL env variable must be set');
}

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes

  const logger = createDebugLogger(`aztec:spartan-test:transfer`);
  const MINT_AMOUNT = 20n;

  const ROUNDS = 5n;

  let testWallets: TestWallets;

  beforeAll(async () => {
    testWallets = await setupTestWalletsWithTokens(PXE_URL, ROUNDS, MINT_AMOUNT, logger);
    expect(ROUNDS).toBeLessThanOrEqual(MINT_AMOUNT);
  });

  it('can get info', async () => {
    const name = readFieldCompressedString(await testWallets.tokenAdminWallet.methods.private_get_name().simulate());
    expect(name).toBe(testWallets.tokenName);
  });

  it('can transfer 1 token privately and publicly', async () => {
    if (!process.env.ETHEREUM_HOST) {
      throw new Error('ETHEREUM_HOST env variable must be set');
    }
    const ethCheatCodes = new EthCheatCodes(process.env.ETHEREUM_HOST);
    // Get 4 epochs
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await testWallets.pxe.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    const epoch = await rollupCheatCodes.getEpoch();
    const recipient = testWallets.recipientWallet.getAddress();
    const transferAmount = 1n;

    testWallets.wallets.forEach(async w => {
      expect(MINT_AMOUNT).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate());
    });

    expect(0n).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate());

    // For each round, make both private and public transfers
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
