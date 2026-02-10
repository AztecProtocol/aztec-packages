import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { GasFees } from '@aztec/stdlib/gas';
import { Tx, TxHash } from '@aztec/stdlib/tx';
import { ProvenTx, type TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import { PrometheusClient } from '../quality_of_service/prometheus_client.js';
import {
  type WalletWrapper,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
} from './setup_test_wallets.js';
import { ProvingMetrics } from './tx_metrics.js';
import {
  getExternalIP,
  setupEnvironment,
  startPortForwardForEthereum,
  startPortForwardForPrometeheus,
} from './utils.js';

const config = { ...setupEnvironment(process.env) };

const NUM_WALLETS = config.REAL_VERIFIER ? 10 : 1;
const TARGET_TPS = parseFloat(process.env.TPS ?? '1');
if (!Number.isFinite(TARGET_TPS)) {
  throw new Error('Invalid TPS: ' + process.env.TPS);
}

const epochDurationSlots = config.AZTEC_EPOCH_DURATION;
const slotDurationSeconds = config.AZTEC_SLOT_DURATION;
const epochDurationSeconds = epochDurationSlots * slotDurationSeconds;

// Gauge metrics - point-in-time values are appropriate
const activeAgentsQuery = () => `max(aztec_proving_queue_active_jobs_count{k8s_namespace_name="${config.NAMESPACE}"})`;

// Counter metrics - will capture deltas between start and end of test
const retriedJobsQuery = () => `sum(aztec_proving_queue_retried_jobs_count{k8s_namespace_name="${config.NAMESPACE}"})`;
const timedOutJobsQuery = () =>
  `sum(aztec_proving_queue_timed_out_jobs_count{k8s_namespace_name="${config.NAMESPACE}"})`;
const resolvedJobsQuery = () =>
  `sum(aztec_proving_queue_resolved_jobs_count{k8s_namespace_name="${config.NAMESPACE}"})`;
const rejectedJobsQuery = () =>
  `sum(aztec_proving_queue_rejected_jobs_count{k8s_namespace_name="${config.NAMESPACE}"})`;
const provenTransactionsQuery = () =>
  `sum(aztec_prover_node_job_transactions{k8s_namespace_name="${config.NAMESPACE}"})`;
const provenBlocksQuery = () => `sum(aztec_prover_node_job_blocks{k8s_namespace_name="${config.NAMESPACE}"})`;

// Histogram metrics - need separate _sum and _count queries to compute deltas correctly
// Note: metric names include units (_milliseconds or _seconds suffix)
const queueTimeSumQuery = () =>
  `sum(aztec_proving_queue_job_wait_milliseconds_sum{k8s_namespace_name="${config.NAMESPACE}"})`;
const queueTimeCountQuery = () =>
  `sum(aztec_proving_queue_job_wait_milliseconds_count{k8s_namespace_name="${config.NAMESPACE}"})`;
const jobDurationSumQuery = () =>
  `sum(aztec_proving_queue_job_duration_milliseconds_sum{k8s_namespace_name="${config.NAMESPACE}"})`;
const jobDurationCountQuery = () =>
  `sum(aztec_proving_queue_job_duration_milliseconds_count{k8s_namespace_name="${config.NAMESPACE}"})`;
const epochDurationSumQuery = () =>
  `sum(aztec_prover_node_job_duration_seconds_sum{k8s_namespace_name="${config.NAMESPACE}"})`;
const epochDurationCountQuery = () =>
  `sum(aztec_prover_node_job_duration_seconds_count{k8s_namespace_name="${config.NAMESPACE}"})`;

/** Snapshot of metrics at a point in time for computing deltas. */
type MetricsSnapshot = {
  // Counter metrics
  retriedJobs: number;
  timedOutJobs: number;
  resolvedJobs: number;
  rejectedJobs: number;
  provenTransactions: number;
  provenBlocks: number;
  // Histogram metrics (sum and count for computing average from deltas)
  queueTimeSum: number;
  queueTimeCount: number;
  jobDurationSum: number;
  jobDurationCount: number;
  epochDurationSum: number;
  epochDurationCount: number;
};

/** A wallet that produces transactions in the background. */
type WalletTxProducer = {
  wallet: TestWallet;
  prototypeTx: ProvenTx | undefined; // Each wallet's own prototype (for fake proving)
  readyTx: ProvenTx | null;
};

describe(`prove ${TARGET_TPS}TPS test`, () => {
  // 4 hours: epoch boundary wait + tx sending (~40min) + tx mining + proving (~30min)
  jest.setTimeout(4 * 60 * 60 * 1000);

  const logger = createLogger(`e2e:spartan-test:prove-${TARGET_TPS}tps`);

  let testWallets: WalletWrapper[];
  let wallets: TestWallet[];
  let producers: WalletTxProducer[];

  let producerAbortController: AbortController;
  let producerPromises: Promise<void>[];

  let aztecNode: AztecNode;
  let benchmarkContract: BenchmarkingContract;

  let metrics: ProvingMetrics;
  let childProcesses: ChildProcess[];
  let rollupCheatCodes: RollupCheatCodes;
  let metricsStartSnapshot: MetricsSnapshot | undefined;

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT && metrics && metricsStartSnapshot) {
      logger.info('Capturing metrics snapshot at test end...');

      // start fresh Prom port-forward tunnel
      const freshPromForward = await startPortForwardForPrometeheus('metrics');
      childProcesses.push(freshPromForward.process);
      const prometheusClient = new PrometheusClient({
        server: new URL(`http://127.0.0.1:${freshPromForward.port}`),
      });

      const endSnapshot = await captureMetricsSnapshot(prometheusClient, logger);

      // Helper to compute delta, clamping negative values to 0 (handles pod restarts)
      const delta = (end: number, start: number) => Math.max(0, end - start);

      // Helper to compute average from histogram deltas
      const avgFromDeltas = (endSum: number, startSum: number, endCount: number, startCount: number) => {
        const deltaSum = delta(endSum, startSum);
        const deltaCount = delta(endCount, startCount);
        return deltaCount > 0 ? deltaSum / deltaCount : 0;
      };

      // Gauge metrics - point-in-time is appropriate
      try {
        const activeAgents = await prometheusClient.querySingleValue(activeAgentsQuery());
        metrics.recordActiveAgents(activeAgents);
      } catch (err) {
        logger.warn(`Failed to scrape active agents: ${err}`, { err });
      }

      // Counter metrics - record deltas
      metrics.recordJobRetries(delta(endSnapshot.retriedJobs, metricsStartSnapshot.retriedJobs));
      metrics.recordTimedOutJobs(delta(endSnapshot.timedOutJobs, metricsStartSnapshot.timedOutJobs));
      metrics.recordResolvedJobs(delta(endSnapshot.resolvedJobs, metricsStartSnapshot.resolvedJobs));
      metrics.recordRejectedJobs(delta(endSnapshot.rejectedJobs, metricsStartSnapshot.rejectedJobs));
      metrics.recordProvenTransactions(delta(endSnapshot.provenTransactions, metricsStartSnapshot.provenTransactions));
      metrics.recordProvenBlocks(delta(endSnapshot.provenBlocks, metricsStartSnapshot.provenBlocks));

      // Histogram metrics - compute average from sum/count deltas
      metrics.recordAvgQueueTime(
        avgFromDeltas(
          endSnapshot.queueTimeSum,
          metricsStartSnapshot.queueTimeSum,
          endSnapshot.queueTimeCount,
          metricsStartSnapshot.queueTimeCount,
        ),
      );
      metrics.recordJobDuration(
        avgFromDeltas(
          endSnapshot.jobDurationSum,
          metricsStartSnapshot.jobDurationSum,
          endSnapshot.jobDurationCount,
          metricsStartSnapshot.jobDurationCount,
        ),
      );
      metrics.recordEpochProvingDuration(
        avgFromDeltas(
          endSnapshot.epochDurationSum,
          metricsStartSnapshot.epochDurationSum,
          endSnapshot.epochDurationCount,
          metricsStartSnapshot.epochDurationCount,
        ),
      );

      logger.info('Metrics deltas computed', {
        retriedJobs: delta(endSnapshot.retriedJobs, metricsStartSnapshot.retriedJobs),
        timedOutJobs: delta(endSnapshot.timedOutJobs, metricsStartSnapshot.timedOutJobs),
        resolvedJobs: delta(endSnapshot.resolvedJobs, metricsStartSnapshot.resolvedJobs),
        rejectedJobs: delta(endSnapshot.rejectedJobs, metricsStartSnapshot.rejectedJobs),
        provenTransactions: delta(endSnapshot.provenTransactions, metricsStartSnapshot.provenTransactions),
        provenBlocks: delta(endSnapshot.provenBlocks, metricsStartSnapshot.provenBlocks),
      });

      await mkdir(dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(metrics.toGithubActionBenchmarkJSON()));
    }

    if (testWallets) {
      for (const tw of testWallets) {
        await tw.cleanup();
      }
    }

    if (childProcesses) {
      for (const proc of childProcesses) {
        proc.kill();
      }
    }
  });

  beforeAll(async () => {
    logger.info(
      `Starting test setup (epoch=${epochDurationSlots} slots, slot=${slotDurationSeconds}s, total=${epochDurationSeconds}s)...`,
    );
    childProcesses = [];

    const rpcIP = await getExternalIP(config.NAMESPACE, 'rpc-aztec-node');
    const rpcUrl = `http://${rpcIP}:8080`;
    aztecNode = createAztecNodeClient(rpcUrl);

    const metricsPrefix = config.REAL_VERIFIER ? `proven_${TARGET_TPS}tps` : `unproven_${TARGET_TPS}tps`;
    metrics = new ProvingMetrics(metricsPrefix);

    // Capture metrics snapshot at test start for computing deltas.
    // Open a temporary port forward, capture snapshot, then close it.
    // We'll open a fresh connection in afterAll when we need to capture the end snapshot.
    logger.info('Capturing metrics snapshot at test start...');
    const promPortForward = await startPortForwardForPrometeheus('metrics');
    const prometheusClient = new PrometheusClient({
      server: new URL(`http://127.0.0.1:${promPortForward.port}`),
    });
    metricsStartSnapshot = await captureMetricsSnapshot(prometheusClient, logger);
    promPortForward.process.kill();
    logger.info('Metrics snapshot captured');

    // Setup Ethereum connection for RollupCheatCodes
    const { process: ethProcess, port: ethPort } = await startPortForwardForEthereum(config.NAMESPACE);
    childProcesses.push(ethProcess);
    const ethereumHost = `http://127.0.0.1:${ethPort}`;
    const ethCheatCodes = new EthCheatCodesWithState([ethereumHost], new DateProvider());
    const l1ContractAddresses = await aztecNode.getNodeInfo().then(n => n.l1ContractAddresses);
    rollupCheatCodes = new RollupCheatCodes(ethCheatCodes, l1ContractAddresses);

    // Wait for at least one block to be mined
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
      2 * 60 * 60,
      12,
    );

    logger.info(`Creating ${NUM_WALLETS} wallet(s)...`);
    testWallets = await timesAsync(NUM_WALLETS, i => {
      logger.info(`Creating wallet ${i + 1}/${NUM_WALLETS}`);
      return createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger);
    });

    const localTestAccounts = await Promise.all(
      testWallets.map(tw => deploySponsoredTestAccounts(tw.wallet, aztecNode, logger, 0)),
    );
    wallets = localTestAccounts.map(acc => acc.wallet);

    logger.info('Deploying benchmark contract...');
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    benchmarkContract = await BenchmarkingContract.deploy(localTestAccounts[0].wallet).send({
      from: localTestAccounts[0].recipientAddress,
      fee: { paymentMethod: sponsor },
    });

    logger.info('Test setup complete');
  });

  beforeEach(async () => {
    logger.info(`Creating ${wallets.length} tx producers`);
    producers = await Promise.all(
      wallets.map(async wallet => {
        const proto = config.REAL_VERIFIER ? undefined : await createTx(wallet, benchmarkContract, logger);
        return { wallet, prototypeTx: proto, readyTx: null };
      }),
    );

    // we have a bunch of wallets, each continously producing txs
    // we start them immediately because they will produce txs and cache them until we are ready to send
    producerAbortController = new AbortController();
    producerPromises = producers.map(producer =>
      startProducing(producer, benchmarkContract, aztecNode, producerAbortController.signal, logger),
    );

    logger.info(`Created and started ${wallets.length} tx producers`);
  });

  afterEach(async () => {
    if (!producerAbortController.signal.aborted) {
      producerAbortController.abort();
    }

    await Promise.allSettled(producerPromises);
  });

  beforeEach(async () => {
    const currentSlot = await rollupCheatCodes.getSlot();
    const slotsIntoEpoch = Number(BigInt(currentSlot) % BigInt(epochDurationSlots));
    const slotsUntilNextEpoch = epochDurationSlots - slotsIntoEpoch;

    logger.info(`Current slot ${currentSlot} (${slotsIntoEpoch}/${epochDurationSlots})`);

    const SLOTS_BUFFER = 1;
    if (slotsUntilNextEpoch > SLOTS_BUFFER) {
      const slotsToWait = slotsUntilNextEpoch - SLOTS_BUFFER;
      const targetSlot = SlotNumber(Number(currentSlot) + slotsToWait);
      // Use getSecondsUntilSlot to account for how far we are into the current slot
      const secondsToWait = (await rollupCheatCodes.getSecondsUntilSlot(targetSlot)) + 1; // add a 1s buffer
      logger.info(
        `Waiting ${secondsToWait}s (${slotsToWait} slots) until ${SLOTS_BUFFER} slots before epoch boundary...`,
      );
      await sleep(secondsToWait * 1000);
    }
  });

  it(`sends ${TARGET_TPS} TPS for a full epoch and waits for proof`, async () => {
    const [testEpoch, startSlot, { proven: startProvenBlockNumber, pending: startBlockNumber }] = await Promise.all([
      rollupCheatCodes.getEpoch(),
      rollupCheatCodes.getSlot(),
      rollupCheatCodes.getTips(),
    ]);
    logger.info(`Starting test in epoch ${testEpoch}, slot ${startSlot} (real_verifier=${config.REAL_VERIFIER})`);

    const txsToSend = Math.ceil(TARGET_TPS * epochDurationSeconds);
    const msPerTx = 1000 / TARGET_TPS;
    logger.info(`Will send ${txsToSend} transactions at ${TARGET_TPS} TPS over ${epochDurationSeconds} seconds`);

    const sentTxs: TxHash[] = [];
    const sendStartTime = performance.now();

    for (let i = 0; i < txsToSend; i++) {
      const loopStart = performance.now();

      // look for a wallet with an available tx
      let producer: WalletTxProducer | undefined;
      do {
        producer = producers.find(p => p.readyTx !== null);
        if (!producer?.readyTx) {
          await sleep(50);
        }
      } while (!producer?.readyTx);

      // consume tx
      const tx = producer.readyTx;
      producer.readyTx = null;
      sentTxs.push(await tx.send({ wait: NO_WAIT }));

      logger.info(`Sent tx ${i + 1}/${txsToSend}`);

      // sleep to maintain target TPS
      const elapsed = performance.now() - loopStart;
      if (elapsed < msPerTx) {
        await sleep(msPerTx - elapsed);
      }
    }

    // stop wallets
    producerAbortController.abort();

    const sendEndTime = performance.now();
    const totalSent = sentTxs.length;
    logger.info(`Finished sending ${totalSent} txs in ${(sendEndTime - sendStartTime) / 1000}s`);

    logger.info('Waiting for transactions to be mined...');
    const pendingTxs = new Map<string, TxHash>();
    for (const txHash of sentTxs) {
      pendingTxs.set(txHash.toString(), txHash);
    }

    let successCount = 0;
    let failureCount = 0;

    const batchSize = 10;
    while (pendingTxs.size > 0) {
      const entries = [...pendingTxs.entries()];
      const start = Math.floor(Math.random() * Math.max(1, entries.length - batchSize + 1));
      const txsToCheck = entries.length <= batchSize ? entries : entries.slice(start, start + batchSize);

      const receipts = await Promise.all(txsToCheck.map(([_, txHash]) => aztecNode.getTxReceipt(txHash)));

      let processedCount = 0;
      for (const receipt of receipts) {
        const hashStr = receipt.txHash.toString();

        if (receipt.isMined()) {
          logger.debug(
            `tx ${hashStr} included in block ${receipt.blockNumber}. Status: ${receipt.status}. Execution: ${receipt.executionResult}`,
          );
          pendingTxs.delete(hashStr);
          successCount++;
          processedCount++;
        } else if (receipt.isDropped()) {
          logger.warn(`Transaction ${hashStr} was dropped`);
          pendingTxs.delete(hashStr);
          failureCount++;
          processedCount++;
        }
      }

      if (processedCount > 0) {
        logger.info(
          `Processed ${totalSent - pendingTxs.size}/${totalSent} transactions (${successCount} success, ${failureCount} failed)`,
        );
      }

      await sleep(500);
    }

    metrics.recordSuccessfulTxs(successCount);
    logger.info(`Transaction inclusion complete: ${successCount} succeeded, ${failureCount} failed`);

    const endBlockNumber = await aztecNode.getBlockNumber();
    const currentEpoch = await rollupCheatCodes.getEpoch();
    logger.info(
      `Transactions landed in blocks ${startBlockNumber + 1} to ${endBlockNumber}, current epoch: ${currentEpoch}`,
    );

    const targetProvenBlock = endBlockNumber;
    const proofStartTime = Date.now();

    logger.info(`Waiting for proven chain to advance ${startProvenBlockNumber} -> ${targetProvenBlock}...`);

    // Poll for proof completion while detecting reorgs
    let lastBlockNumber = endBlockNumber;

    while (true) {
      const [provenBlock, currentBlockNumber] = await Promise.all([
        aztecNode.getProvenBlockNumber(),
        aztecNode.getBlockNumber(),
      ]);

      // Detect reorg: pending chain tip decreased
      if (currentBlockNumber < lastBlockNumber) {
        logger.error(`Reorg detected! Pending chain pruned: ${lastBlockNumber} -> ${currentBlockNumber}`);
        throw new Error(`Reorg detected: pending chain pruned from ${lastBlockNumber} to ${currentBlockNumber}`);
      }

      // Log pending chain advancement
      if (currentBlockNumber > lastBlockNumber) {
        logger.info(`Pending chain advanced: ${lastBlockNumber} -> ${currentBlockNumber}`);
      }

      // Check if proof target reached
      if (provenBlock >= targetProvenBlock) {
        logger.info(`Proven chain has reached block ${provenBlock} (target: ${targetProvenBlock})`);
        break;
      }

      logger.debug(`Proven: ${provenBlock}, Pending: ${currentBlockNumber}, Target: ${targetProvenBlock}`);
      lastBlockNumber = currentBlockNumber;

      await sleep(10 * 1000); // Poll every 10 seconds
    }

    const proofEndTime = Date.now();
    const proofDurationMs = proofEndTime - proofStartTime;
    const proofDurationSeconds = proofDurationMs / 1000;

    metrics.recordProofDuration(proofDurationSeconds);
    logger.info(`Epoch proof completed in ${proofDurationSeconds.toFixed(1)}s`);

    const finalProvenBlock = await aztecNode.getProvenBlockNumber();
    expect(finalProvenBlock).toBeGreaterThanOrEqual(targetProvenBlock);

    logger.info('Test completed successfully');
  });
});

