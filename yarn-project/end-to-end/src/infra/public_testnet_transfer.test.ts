import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { deriveKeys } from '@aztec/aztec.js/keys';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { PrivateTokenContract } from '@aztec/noir-contracts.js/PrivateToken';

import { foundry, sepolia } from 'viem/chains';

import { PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import { setup } from '../fixtures/utils.js';

// process.env.SEQ_PUBLISHER_PRIVATE_KEY = '<PRIVATE_KEY_WITH_SEPOLIA_ETH>';
// process.env.PROVER_PUBLISHER_PRIVATE_KEY = '<PRIVATE_KEY_WITH_SEPOLIA_ETH>';
// process.env.ETHEREUM_HOSTS= 'https://sepolia.infura.io/v3/<API_KEY>';
// process.env.L1_CHAIN_ID = '11155111';

// Public testnet transfer test. Calls setup() with PIPELINING_SETUP_OPTS but requires Sepolia credentials
// (SEQ_PUBLISHER_PRIVATE_KEY, ETHEREUM_HOSTS, L1_CHAIN_ID=11155111). CI-excluded; runs manually against a
// live public L1 network. Not a candidate for in-proc consolidation.
describe('infra/public_testnet_transfer', () => {
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
      2, // Create + fund 2 accounts.
      {
        ...PIPELINING_SETUP_OPTS,
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

    // Generate keys for the contract since PrivateToken uses SinglePrivateMutable which requires keys
    const tokenSecretKey = Fr.random();
    const tokenPublicKeys = (await deriveKeys(tokenSecretKey)).publicKeys;

    const tokenDeployment = PrivateTokenContract.deploy(wallet, initialBalance, deployerAddress, {
      universalDeploy: true,
      publicKeys: tokenPublicKeys,
    });
    const tokenInstance = await tokenDeployment.getInstance();
    await wallet.registerContract(tokenInstance, PrivateTokenContract.artifact, tokenSecretKey);
    const { contract: token } = await tokenDeployment.send({
      from: deployerAddress,
      // The contract constructor initializes private storage vars that need the contract's own nullifier key.
      additionalScopes: [tokenInstance.address],
      skipInstancePublication: true,
      skipClassPublication: true,
      skipInitialization: false,
    });

    logger.info(`Performing transfer.`);

    await token.methods
      .transfer(transferValue, deployerAddress, recipientAddress)
      .send({ from: deployerAddress, wait: { timeout: 300 } });

    logger.info(`Transfer completed`);

    const { result: balanceDeployer } = await token.methods
      .get_balance(deployerAddress)
      .simulate({ from: deployerAddress });
    const { result: balanceRecipient } = await token.methods
      .get_balance(recipientAddress)
      .simulate({ from: recipientAddress });

    logger.info(`Deployer balance: ${balanceDeployer}, Recipient balance: ${balanceRecipient}`);

    expect(balanceDeployer).toBe(initialBalance - transferValue);
    expect(balanceRecipient).toBe(transferValue);
  }, 600_000);
});
