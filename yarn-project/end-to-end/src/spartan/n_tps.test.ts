import type { SentTx } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { GasFees } from '@aztec/stdlib/gas';
import { Tx } from '@aztec/stdlib/tx';
import { ProvenTx, TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import {
  type WalletWrapper,
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

const lowValueTps = parseFloat(process.env.LOW_VALUE_TPS ?? '');
if (!Number.isFinite(lowValueTps)) {
  throw new Error(`Environment variable BACKGROUND_TPS is required`);
}

const lowValueAccounts = Math.ceil(lowValueTps);

const highValueTps = parseFloat(process.env.HIGH_VALUE_TPS ?? '');
if (!Number.isFinite(highValueTps)) {
  throw new Error(`Environment variable TARGET_TPS is required`);
}

const highValueAccounts = Math.ceil(highValueTps);

if (lowValueAccounts + highValueAccounts <= 0) {
  throw new Error('Total TPS is 0');
}

const CHAOS_MESH_NAME = 'network-shaping';

describe('sustained N TPS test', () => {
  jest.setTimeout(60 * 60 * 1000 * 10); // 10 hours

  const logger = createLogger(`e2e:spartan-test:sustained-tps`);
  const TEST_DURATION_SECONDS = parseInt(process.env.TEST_DURATION_SECONDS || '600', 10);

  let testWallets: WalletWrapper[];
  let lowValueWallets: TestWallet[];
  let highValueWallets: TestWallet[];

  let aztecNode: AztecNode;
  let benchmarkContract: BenchmarkingContract;

  let metrics: TxInclusionMetrics;

  afterAll(async () => {
    for (const { cleanup } of testWallets!) {
      await cleanup();
    }

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

    const rpcIP = await getExternalIP(config.NAMESPACE, 'rpc-aztec-node');
    const rpcUrl = `http://${rpcIP}:8080`;
    aztecNode = createAztecNodeClient(rpcUrl);
    metrics = new TxInclusionMetrics(aztecNode);

    await retryUntil(
      async () => {
        const blockNumber = await aztecNode.getBlockNumber();
        if (blockNumber > INITIAL_L2_BLOCK_NUM) {
          return true;
        }
        logger.info('Waiting for the first block to mine...');
        return false;
      },
      'get block number',
      60 * 60 * 3, // wait up to 3 hours
      60,
    );

    testWallets = await timesAsync(lowValueAccounts + highValueAccounts, i => {
      logger.info(`Creating wallet and pxe for wallet ${i + 1}/${lowValueAccounts + highValueAccounts}`);
      return createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger);
    });

    // this function creates n + 1 accounts. We only want one for each wallet
    const localTestAccounts = await Promise.all(
      testWallets.map(lw => deploySponsoredTestAccounts(lw.wallet, aztecNode, logger, 0)),
    );

    lowValueWallets = localTestAccounts.slice(0, lowValueAccounts).map(({ wallet }) => wallet);
    highValueWallets = localTestAccounts.slice(lowValueAccounts).map(({ wallet }) => wallet);

    logger.info('Deploying benchmark contract...');
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    benchmarkContract = await BenchmarkingContract.deploy(localTestAccounts[0].wallet)
      .send({ from: localTestAccounts[0].accounts[0], fee: { paymentMethod: sponsor } })
      .deployed();

    logger.info(`Awaiting chaos mesh installation`);
    await chaosMeshInstallation;

    logger.info(`Test setup complete`);
  });

  const submitProven = async (
    wallet: TestWallet,
    maxPriorityFeesPerGas: GasFees = GasFees.empty(),
  ): Promise<ProvenTx> => {
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const tx = await proveInteraction(wallet, benchmarkContract.methods.sha256_hash_1024(Array(1024).fill(42)), {
      from: (await wallet.getAccounts())[0].item,
      fee: { paymentMethod: sponsor, gasSettings: { maxPriorityFeesPerGas } },
    });

    return tx;
  };

  const prototypeTxs = new Map<string, ProvenTx>();
  const submitUnproven = async (wallet: TestWallet, priorytFee: GasFees = GasFees.empty()) => {
    const from = (await wallet.getAccounts())[0].item;
    let prototypeTx = prototypeTxs.get(from.toString());
    if (!prototypeTx) {
      prototypeTx = await submitProven(wallet);
      prototypeTxs.set(from.toString(), prototypeTx);
    }

    const tx = await cloneTx(prototypeTx, priorytFee);
    return tx;
  };

  it(`can send ${highValueTps}TPS of high-value txs`, async () => {
    logger.info(`Proving benchmark transactions...`);

    const backgroundTxPriorityFee = new GasFees(0, 1);
    let lowValueTxs = 0;
    const lowValueSendTx = async (wallet: TestWallet) => {
      lowValueTxs++;
      logger.info('Sending low value tx ' + lowValueTxs);

      const tx = await (config.REAL_VERIFIER
        ? submitProven(wallet, backgroundTxPriorityFee)
        : submitUnproven(wallet, backgroundTxPriorityFee));

      return tx.send();
    };

    let highValueTxs = 0;
    const highValueTxPriorityFee = new GasFees(0, 10);
    const highValueSendTx = async (wallet: TestWallet) => {
      highValueTxs++;
      logger.info('Sending high value tx ' + highValueTxs);

      const tx = await (config.REAL_VERIFIER
        ? submitProven(wallet, highValueTxPriorityFee)
        : submitUnproven(wallet, highValueTxPriorityFee));

      metrics.recordSentTx(tx, `high_value_${highValueTps}tps`);

      return tx.send();
    };

    const abortController = new AbortController();

    sendTxsAtTps(logger, abortController.signal, lowValueWallets, lowValueTps, lowValueSendTx);
    const sentTxs = sendTxsAtTps(logger, abortController.signal, highValueWallets, highValueTps, highValueSendTx);

    await sleep(TEST_DURATION_SECONDS * 1000);
    abortController.abort();

    const results: { success: boolean; tx: SentTx; error?: any }[] = [];
    const waitForTx = async (sentTx: SentTx, txName: string) => {
      try {
        const receipt = await sentTx.wait({
          timeout: 1200,
          interval: 1,
          ignoreDroppedReceiptsFor: 2,
        });
        if (receipt.blockNumber) {
          logger.info(`${txName} included in block ${receipt.blockNumber}`);
          await metrics.recordMinedTx(receipt);
        } else {
          throw new Error('Invalid txReceipt: ' + JSON.stringify(receipt));
        }
        results.push({ success: true, tx: sentTx });
      } catch (error) {
        logger.error(`${txName} was not included: ${error}`);
        results.push({ success: false, tx: sentTx, error });
      }
    };

    let index = 0;
    while (sentTxs.length > 0) {
      const chunk = sentTxs.splice(0, 10);
      await Promise.all(chunk.map((tx, idx) => waitForTx(tx, `highValueTx_${idx + 1 + index}`)));
      index += chunk.length;
    }

    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Log failed transactions for debugging
    results
      .filter(r => !r.success)
      .forEach((result, idx) => {
        logger.warn(`Failed transaction ${idx + 1}: ${result.error}`);
      });

    logger.info(`Transaction inclusion summary: ${successCount} succeeded, ${failureCount} failed`);
  });
});

function sendTxsAtTps(
  logger: Logger,
  signal: AbortSignal,
  wallets: TestWallet[],
  targetTps: number,
  sendTx: (wallet: TestWallet) => Promise<SentTx>,
): SentTx[] {
  const promiseCount = Math.ceil(targetTps);
  if (wallets.length < promiseCount) {
    throw new Error('Not enough wallets to achieve desired TPS');
  }

  const txs: SentTx[] = [];
  const targetTpsPerPromise = targetTps / promiseCount;
  // start N "threads", where N is the target TPS rounded up
  // each wallet is responsible for N/targetTps txs per sec
  const promises = times(
    promiseCount,
    i =>
      new RunningPromise(
        async () => {
          const wallet = wallets[i];

          const start = performance.now(); // ms
          const tx = await sendTx(wallet);
          txs.push(tx);
          const dt = performance.now() - start; // ms

          const tps = 1000 / dt; // We just sent one tx. Calculate TPS. Note: we have to convert ms to s

          if (tps > targetTpsPerPromise) {
            await sleep(1000 / targetTpsPerPromise - dt);
          }
        },
        logger,
        0,
      ),
  );

  for (const p of promises) {
    p.start();
  }

  signal.onabort = () => {
    for (const p of promises) {
      void p.stop();
    }
  };

  return txs;
}

async function cloneTx(tx: ProvenTx, priorityFee: GasFees): Promise<ProvenTx> {
  // Clone the transaction
  const clonedTxData = Tx.clone(tx, false);
  (clonedTxData.data.constants.txContext.gasSettings as any).maxPriorityFeesPerGas = priorityFee;

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
  const clonedTx = new ProvenTx((tx as any).node, clonedTxData, tx.offchainEffects, tx.stats);
  await clonedTx.recomputeHash();
  return clonedTx;
}
