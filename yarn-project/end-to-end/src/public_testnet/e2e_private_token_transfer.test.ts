import {
  AztecNode,
  type DebugLogger,
  DeployL1Contracts,
  Fr,
  type PXE,
} from '@aztec/aztec.js';

import { setup } from '../fixtures/utils.js';
import { EasyPrivateTokenContract } from '@aztec/noir-contracts.js';
import { createAccounts } from '@aztec/accounts/testing';
import { getProverNodeConfigFromEnv, ProverNode, ProverNodeConfig } from '@aztec/prover-node';
import { createAndSyncProverNode } from '../fixtures/snapshot_manager.js';
import { AztecNodeConfig } from '@aztec/aztec-node';

process.env.SEQ_PUBLISHER_PRIVATE_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
process.env.PROVER_PUBLISHER_PRIVATE_KEY = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';

describe(`deploys and transfers a private only token`, () => {
  let secretKey1: Fr;
  let secretKey2: Fr;
  let proverConfig: ProverNodeConfig;
  let config: AztecNodeConfig;
  let aztecNode: AztecNode;
  let proverNode: ProverNode;

  let pxe: PXE;
  let logger: DebugLogger;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ logger, pxe, teardown, config, aztecNode } = await setup(0, {skipProtocolContracts: true, stateLoad: undefined}));
    proverConfig = getProverNodeConfigFromEnv();

    //proverNode = await createAndSyncProverNode(config.l1Contracts.rollupAddress, proverConfig.publisherPrivateKey, config, aztecNode);
  });

  afterEach(() => teardown());

  it('calls a private function', async () => {
    const initialBalance = 100000000000n;
    const transferValue = 5n;
    secretKey1 = Fr.random();
    secretKey2 = Fr.random();

    logger.info(`Deploying accounts.`)

    const accounts = await createAccounts(pxe, 2, [secretKey1, secretKey2]);

    logger.info(`Accounts deployed, deploying token.`);

    const [deployerWallet, recipientWallet] = accounts;

    const token = await EasyPrivateTokenContract.deploy(
      deployerWallet,
      initialBalance,
      deployerWallet.getAddress(),
      deployerWallet.getAddress(),
    ).send({
      universalDeploy: true,
      skipPublicDeployment: true,
      skipClassRegistration: true,
      skipInitialization: false,
      skipPublicSimulation: true,
    }).deployed({
      proven: false,
      provenTimeout: 600,
    });

    logger.info(`Performing transfer.`);

    await token.methods.transfer(transferValue, deployerWallet.getAddress(), recipientWallet.getAddress(), deployerWallet.getAddress()).send().wait({proven: false, provenTimeout: 600});

    logger.info(`Transfer completed`);

    const balanceDeployer = await token.methods.get_balance(deployerWallet.getAddress()).simulate();
    const balanceRecipient = await token.methods.get_balance(recipientWallet.getAddress()).simulate();

    logger.info(`Deployer balance: ${balanceDeployer}, Recipient balance: ${balanceRecipient}`);

    expect(balanceDeployer).toBe(initialBalance - transferValue);
    expect(balanceRecipient).toBe(transferValue);
  });
});