async function createTx(
  wallet: TestWallet,
  benchmarkContract: BenchmarkingContract,
  logger: Logger,
): Promise<ProvenTx> {
  logger.info('Creating prototype transaction...');
  const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
  const tx = await proveInteraction(wallet, benchmarkContract.methods.sha256_hash_1024(Array(1024).fill(42)), {
    from: (await wallet.getAccounts())[0].item,
    fee: { paymentMethod: sponsor, gasSettings: { maxPriorityFeesPerGas: GasFees.empty() } },
  });
  logger.info('Prototype transaction created');
  return tx;
}

async function cloneTx(tx: ProvenTx, aztecNode: AztecNode): Promise<ProvenTx> {
  const clonedTxData = Tx.clone(tx, false);

  // Fetch current minimum fees and apply 50% buffer for safety
  const currentFees = await aztecNode.getCurrentMinFees();
  const paddedFees = currentFees.mul(1.5);

  // Update gas settings with current fees
  (clonedTxData.data.constants.txContext.gasSettings as any).maxFeesPerGas = paddedFees;

  // Randomize nullifiers to avoid conflicts
  if (clonedTxData.data.forRollup) {
    for (let i = 0; i < clonedTxData.data.forRollup.end.nullifiers.length; i++) {
      if (clonedTxData.data.forRollup.end.nullifiers[i].isZero()) {
        continue;
      }
      clonedTxData.data.forRollup.end.nullifiers[i] = Fr.random();
    }
  } else if (clonedTxData.data.forPublic) {
    for (let i = 0; i < clonedTxData.data.forPublic.nonRevertibleAccumulatedData.nullifiers.length; i++) {
      if (clonedTxData.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i].isZero()) {
        continue;
      }
      clonedTxData.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i] = Fr.random();
    }
  }

  const clonedTx = new ProvenTx((tx as any).node, clonedTxData, tx.offchainEffects, tx.stats);
  await clonedTx.recomputeHash();
  return clonedTx;
}

