import type { SentTx } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { Tx } from '@aztec/stdlib/tx';
import { ProvenTx, TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import {
  type TestAccountsWithoutTokens,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
} from './setup_test_wallets.js';
import { TxInclusionMetrics } from './tx_metrics.js';
import {
  getChartDir,
  getExternalIP,
  getGitProjectRoot,
  installChaosMeshChart,
  setupEnvironment,
  uninstallChaosMesh,
} from './utils.js';

const config = { ...setupEnvironment(process.env) };

type BenchmarkWallet = {
  testAccounts: TestAccountsWithoutTokens;
  cleanup: undefined | (() => Promise<void>);
};

const tpsTargets = (process.env.TPS_TARGET ?? '')
  .split(',')
  .map(tpsStr => parseFloat(tpsStr))
  .filter(tps => Number.isFinite(tps));

if (tpsTargets.length === 0) {
  throw new Error(`Environment variable TPS_TARGET is required`);
}

const maxTps = Math.max(...tpsTargets);

const CHAOS_MESH_NAME = 'network-shaping';

describe('sustained N TPS test', () => {
  jest.setTimeout(60 * 60 * 1000 * 3); // 3 hours

  const logger = createLogger(`e2e:spartan-test:sustained-tps`);
  const TEST_DURATION_SECONDS = parseInt(process.env.TEST_DURATION_SECONDS || '600', 10);
  const NUM_WALLETS = Math.max(1, Math.trunc(maxTps));

  const testAccounts: BenchmarkWallet[] = [];
  let aztecNode: AztecNode;
  let benchmarkContracts: BenchmarkingContract[] = [];
  const workers: SerialQueue = new SerialQueue();

  let metrics: TxInclusionMetrics;

  afterAll(async () => {
    for (const account of testAccounts) {
      if (!account.cleanup) {
        continue;
      }
      await account?.cleanup();
    }
    await workers.end();

    if (process.env.BENCH_OUTPUT) {
      await mkdir(dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(metrics.toGithubActionBenchmarkJSON()));
    }
  });

  afterAll(async () => {
    await uninstallChaosMesh(CHAOS_MESH_NAME, config.NAMESPACE, logger);
  });

  beforeAll(async () => {
    logger.info(`Starting test setup for sustained TPS tests over ${TEST_DURATION_SECONDS} seconds...`);

    const spartanDir = `${getGitProjectRoot()}/spartan`;
    const chaosMeshInstallation = installChaosMeshChart({
      logger,
      targetNamespace: config.NAMESPACE,
      instanceName: CHAOS_MESH_NAME,
      valuesFile: 'network-requirements.yaml',
      helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    });

    workers.start(NUM_WALLETS);
    const localWallets: TestWallet[] = [];
    const cleanupFunctions = [];
    const rpcIP = await getExternalIP(config.NAMESPACE, 'rpc-aztec-node');
    const rpcUrl = `http://${rpcIP}:8080`;
    aztecNode = createAztecNodeClient(rpcUrl);
    metrics = new TxInclusionMetrics(aztecNode);

    for (let i = 0; i < NUM_WALLETS; i++) {
      logger.info(`Creating wallet and pxe for wallet ${i + 1}/${NUM_WALLETS}`);
      const { wallet, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger);
      localWallets.push(wallet);
      cleanupFunctions.push(cleanup);
    }

    const localTestAccounts = await Promise.all(
      localWallets.map(lw => deploySponsoredTestAccounts(lw, aztecNode, logger)),
    );

    for (let i = 0; i < NUM_WALLETS; i++) {
      testAccounts.push({
        testAccounts: localTestAccounts[i],
        cleanup: cleanupFunctions[i],
      });
    }

    logger.info('Deploying Benchmarking contract/s...');

    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());

    // Deploy first contract to register the contract class
    logger.info('Deploying first contract to register contract class...');
    const firstContract = await BenchmarkingContract.deploy(testAccounts[0].testAccounts.wallet)
      .send({ from: testAccounts[0].testAccounts.accounts[0], fee: { paymentMethod: sponsor } })
      .deployed();

    logger.info('Contract class registered. Deploying remaining contracts in parallel...');

    // Deploy remaining contracts in parallel (contract class already registered)
    const remainingContractPromises = Array(NUM_WALLETS - 1)
      .fill(0)
      .map((_, index) =>
        BenchmarkingContract.deploy(testAccounts[index + 1].testAccounts.wallet)
          .send({ from: testAccounts[index + 1].testAccounts.accounts[0], fee: { paymentMethod: sponsor } })
          .deployed(),
      );
    const remainingContracts = await Promise.all(remainingContractPromises);

    benchmarkContracts = [firstContract, ...remainingContracts];

    logger.info(`Test setup complete`);

    await chaosMeshInstallation;
    cleanupFunctions.push(() => uninstallChaosMesh('network-shaping', config.NAMESPACE, logger));
  });

  const submitProven = async (duration: number, tps: number): Promise<SentTx[]> => {
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const txs: ProvenTx[] = [];
    const txPromises = [];
    const totalTxs = duration * tps;
    for (let i = 0; i < totalTxs; i++) {
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
    for (let sec = 0; sec < duration; sec++) {
      const secondStart = Date.now();
      const chunk = txs.splice(0, tps);
      chunk.forEach((tx, idx) => {
        const sentTx = tx.send();
        metrics.recordSentTx(tx, `proven_${tps}tps`);
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

  const submitUnproven = async (duration: number, tps: number): Promise<SentTx[]> => {
    logger.info(`Creating base tx for wallets to clone...`);
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const baseTxPromises = [];
    const totalTxs = duration * tps;
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

    const cloneTx = async (tx: ProvenTx, _index: number): Promise<ProvenTx> => {
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
      const clonedTx = new ProvenTx(aztecNode, clonedTxData, tx.offchainEffects, tx.stats);
      await clonedTx.recomputeHash();
      return clonedTx;
    };
    const interval = 1000 / tps;
    const sentTxPromises: Promise<SentTx>[] = [];
    for (let i = 0; i < totalTxs; i++) {
      const workerIndex = i % NUM_WALLETS;
      const baseTx = baseTxs[workerIndex];
      const prom = workers.put(async () => {
        const tx = await cloneTx(baseTx, workerIndex);
        const sentTx = tx.send();
        logger.info(`sent tx ${i + 1}`);
        metrics.recordSentTx(tx, `unproven_${tps}tps`);
        return sentTx;
      });
      sentTxPromises.push(prom);
      await sleep(interval);
    }
    return Promise.all(sentTxPromises);
  };

  it.each(tpsTargets)('can send %d_tps', async tps => {
    const TOTAL_TXS = TEST_DURATION_SECONDS * tps;
    logger.info(`Proving benchmark transactions...`);

    const sentTxs = await (config.REAL_VERIFIER
      ? submitProven(TEST_DURATION_SECONDS, tps)
      : submitUnproven(TEST_DURATION_SECONDS, tps));

    logger.info(`Sending benchmark transactions at target TPS...`);

    // Now wait for all transactions to be included
    logger.info(`All ${TOTAL_TXS} transactions sent. Waiting for inclusion...`);

    const results: { success: boolean; tx: SentTx; error?: any }[] = [];

    const waitForTx = async (sentTx: SentTx, index: number) => {
      try {
        const receipt = await sentTx.wait({
          timeout: 1200,
          interval: 1,
          ignoreDroppedReceiptsFor: 2,
        });
        if (receipt.blockNumber) {
          logger.info(`tx ${index + 1} included in block ${receipt.blockNumber}`);
          await metrics.recordMinedTx(receipt);
        } else {
          throw new Error('Invalid txReceipt: ' + JSON.stringify(receipt));
        }
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
