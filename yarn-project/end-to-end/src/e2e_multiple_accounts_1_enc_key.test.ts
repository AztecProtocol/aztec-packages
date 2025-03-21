import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';
import { type CompleteAddress, Fr, GrumpkinScalar, type Logger, type Wallet, deriveKeys } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { deployToken, expectTokenBalance } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

describe('e2e_multiple_accounts_1_enc_key', () => {
  let wallets: Wallet[] = [];
  let accounts: CompleteAddress[] = [];
  let logger: Logger;
  let teardown: () => Promise<void>;

  let token: TokenContract;

  const initialBalance = 987n;
  const numAccounts = 3;

  beforeEach(async () => {
    // A shared secret for all accounts.
    const secret = Fr.random();

    const initialFundedAccounts = await Promise.all(
      Array.from({ length: numAccounts }).map(async () => {
        // A different signing key for each account.
        const signingKey = GrumpkinScalar.random();
        const salt = Fr.random();
        const address = await getSchnorrAccountContractAddress(secret, salt, signingKey);
        return {
          secret,
          signingKey,
          salt,
          address,
        };
      }),
    );

    ({ teardown, logger, wallets } = await setup(numAccounts, { initialFundedAccounts }));
    logger.info('Account contracts deployed');

    accounts = wallets.map(w => w.getCompleteAddress());

    // Verify that all accounts use the same encryption key
    const encryptionPublicKey = (await deriveKeys(secret)).publicKeys.masterIncomingViewingPublicKey;
    for (const account of accounts) {
      expect(account.publicKeys.masterIncomingViewingPublicKey).toEqual(encryptionPublicKey);
    }

    token = await deployToken(wallets[0], initialBalance, logger);
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

    const contractWithWallet = await TokenContract.at(token.address, wallets[senderIndex]);

    await contractWithWallet.methods.transfer(receiver, transferAmount).send().wait();

    for (let i = 0; i < expectedBalances.length; i++) {
      await expectTokenBalance(wallets[i], token, wallets[i].getAddress(), expectedBalances[i], logger);
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

    await expectTokenBalance(wallets[0], token, wallets[0].getAddress(), initialBalance, logger);
    await expectTokenBalance(wallets[1], token, wallets[1].getAddress(), 0n, logger);
    await expectTokenBalance(wallets[2], token, wallets[2].getAddress(), 0n, logger);

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
  }, 120_000);
});
