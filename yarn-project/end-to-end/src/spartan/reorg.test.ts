// CREATE_CHAOS_MESH should be set to true to run this test
import type { AztecNode } from '@aztec/aztec.js/node';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';

import { expect, jest } from '@jest/globals';

import { TestWallet } from '../test-wallet/test_wallet.js';
import {
  type TestAccounts,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccountsWithTokens,
  performTransfers,
} from './setup_test_wallets.js';
import {
  ChainHealth,
  type ServiceEndpoint,
  applyProverFailure,
  getEthereumEndpoint,
  getGitProjectRoot,
  getRPCEndpoint,
  setupEnvironment,
} from './utils.js';

const config = { ...setupEnvironment(process.env) };
const debugLogger = createLogger('e2e:spartan-test:reorg');

async function checkBalances(testAccounts: TestAccounts, mintAmount: bigint, totalAmountTransferred: bigint) {
  for (const acc of testAccounts.accounts) {
    expect(
      (
        await testAccounts.tokenContract.methods
          .balance_of_public(acc)
          .simulate({ from: testAccounts.tokenAdminAddress })
      ).result,
    ).toBe(mintAmount - totalAmountTransferred);
  }

  expect(
    (
      await testAccounts.tokenContract.methods
        .balance_of_public(testAccounts.recipientAddress)
        .simulate({ from: testAccounts.tokenAdminAddress })
    ).result,
  ).toBe(totalAmountTransferred * BigInt(testAccounts.accounts.length));
}

// Reorg resilience test against a live k8s deployment. Runs transfers across multiple epochs, injects a
// prover failure via Chaos Mesh (CREATE_CHAOS_MESH), waits for chain recovery, and asserts token balances
// remain consistent after the reorg.
describe('reorg test', () => {
  jest.setTimeout(210 * 60 * 1000); // 210 minutes

  const MINT_AMOUNT = 2_000_000n;
  const SETUP_EPOCHS = 2;
  const TRANSFER_AMOUNT = 1n;
  let ETHEREUM_HOSTS: string[];
  const endpoints: ServiceEndpoint[] = [];
  let rpcUrl: string;
  let wallet: TestWallet;
  let spartanDir: string;

  let testAccounts: TestAccounts;
  let aztecNode: AztecNode;
  let cleanup: undefined | (() => Promise<void>);
  const health = new ChainHealth(config.NAMESPACE, debugLogger);

  afterAll(async () => {
    await health.teardown();
    await cleanup?.();
    endpoints.forEach(e => e.process?.kill());
  });

  beforeAll(async () => {
    await health.setup();
    const rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    const ethEndpoint = await getEthereumEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint, ethEndpoint);

    rpcUrl = rpcEndpoint.url;
    ETHEREUM_HOSTS = [ethEndpoint.url];
    spartanDir = `${getGitProjectRoot()}/spartan`;

    ({ wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, debugLogger));
    testAccounts = await deploySponsoredTestAccountsWithTokens(wallet, aztecNode, MINT_AMOUNT, debugLogger);
  });

  it('survives a reorg', async () => {
    const rollupCheatCodes = new RollupCheatCodes(
      new EthCheatCodesWithState(ETHEREUM_HOSTS, new DateProvider()),
      await testAccounts.aztecNode.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    const { epochDuration, slotDuration } = await rollupCheatCodes.getConfig();

    await performTransfers({
      wallet,
      testAccounts,
      rounds: Number(epochDuration) * SETUP_EPOCHS,
      transferAmount: TRANSFER_AMOUNT,
      logger: debugLogger,
    });
    await checkBalances(testAccounts, MINT_AMOUNT, TRANSFER_AMOUNT * epochDuration * BigInt(SETUP_EPOCHS));

    // get the tips before the reorg
    const { pending: preReorgPending, proven: preReorgProven } = await rollupCheatCodes.getTips();

    // kill the provers
    const stdout = await applyProverFailure({
      namespace: config.NAMESPACE,
      spartanDir,
      durationSeconds: Number(BigInt(epochDuration) * BigInt(slotDuration)) * 2,
      logger: debugLogger,
    });
    debugLogger.info(stdout);

    // We only need 2 epochs for a reorg to be triggered, but 3 gives time for the bot to be restarted and the chain to re-stabilize
    // TODO(#9613): why do we need to wait for 3 epochs?
    debugLogger.info(`Waiting for 3 epochs to pass`);
    await sleep(Number(BigInt(epochDuration) * BigInt(slotDuration)) * 3 * 1000);

    await cleanup?.();

    // Wait for the chain to produce a new pending block before restarting PXE
    const epochDurationSeconds = Number(epochDuration) * Number(slotDuration);
    const minWaitSeconds = 120;
    const stabilizationTimeoutSeconds = Math.max(minWaitSeconds + 60, Math.min(5 * 60, epochDurationSeconds / 2));
    try {
      const startPendingBlock = await rollupCheatCodes.getTips().then(t => t.pending);
      const startTime = Date.now();
      debugLogger.info(
        `Waiting for pending block to advance from ${startPendingBlock} (min wait: ${minWaitSeconds}s, timeout: ${stabilizationTimeoutSeconds}s)...`,
      );
      await retryUntil(
        async () => {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          const currentPending = await rollupCheatCodes.getTips().then(t => t.pending);
          if (currentPending > startPendingBlock && elapsedSeconds >= minWaitSeconds) {
            debugLogger.info(
              `Pending block advanced from ${startPendingBlock} to ${currentPending} after ${elapsedSeconds.toFixed(0)}s`,
            );
            return true;
          }
          return false;
        },
        'pending block to advance',
        stabilizationTimeoutSeconds,
        Number(slotDuration),
      );
      debugLogger.info('Chain has stabilized');
    } catch (err) {
      debugLogger.warn(`Pending block check timed out, continuing anyway: ${err}`);
    }

    // Restart the PXE
    ({ wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, debugLogger));

    // Wait for the RPC node's P2P client to be ready
    try {
      debugLogger.info('Waiting for RPC node to be ready...');
      await retryUntil(async () => await aztecNode.isReady(), 'node ready', 120, 1);
      debugLogger.info('RPC node is ready');
    } catch (err) {
      debugLogger.warn(`RPC node ready check timed out, continuing anyway: ${err}`);
    }

    testAccounts = await deploySponsoredTestAccountsWithTokens(wallet, aztecNode, MINT_AMOUNT, debugLogger);
    await performTransfers({
      wallet,
      testAccounts,
      rounds: Number(epochDuration) * SETUP_EPOCHS,
      transferAmount: TRANSFER_AMOUNT,
      logger: debugLogger,
    });

    // expect the block height to be at least 4 epochs worth of slots
    const { pending: newPending, proven: newProven } = await rollupCheatCodes.getTips();
    expect(newPending).toBeGreaterThan(preReorgPending);
    expect(newPending).toBeGreaterThan(4 * Number(epochDuration));
    expect(newProven).toBeGreaterThan(preReorgProven);
    expect(newProven).toBeGreaterThan(3 * Number(epochDuration));
  });
});
