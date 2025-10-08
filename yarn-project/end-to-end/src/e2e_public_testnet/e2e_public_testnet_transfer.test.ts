import type { AztecAddress, Logger, Wallet } from '@aztec/aztec.js';
import { PrivateTokenContract } from '@aztec/noir-contracts.js/PrivateToken';

import { foundry, sepolia } from 'viem/chains';

import { setup } from '../fixtures/utils.js';

// process.env.SEQ_PUBLISHER_PRIVATE_KEY = '<PRIVATE_KEY_WITH_SEPOLIA_ETH>';
// process.env.PROVER_PUBLISHER_PRIVATE_KEY = '<PRIVATE_KEY_WITH_SEPOLIA_ETH>';
// process.env.ETHEREUM_HOSTS= 'https://sepolia.infura.io/v3/<API_KEY>';
// process.env.L1_CHAIN_ID = '11155111';

describe(`deploys and transfers a private only token`, () => {
  let wallet: Wallet;

  let deployerAddress: AztecAddress;
  let recipientAddress: AztecAddress;

  let logger: Logger;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    const chainId = !process.env.L1_CHAIN_ID ? foundry.id : +process.env.L1_CHAIN_ID;
    const chain = chainId == sepolia.id ? sepolia : foundry; // Not the best way of doing this.
    let accounts: AztecAddress[];
    ({ logger, teardown, wallet, accounts } = await setup(
      2, // Deploy 2 accounts.
      {
        numberOfInitialFundedAccounts: 2, // Fund 2 accounts.
        skipProtocolContracts: true,
        stateLoad: undefined,
      },
      {},
      chain,
    ));

    [deployerAddress, recipientAddress] = accounts;
  }, 600_000);

  afterEach(async () => {
    await teardown();
  });

  it('calls a private function', async () => {
    const initialBalance = 100_000_000_000n;
    const transferValue = 5n;

    const token = await PrivateTokenContract.deploy(wallet, initialBalance, deployerAddress)
      .send({
        from: deployerAddress,
        universalDeploy: true,
        skipInstancePublication: true,
        skipClassPublication: true,
        skipInitialization: false,
      })
      .deployed({ timeout: 300 });

    logger.info(`Performing transfer.`);

    await token.methods
      .transfer(transferValue, deployerAddress, recipientAddress)
      .send({ from: deployerAddress })
      .wait({ timeout: 300 });

    logger.info(`Transfer completed`);

    const balanceDeployer = await token.methods.get_balance(deployerAddress).simulate({ from: deployerAddress });
    const balanceRecipient = await token.methods.get_balance(recipientAddress).simulate({ from: recipientAddress });

    logger.info(`Deployer balance: ${balanceDeployer}, Recipient balance: ${balanceRecipient}`);

    expect(balanceDeployer).toBe(initialBalance - transferValue);
    expect(balanceRecipient).toBe(transferValue);
  }, 600_000);
});
