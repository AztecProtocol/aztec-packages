import type { SentTx } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import type { AztecNode } from '@aztec/aztec.js/node';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { Tx } from '@aztec/stdlib/tx';
import { ProvenTx, TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import {
  type TestAccountsWithoutTokens,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
} from './setup_test_wallets.js';
import { setupEnvironment, startPortForwardForRPC } from './utils.js';

const config = { ...setupEnvironment(process.env) };

type BenchmarkWallet = {
  testAccounts: TestAccountsWithoutTokens;
  cleanup: undefined | (() => Promise<void>);
};

describe('sustained N TPS test', () => {
  jest.setTimeout(60 * 60 * 1000 * 3); // 3 hours

  const logger = createLogger(`e2e:spartan-test:sustained-10tps`);
  const TEST_DURATION_SECONDS = parseInt(process.env.TEST_DURATION_SECONDS || '600', 10);
  const TARGET_TPS = parseInt(process.env.TARGET_TPS || '10', 10);
  const TOTAL_TXS = TEST_DURATION_SECONDS * TARGET_TPS;
  const NUM_WALLETS = TARGET_TPS;
  const NUM_AVAILABLE_RPCS = parseInt(process.env.RPC_REPLICAS || '1', 10);

  const testAccounts: BenchmarkWallet[] = [];
  const aztecNodes: AztecNode[] = [];
  let benchmarkContracts: BenchmarkingContract[] = [];
  const workers: SerialQueue = new SerialQueue();

  const forwardProcesses: ChildProcess[] = [];

  afterAll(async () => {
    for (const account of testAccounts) {
      if (!account.cleanup) {
        continue;
      }
      await account?.cleanup();
    }
    forwardProcesses.forEach(p => p.kill());
    await workers.end();
  });

  beforeAll(async () => {
    logger.info(`Starting test setup for sustained ${TARGET_TPS} TPS over ${TEST_DURATION_SECONDS} seconds...`);
    workers.start(NUM_WALLETS);
    const localWallets: TestWallet[] = [];
    const cleanupFunctions = [];
    for (let i = 0; i < NUM_WALLETS; i++) {
      logger.info(
        `Starting port forward for PXE for wallet ${i + 1}/${NUM_WALLETS} to RPC index ${i % NUM_AVAILABLE_RPCS}`,
      );
      const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(
        config.NAMESPACE,
        'pod',
        i % NUM_AVAILABLE_RPCS,
      );
      forwardProcesses.push(aztecRpcProcess);
      const rpcUrl = `http://127.0.0.1:${aztecRpcPort}`;

      logger.info(`Creating wallet and pxe for wallet ${i + 1}/${NUM_WALLETS}`);
      const { wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger);
      localWallets.push(wallet);
      cleanupFunctions.push(cleanup);
      aztecNodes.push(aztecNode);
    }

    const localTestAccounts = await Promise.all(
      localWallets.map(lw => deploySponsoredTestAccounts(lw, aztecNodes[0], logger)),
    );

    for (let i = 0; i < NUM_WALLETS; i++) {
      testAccounts.push({
        testAccounts: localTestAccounts[i],
        cleanup: cleanupFunctions[i],
      });
    }

    logger.info('Deploying Benchmarking contract/s...');

    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const benchmarkContractPromises = Array(NUM_WALLETS)
      .fill(0)
      .map((_, index) =>
        BenchmarkingContract.deploy(testAccounts[index].testAccounts.wallet)
          .send({ from: testAccounts[index].testAccounts.accounts[0], fee: { paymentMethod: sponsor } })
          .deployed(),
      );
    benchmarkContracts = await Promise.all(benchmarkContractPromises);

    logger.info(
      `Test setup complete. Planning ${TOTAL_TXS} transactions over ${TEST_DURATION_SECONDS} seconds at ${TARGET_TPS} TPS`,
    );
  });

  const submitProven = async () => {
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const txs: ProvenTx[] = [];
    const txPromises = [];
    for (let i = 0; i < TOTAL_TXS; i++) {
      const workerIndex = i % NUM_WALLETS;
      const from = testAccounts[workerIndex].testAccounts.accounts[0];
      const wallet = testAccounts[workerIndex].testAccounts.wallet;
      const benchmarkContract = benchmarkContracts[workerIndex];

      const txPromise = workers.put(async () => {
        const tx = await proveInteraction(wallet, benchmarkContract.methods.sha256_hash_1024(Array(1024).fill(42)), {
          from,
          fee: { paymentMethod: sponsor },
        });
        return tx;
      });
      txPromises.push(txPromise);
    }
    const provedTxs = await Promise.all(txPromises);
    txs.push(...provedTxs);

    const allSentTxs: SentTx[] = [];
    let sentSoFar = 0;
    for (let sec = 0; sec < TEST_DURATION_SECONDS; sec++) {
      const secondStart = Date.now();
      const chunk = txs.splice(0, TARGET_TPS);
      chunk.forEach((tx, idx) => {
        const sentTx = tx.send();
        allSentTxs.push(sentTx);
        logger.info(`sec ${sec + 1}: sent tx ${sentSoFar + idx + 1}`);
      });

      sentSoFar += chunk.length;
      const elapsed = Date.now() - secondStart;
      if (elapsed < 1000) {
        await sleep(1000 - elapsed);
      }
    }

    return allSentTxs;
  };

  const submitUnproven = async () => {
    logger.info(`Proving transaction for each wallet to clone...`);
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const baseTxPromises = [];
    for (let i = 0; i < NUM_WALLETS; i++) {
      const wallet = testAccounts[i].testAccounts.wallet;
      const from = testAccounts[i].testAccounts.accounts[0];
      const benchmarkContract = benchmarkContracts[i];

      const baseTxPromise = workers.put(async () => {
        const tx = await proveInteraction(wallet, benchmarkContract.methods.create_note(from, 10), {
          from,
          fee: { paymentMethod: sponsor },
        });
        return tx;
      });
      baseTxPromises.push(baseTxPromise);
    }
    const baseTxs = await Promise.all(baseTxPromises);

    logger.info(`Cloning and sending benchmark transactions...`);

    const cloneAndSend = async (tx: ProvenTx, index: number) => {
      // Clone the transaction
      const clonedTxData = Tx.clone(tx, false);

      if (clonedTxData.data.forRollup) {
        for (let i = 0; i < clonedTxData.data.forRollup?.end.nullifiers.length; i++) {
          if (clonedTxData.data.forRollup?.end.nullifiers[i].isZero()) {
            continue;
          }
          clonedTxData.data.forRollup.end.nullifiers[i] = Fr.random();
        }
      } else if (clonedTxData.data.forPublic) {
        for (let i = 0; i < clonedTxData.data.forPublic.nonRevertibleAccumulatedData.nullifiers.length; i++) {
          if (clonedTxData.data.forPublic?.nonRevertibleAccumulatedData.nullifiers[i].isZero()) {
            continue;
          }
          clonedTxData.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i] = Fr.random();
        }
      }
      const clonedTx = new ProvenTx(aztecNodes[index], clonedTxData, tx.offchainEffects, tx.stats);
      await clonedTx.recomputeHash();
      return clonedTx.send();
    };
    const interval = 1000 / TARGET_TPS;
    const sentTxPromises: Promise<SentTx>[] = [];
    for (let i = 0; i < TOTAL_TXS; i++) {
      const workerIndex = i % NUM_WALLETS;
      const baseTx = baseTxs[workerIndex];
      const prom = workers.put(async () => {
        const sentTx = await cloneAndSend(baseTx, workerIndex);
        logger.info(`sent tx ${i + 1}`);
        return sentTx;
      });
      sentTxPromises.push(prom);
      await sleep(interval);
    }
    return Promise.all(sentTxPromises);
  };

  it('can send n_tps', async () => {
    const TOTAL_TXS = TEST_DURATION_SECONDS * TARGET_TPS;
    logger.info(`Proving benchmark transactions...`);

    let sentTxs: SentTx[] = [];

    if (config.REAL_VERIFIER === true) {
      sentTxs = await submitProven();
    } else {
      sentTxs = await submitUnproven();
    }

    logger.info(`Sending benchmark transactions at target TPS...`);

    // Now wait for all transactions to be included
    logger.info(`All ${TOTAL_TXS} transactions sent. Waiting for inclusion...`);

    const results: { success: boolean; tx: SentTx; error?: any }[] = [];

    const waitForTx = async (sentTx: SentTx, index: number) => {
      try {
        await sentTx.wait({
          timeout: 1200,
          interval: 1,
          ignoreDroppedReceiptsFor: 2,
        });
        const receipt = await sentTx.getReceipt();
        logger.info(`tx ${index + 1} included in block ${receipt.blockNumber}`);
        results.push({ success: true, tx: sentTx });
      } catch (error) {
        logger.error(`tx ${index + 1} was not included: ${error}`);
        results.push({ success: false, tx: sentTx, error });
      }
    };

    let index = 0;
    while (sentTxs.length > 0) {
      const chunk = sentTxs.splice(0, 10);
      await Promise.all(chunk.map((tx, idx) => waitForTx(tx, idx + index)));
      index += chunk.length;
    }

    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    expect(results.length).toBe(TOTAL_TXS);

    // Log failed transactions for debugging
    results
      .filter(r => !r.success)
      .forEach((result, idx) => {
        logger.warn(`Failed transaction ${idx + 1}: ${result.error}`);
      });

    logger.info(
      `Transaction inclusion summary: ${successCount} succeeded, ${failureCount} failed out of ${TOTAL_TXS} total`,
    );
  });
});
