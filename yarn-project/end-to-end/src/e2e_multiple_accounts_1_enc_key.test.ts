import { getSchnorrInitializerlessAccountContractAddress } from '@aztec/accounts/schnorr';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { deployToken, expectTokenBalance } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

describe('e2e_multiple_accounts_1_enc_key', () => {
  let wallet: TestWallet;
  let accounts: AztecAddress[] = [];
  let logger: Logger;
  let teardown: () => Promise<void>;

  let token: TokenContract;

  const initialBalance = 987n;
  const numAccounts = 3;

  beforeEach(async () => {
    // A shared secret for all accounts.
    const secret = Fr.random();

    // These accounts share one encryption key but use different signing keys, so we build and create them
    // ourselves (the default setup accounts each use a distinct secret). They are initializerless.
    const accountsData = await Promise.all(
      Array.from({ length: numAccounts }).map(async () => {
        // A different signing key for each account.
        const signingKey = GrumpkinScalar.random();
        const salt = Fr.random();
        const address = await getSchnorrInitializerlessAccountContractAddress(secret, salt, signingKey);
        return {
          secret,
          signingKey,
          salt,
          type: 'schnorr_initializerless' as const,
          address,
        };
      }),
    );

    ({ teardown, logger, wallet } = await setup(0, {
      ...AUTOMINE_E2E_OPTS,
      additionallyFundedAccounts: accountsData,
    }));
    for (const a of accountsData) {
      await wallet.createSchnorrInitializerlessAccount(a.secret, a.salt, a.signingKey);
    }
    accounts = accountsData.map(a => a.address);
    logger.info('Account contracts created');

    ({ contract: token } = await deployToken(wallet, accounts[0], initialBalance, logger));
  });

  afterEach(() => teardown());

  const transfer = async (
    senderIndex: number,
    receiverIndex: number,
    transferAmount: bigint,
    expectedBalances: bigint[],
  ) => {
    logger.info(`Transfer ${transferAmount} from ${accounts[senderIndex]} to ${accounts[receiverIndex]}...`);

    const sender = accounts[senderIndex];
    const receiver = accounts[receiverIndex];

    const contractWithWallet = TokenContract.at(token.address, wallet);

    await contractWithWallet.methods.transfer(receiver, transferAmount).send({ from: accounts[senderIndex] });

    for (let i = 0; i < expectedBalances.length; i++) {
      await expectTokenBalance(wallet, token, accounts[i], expectedBalances[i], logger);
    }

    logger.info(`Transfer ${transferAmount} from ${sender} to ${receiver} successful`);
  };

  /**
   * Tests the ability of the Private eXecution Environment (PXE) to handle multiple accounts under the same encryption key.
   */
  it('spends notes from multiple account under the same encryption key', async () => {
    const transferAmount1 = 654n; // account 0 -> account 1
    const transferAmount2 = 123n; // account 0 -> account 2
    const transferAmount3 = 210n; // account 1 -> account 2

    await expectTokenBalance(wallet, token, accounts[0], initialBalance, logger);
    await expectTokenBalance(wallet, token, accounts[1], 0n, logger);
    await expectTokenBalance(wallet, token, accounts[2], 0n, logger);

    const expectedBalancesAfterTransfer1 = [initialBalance - transferAmount1, transferAmount1, 0n];
    await transfer(0, 1, transferAmount1, expectedBalancesAfterTransfer1);

    const expectedBalancesAfterTransfer2 = [
      expectedBalancesAfterTransfer1[0] - transferAmount2,
      expectedBalancesAfterTransfer1[1],
      transferAmount2,
    ];
    await transfer(0, 2, transferAmount2, expectedBalancesAfterTransfer2);

    const expectedBalancesAfterTransfer3 = [
      expectedBalancesAfterTransfer2[0],
      expectedBalancesAfterTransfer2[1] - transferAmount3,
      expectedBalancesAfterTransfer2[2] + transferAmount3,
    ];
    await transfer(1, 2, transferAmount3, expectedBalancesAfterTransfer3);
  }, 300_000);
});
