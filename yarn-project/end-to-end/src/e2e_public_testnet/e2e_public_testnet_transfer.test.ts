import type { AccountWalletWithSecretKey, Logger } from '@aztec/aztec.js';
import { EasyPrivateTokenContract } from '@aztec/noir-contracts.js/EasyPrivateToken';

import { foundry, sepolia } from 'viem/chains';

import { setup } from '../fixtures/utils.js';

// process.env.SEQ_PUBLISHER_PRIVATE_KEY = '<PRIVATE_KEY_WITH_SEPOLIA_ETH>';
// process.env.PROVER_PUBLISHER_PRIVATE_KEY = '<PRIVATE_KEY_WITH_SEPOLIA_ETH>';
// process.env.ETHEREUM_HOSTS= 'https://sepolia.infura.io/v3/<API_KEY>';
// process.env.L1_CHAIN_ID = '11155111';

describe(`deploys and transfers a private only token`, () => {
  let deployerWallet: AccountWalletWithSecretKey;
  let recipientWallet: AccountWalletWithSecretKey;
  let logger: Logger;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    const chainId = !process.env.L1_CHAIN_ID ? foundry.id : +process.env.L1_CHAIN_ID;
    const chain = chainId == sepolia.id ? sepolia : foundry; // Not the best way of doing this.
    let wallets: AccountWalletWithSecretKey[];
    ({ logger, teardown, wallets } = await setup(
      2, // Deploy 2 accounts.
      {
        numberOfInitialFundedAccounts: 2, // Fund 2 accounts.
        skipProtocolContracts: true,
        stateLoad: undefined,
      },
      {},
      chain,
    ));

    [deployerWallet, recipientWallet] = wallets;
  }, 600_000);

  afterEach(async () => {
    await teardown();
  });

  it('calls a private function', async () => {
    const initialBalance = 100_000_000_000n;
    const transferValue = 5n;

    const token = await EasyPrivateTokenContract.deploy(deployerWallet, initialBalance, deployerWallet.getAddress())
      .send({
        universalDeploy: true,
        skipInstancePublication: true,
        skipClassPublication: true,
        skipInitialization: false,
      })
      .deployed({ timeout: 300 });

    logger.info(`Performing transfer.`);

    await token.methods
      .transfer(transferValue, deployerWallet.getAddress(), recipientWallet.getAddress())
      .send()
      .wait({ timeout: 300 });

    logger.info(`Transfer completed`);

    const balanceDeployer = await token.methods.get_balance(deployerWallet.getAddress()).simulate();
    const balanceRecipient = await token.methods.get_balance(recipientWallet.getAddress()).simulate();

    logger.info(`Deployer balance: ${balanceDeployer}, Recipient balance: ${balanceRecipient}`);

    expect(balanceDeployer).toBe(initialBalance - transferValue);
    expect(balanceRecipient).toBe(transferValue);
  }, 600_000);
});
