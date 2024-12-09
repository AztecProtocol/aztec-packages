import { createAccounts } from '@aztec/accounts/testing';
import { Fr, type Logger, type PXE } from '@aztec/aztec.js';
import { EasyPrivateTokenContract } from '@aztec/noir-contracts.js';

import { foundry, sepolia } from 'viem/chains';

import { setup } from '../fixtures/utils.js';

// process.env.SEQ_PUBLISHER_PRIVATE_KEY = '<PRIVATE_KEY_WITH_SEPOLIA_ETH>';
// process.env.PROVER_PUBLISHER_PRIVATE_KEY = '<PRIVATE_KEY_WITH_SEPOLIA_ETH>';
// process.env.ETHEREUM_HOST= 'https://sepolia.infura.io/v3/<API_KEY>';
// process.env.L1_CHAIN_ID = '11155111';

describe(`deploys and transfers a private only token`, () => {
  let secretKey1: Fr;
  let secretKey2: Fr;

  let pxe: PXE;
  let logger: Logger;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    const chainId = !process.env.L1_CHAIN_ID ? foundry.id : +process.env.L1_CHAIN_ID;
    const chain = chainId == sepolia.id ? sepolia : foundry; // Not the best way of doing this.
    ({ logger, pxe, teardown } = await setup(0, { skipProtocolContracts: true, stateLoad: undefined }, {}, chain));
  }, 600_000);

  afterEach(async () => {
    await teardown();
  });

  it('calls a private function', async () => {
    const initialBalance = 100_000_000_000n;
    const transferValue = 5n;
    secretKey1 = Fr.random();
    secretKey2 = Fr.random();

    logger.info(`Deploying accounts.`);

    const accounts = await createAccounts(pxe, 2, [secretKey1, secretKey2], { interval: 0.1, timeout: 300 });

    logger.info(`Accounts deployed, deploying token.`);

    const [deployerWallet, recipientWallet] = accounts;

    const token = await EasyPrivateTokenContract.deploy(deployerWallet, initialBalance, deployerWallet.getAddress())
      .send({
        universalDeploy: true,
        skipPublicDeployment: true,
        skipClassRegistration: true,
        skipInitialization: false,
        skipPublicSimulation: true,
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
