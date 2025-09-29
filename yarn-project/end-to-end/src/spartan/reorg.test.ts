// CREATE_CHAOS_MESH should be set to true to run this test
import { type AztecNode, sleep } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { TestWallet } from '@aztec/test-wallet/server';

import { expect, jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import {
  type TestAccounts,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
  performTransfers,
} from './setup_test_wallets.js';
import { applyProverFailure, setupEnvironment, startPortForwardForEthereum, startPortForwardForRPC } from './utils.js';

const config = { ...setupEnvironment(process.env) };
const debugLogger = createLogger('e2e:spartan-test:reorg');

async function checkBalances(testAccounts: TestAccounts, mintAmount: bigint, totalAmountTransferred: bigint) {
  for (const acc of testAccounts.accounts) {
    expect(
      await testAccounts.tokenContract.methods
        .balance_of_public(acc)
        .simulate({ from: testAccounts.tokenAdminAddress }),
    ).toBe(mintAmount - totalAmountTransferred);
  }

  expect(
    await testAccounts.tokenContract.methods
      .balance_of_public(testAccounts.recipientAddress)
      .simulate({ from: testAccounts.tokenAdminAddress }),
  ).toBe(totalAmountTransferred * BigInt(testAccounts.accounts.length));
}

describe('reorg test', () => {
  jest.setTimeout(60 * 60 * 1000); // 60 minutes

  const MINT_AMOUNT = 2_000_000n;
  const SETUP_EPOCHS = 2;
  const TRANSFER_AMOUNT = 1n;
  let ETHEREUM_HOSTS: string[];
  const forwardProcesses: ChildProcess[] = [];
  let rpcUrl: string;
  let wallet: TestWallet;
  let testAccounts: TestAccounts;
  let aztecNode: AztecNode;
  let cleanup: undefined | (() => Promise<void>);

  afterAll(async () => {
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    const { process: ethProcess, port: ethPort } = await startPortForwardForEthereum(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    forwardProcesses.push(ethProcess);

    rpcUrl = `http://127.0.0.1:${aztecRpcPort}`;
    ETHEREUM_HOSTS = [`http://127.0.0.1:${ethPort}`];

    ({ wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, debugLogger));
    testAccounts = await deploySponsoredTestAccounts(wallet, aztecNode, MINT_AMOUNT, debugLogger);
  });

  it('survives a reorg', async () => {
    const rollupCheatCodes = new RollupCheatCodes(
      new EthCheatCodesWithState(ETHEREUM_HOSTS, new DateProvider()),
      await testAccounts.aztecNode.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    const { epochDuration, slotDuration } = await rollupCheatCodes.getConfig();

    await performTransfers({
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
      spartanDir: `/workspaces/aztec-packages/spartan`,
      durationSeconds: Number(epochDuration * slotDuration) * 2,
      logger: debugLogger,
    });
    debugLogger.info(stdout);

    // We only need 2 epochs for a reorg to be triggered, but 3 gives time for the bot to be restarted and the chain to re-stabilize
    // TODO(#9613): why do we need to wait for 3 epochs?
    debugLogger.info(`Waiting for 3 epochs to pass`);
    await sleep(Number(epochDuration * slotDuration) * 3 * 1000);

    // TODO(#9327): begin delete
    // The bot must be restarted because the PXE does not handle reorgs without a restart.
    // When the issue is fixed, we can remove the following restart logic
    await cleanup?.();
    await sleep(30 * 1000);

    // Restart the PXE
    ({ wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, debugLogger));

    await sleep(30 * 1000);
    testAccounts = await deploySponsoredTestAccounts(wallet, aztecNode, MINT_AMOUNT, debugLogger);
    // TODO(#9327): end delete

    await performTransfers({
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
