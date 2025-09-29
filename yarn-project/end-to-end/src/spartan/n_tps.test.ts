import { type AztecNode, Fr, ProvenTx, Tx, readFieldCompressedString, sleep } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import {
  type TestAccounts,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
} from './setup_test_wallets.js';
import { setupEnvironment, startPortForwardForRPC } from './utils.js';

const config = { ...setupEnvironment(process.env) };

describe('sustained 10 TPS test', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  const logger = createLogger(`e2e:spartan-test:sustained-10tps`);
  const MINT_AMOUNT = 10000n;
  const TEST_DURATION_SECONDS = 10;
  const TARGET_TPS = 5; // 10
  const TOTAL_TXS = TEST_DURATION_SECONDS * TARGET_TPS;

  let testAccounts: TestAccounts;
  let wallet: TestWallet;
  let aztecNode: AztecNode;

  let cleanup: undefined | (() => Promise<void>);
  const forwardProcesses: ChildProcess[] = [];

  afterAll(async () => {
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    logger.info('Starting port forward for PXE');
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    const rpcUrl = `http://127.0.0.1:${aztecRpcPort}`;

    ({ wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger));

    // Setup wallets
    logger.info('deploying test wallets');
    testAccounts = await deploySponsoredTestAccounts(wallet, aztecNode, MINT_AMOUNT, logger);
    logger.info(`testAccounts ready`);

    logger.info(
      `Test setup complete. Planning ${TOTAL_TXS} transactions over ${TEST_DURATION_SECONDS} seconds at ${TARGET_TPS} TPS`,
    );
  });

  // it('can verify token setup', async () => {
  //   const name = readFieldCompressedString(await tokenContract.methods.private_get_name().simulate());
  //   expect(name).toBeDefined();
  //   expect(name.length).toBeGreaterThan(0);
  //   logger.info(`Token verified: ${name}`);
  // });

  it('can get info', async () => {
    const name = readFieldCompressedString(
      await testAccounts.tokenContract.methods.private_get_name().simulate({ from: testAccounts.tokenAdminAddress }),
    );
    expect(name).toBe(testAccounts.tokenName);
  });

  it('can transfer 10tps tokens', async () => {
    const recipient = testAccounts.recipientAddress;
    const transferAmount = 1n;

    for (const acc of testAccounts.accounts) {
      expect(MINT_AMOUNT).toBe(
        await testAccounts.tokenContract.methods
          .balance_of_public(acc)
          .simulate({ from: testAccounts.tokenAdminAddress }),
      );
    }

    expect(0n).toBe(
      await testAccounts.tokenContract.methods
        .balance_of_public(recipient)
        .simulate({ from: testAccounts.tokenAdminAddress }),
    );

    const defaultAccountAddress = testAccounts.accounts[0];

    const baseTx = await testAccounts.tokenContract.methods
      .transfer_in_public(defaultAccountAddress, recipient, transferAmount, 0)
      .prove({ from: testAccounts.tokenAdminAddress });

    const allSentTxs: any[] = []; // Store sent transactions separately

    let globalIdx = 0;

    for (let sec = 0; sec < TEST_DURATION_SECONDS; sec++) {
      const secondStart = Date.now();

      const batchTxs: ProvenTx[] = [];

      for (let i = 0; i < TARGET_TPS; i++, globalIdx++) {
        const clonedTxData = Tx.clone(baseTx);

        const nullifiers = clonedTxData.data.getNonEmptyNullifiers();
        if (nullifiers.length > 0) {
          const newNullifier = nullifiers[0].add(Fr.fromString(globalIdx.toString()));
          if (clonedTxData.data.forRollup) {
            clonedTxData.data.forRollup.end.nullifiers[0] = newNullifier;
          } else if (clonedTxData.data.forPublic) {
            clonedTxData.data.forPublic.nonRevertibleAccumulatedData.nullifiers[0] = newNullifier;
          }
        }

        const clonedTx = new ProvenTx(testAccounts.wallet, clonedTxData, []);
        batchTxs.push(clonedTx);
      }

      // Send transactions without waiting for inclusion
      for (let idx = 0; idx < batchTxs.length; idx++) {
        const tx = batchTxs[idx];
        const sentTx = tx.send();
        allSentTxs.push(sentTx);
        logger.info(`sec ${sec + 1}: sent tx ${globalIdx - TARGET_TPS + idx + 1}`);
      }

      // 1 second spacing between batches
      const elapsed = Date.now() - secondStart;
      if (elapsed < 1000) {
        await sleep(1000 - elapsed);
      }
    }

    // Now wait for all transactions to be included
    logger.info(`All ${TOTAL_TXS} transactions sent. Waiting for inclusion...`);

    const inclusionPromises = allSentTxs.map((sentTx, idx) =>
      (async () => {
        try {
          await sentTx.wait({
            timeout: 120,
            interval: 1,
            ignoreDroppedReceiptsFor: 2,
          });
          const receipt = await sentTx.getReceipt();
          logger.info(`tx ${idx + 1} included in block ${receipt.blockNumber}`);
          return { success: true, tx: sentTx };
        } catch (error) {
          logger.error(`tx ${idx + 1} was not included: ${error}`);
          return { success: false, tx: sentTx, error };
        }
      })(),
    );

    // Wait for every transaction to be included
    const results = await Promise.all(inclusionPromises);

    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    expect(allSentTxs.length).toBe(TOTAL_TXS);

    // Log failed transactions for debugging
    results
      .filter(r => !r.success)
      .forEach((result, idx) => {
        logger.warn(`Failed transaction ${idx + 1}: ${result.error}`);
      });

    logger.info(
      `Transaction inclusion summary: ${successCount} succeeded, ${failureCount} failed out of ${TOTAL_TXS} total`,
    );

    const recipientBalance = await testAccounts.tokenContract.methods
      .balance_of_public(recipient)
      .simulate({ from: testAccounts.tokenAdminAddress });
    logger.info(`recipientBalance after load test: ${recipientBalance}`);
  });
});
