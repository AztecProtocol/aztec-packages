import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import type { AztecNode } from '@aztec/aztec.js/node';
import { readFieldCompressedString } from '@aztec/aztec.js/utils';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { jest } from '@jest/globals';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import {
  type TestAccounts,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccountsWithTokens,
} from './setup_test_wallets.js';
import { ChainHealth, type ServiceEndpoint, getEthereumEndpoint, getRPCEndpoint, setupEnvironment } from './utils.js';

const config = { ...setupEnvironment(process.env) };

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 4000); // 40 minutes

  const logger = createLogger(`e2e:spartan:4epochs`);
  const l1Config = getL1ContractsConfigEnvVars();

  // We want plenty of minted tokens for a lot of slots that fill up multiple epochs
  const MINT_AMOUNT = 2000000n;
  const TEST_EPOCHS = 4;
  const MAX_MISSED_SLOTS = 10n;
  const ROUNDS = BigInt(l1Config.aztecEpochDuration * TEST_EPOCHS);

  let testAccounts: TestAccounts;
  let ETHEREUM_HOSTS: string[];
  const endpoints: ServiceEndpoint[] = [];
  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let cleanup: undefined | (() => Promise<void>);
  const health = new ChainHealth(config.NAMESPACE, logger);

  afterAll(async () => {
    await health.teardown();
    await cleanup?.();
    endpoints.forEach(e => e.process?.kill());
  });

  beforeAll(async () => {
    await health.setup();
    logger.info('Connecting to RPC and Ethereum nodes');
    const rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    const ethEndpoint = await getEthereumEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint, ethEndpoint);

    const rpcUrl = rpcEndpoint.url;
    ETHEREUM_HOSTS = [ethEndpoint.url];

    ({ wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger));

    // Setup wallets
    testAccounts = await deploySponsoredTestAccountsWithTokens(wallet, aztecNode, MINT_AMOUNT, logger);

    expect(ROUNDS).toBeLessThanOrEqual(MINT_AMOUNT);
    logger.info(`Tested wallets setup: ${ROUNDS} < ${MINT_AMOUNT}`);
  });

  it('can get info', async () => {
    const name = readFieldCompressedString(
      await testAccounts.tokenContract.methods.private_get_name().simulate({ from: testAccounts.tokenAdminAddress }),
    );
    expect(name).toBe(testAccounts.tokenName);
    logger.info(`Token name verified: ${name}`);
  });

  it('transfer tokens for 4 epochs', async () => {
    const ethCheatCodes = new EthCheatCodesWithState(ETHEREUM_HOSTS, new DateProvider());
    const l1ContractAddresses = await testAccounts.aztecNode.getNodeInfo().then(n => n.l1ContractAddresses);
    // Get 4 epochs
    const rollupCheatCodes = new RollupCheatCodes(ethCheatCodes, l1ContractAddresses);
    logger.info(`Deployed L1 contract addresses: ${JSON.stringify(l1ContractAddresses)}`);
    const recipient = testAccounts.recipientAddress;
    const transferAmount = 1n;

    for (const acc of testAccounts.accounts) {
      expect(MINT_AMOUNT).toBe(
        await testAccounts.tokenContract.methods
          .balance_of_public(acc)
          .simulate({ from: testAccounts.tokenAdminAddress }),
      );
    }

    logger.info('Minted tokens');

    expect(0n).toBe(
      await testAccounts.tokenContract.methods
        .balance_of_public(recipient)
        .simulate({ from: testAccounts.tokenAdminAddress }),
    );

    // For each round, make both private and public transfers
    const startSlot = await rollupCheatCodes.getSlot();
    for (let i = 1n; i <= ROUNDS; i++) {
      const txs = testAccounts.accounts.map(async acc => {
        return proveInteraction(
          wallet,
          testAccounts.tokenContract.methods.transfer_in_public(acc, recipient, transferAmount, 0),
          {
            from: acc,
            fee: {
              paymentMethod: new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()),
            },
          },
        );
      });

      const provenTxs = await Promise.all(txs);

      logger.info(`Proved ${provenTxs.length} in round ${i} of ${ROUNDS}`);

      await Promise.all(provenTxs.map(t => t.send({ wait: { timeout: 600 } })));
      const currentSlot = await rollupCheatCodes.getSlot();
      expect(BigInt(currentSlot)).toBeLessThanOrEqual(BigInt(startSlot) + i + MAX_MISSED_SLOTS);
      const startEpoch = await rollupCheatCodes.getEpoch();
      logger.debug(
        `Successfully reached slot ${currentSlot} (iteration ${
          currentSlot - startSlot
        }/${ROUNDS}) (Epoch ${startEpoch})`,
      );
    }

    for (const acc of testAccounts.accounts) {
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await testAccounts.tokenContract.methods
          .balance_of_public(acc)
          .simulate({ from: testAccounts.tokenAdminAddress }),
      );
    }

    expect(ROUNDS * transferAmount * BigInt(testAccounts.accounts.length)).toBe(
      await testAccounts.tokenContract.methods
        .balance_of_public(recipient)
        .simulate({ from: testAccounts.tokenAdminAddress }),
    );
  });
});