async function startProducing(
  producer: WalletTxProducer,
  benchmarkContract: BenchmarkingContract,
  aztecNode: AztecNode,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  while (!signal.aborted) {
    // Wait if buffer is full
    if (producer.readyTx !== null) {
      await sleep(50);
      continue;
    }

    try {
      const tx = config.REAL_VERIFIER
        ? await createTx(producer.wallet, benchmarkContract, logger)
        : await cloneTx(producer.prototypeTx!, aztecNode);

      producer.readyTx = tx;
    } catch (err) {
      if (!signal.aborted) {
        logger.error(`Error producing tx: ${err}`);
      }
    }
  }
}

async function captureMetricsSnapshot(client: PrometheusClient, logger: Logger): Promise<MetricsSnapshot> {
  const snapshot: MetricsSnapshot = {
    retriedJobs: 0,
    timedOutJobs: 0,
    resolvedJobs: 0,
    rejectedJobs: 0,
    provenTransactions: 0,
    provenBlocks: 0,
    queueTimeSum: 0,
    queueTimeCount: 0,
    jobDurationSum: 0,
    jobDurationCount: 0,
    epochDurationSum: 0,
    epochDurationCount: 0,
  };

  const queries: Array<{ key: keyof MetricsSnapshot; query: () => string }> = [
    { key: 'retriedJobs', query: retriedJobsQuery },
    { key: 'timedOutJobs', query: timedOutJobsQuery },
    { key: 'resolvedJobs', query: resolvedJobsQuery },
    { key: 'rejectedJobs', query: rejectedJobsQuery },
    { key: 'provenTransactions', query: provenTransactionsQuery },
    { key: 'provenBlocks', query: provenBlocksQuery },
    { key: 'queueTimeSum', query: queueTimeSumQuery },
    { key: 'queueTimeCount', query: queueTimeCountQuery },
    { key: 'jobDurationSum', query: jobDurationSumQuery },
    { key: 'jobDurationCount', query: jobDurationCountQuery },
    { key: 'epochDurationSum', query: epochDurationSumQuery },
    { key: 'epochDurationCount', query: epochDurationCountQuery },
  ];

  for (const { key, query } of queries) {
    try {
      snapshot[key] = await client.querySingleValue(query());
    } catch (err) {
      logger.warn(`Failed to capture ${key} for snapshot: ${err}`);
    }
  }

  return snapshot;
}
