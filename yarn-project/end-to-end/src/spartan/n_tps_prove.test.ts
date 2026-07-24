import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { toSendOptions } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { AccountManager } from '@aztec/aztec.js/wallet';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { AvmGadgetsTestContract } from '@aztec/noir-test-contracts.js/AvmGadgetsTest';
import { GasFees } from '@aztec/stdlib/gas';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { LARGE_MIN_FEE_PADDING, getPaddedMaxFeesPerGas } from '../fixtures/fixtures.js';
import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';
import { PrometheusClient } from '../quality_of_service/prometheus_client.js';
import type { WorkerWallet } from '../test-wallet/worker_wallet.js';
import { type WorkerWalletWrapper, createWorkerWalletClient } from './setup_test_wallets.js';
import { ProvingMetrics } from './tx_metrics.js';
import {
  type ServiceEndpoint,
  getEthereumEndpoint,
  getExternalIP,
  setupEnvironment,
  startPortForwardForPrometeheus,
} from './utils.js';

const config = { ...setupEnvironment(process.env) };

const TARGET_TPS = parseFloat(process.env.TPS ?? '1');
if (!Number.isFinite(TARGET_TPS)) {
  throw new Error('Invalid TPS: ' + process.env.TPS);
}

const NUM_WALLETS = config.REAL_VERIFIER ? TARGET_TPS * 11 : 1; // add an extra wallet for each 1TPS in order to be able to maintain target TPS. This is assuming tx creation takes 9-10s
const SLOTS_BUFFER = 1;

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
  wallet: WorkerWallet;
  accountAddress: AztecAddress;
  prototypeTx: Tx | undefined; // Each wallet's own prototype (for fake proving)
  readyTx: Tx | null;
};

// End-to-end proving throughput test at TARGET_TPS against a live k8s deployment. Sends transactions,
// waits for the proven chain to advance by a full epoch, and collects Prometheus proving-queue metrics.
describe(`prove ${TARGET_TPS}TPS test`, () => {
  // 4 hours: epoch boundary wait + tx sending (~40min) + tx mining + proving (~30min)
  jest.setTimeout(4 * 60 * 60 * 1000);

  const logger = createLogger(`e2e:spartan-test:prove-${TARGET_TPS}tps`);

  let testWallets: WorkerWalletWrapper[];
  let wallets: WorkerWallet[];
  let accountAddresses: AztecAddress[];
  let producers: WalletTxProducer[];

  let producerAbortController: AbortController;
  let producerPromises: Promise<void>[];

  let aztecNode: AztecNode;
  let benchmarkContract: AvmGadgetsTestContract;

  let metrics: ProvingMetrics;
  let childProcesses: ChildProcess[];
  let rollupCheatCodes: RollupCheatCodes;
  let ethEndpoint: ServiceEndpoint | undefined;
  let metricsStartSnapshot: MetricsSnapshot | undefined;
  // Window handed to bench_scrape.ts so the custom pipeline can scrape this run's
  // proving-infra series (see spartan/bootstrap.sh proving_bench).
  let benchStartedAt: string | undefined;

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

    // Hand the run window to the custom-pipeline scraper (bench_scrape.ts), which
    // reads this file to bound its Prometheus queries for the proving run.
    const timingMetadataPath = '/tmp/n_tps_prove_timing_data.json';
    await writeFile(
      timingMetadataPath,
      JSON.stringify({
        startedAt: benchStartedAt ?? new Date().toISOString(),
        endedAt: new Date().toISOString(),
        runId: process.env.BENCH_RUN_ID,
      }),
    );
    logger.info('Wrote proving-bench timing metadata', { path: timingMetadataPath });

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
    benchStartedAt = new Date().toISOString();
    promPortForward.process.kill();
    logger.info('Metrics snapshot captured');

    // Setup Ethereum connection for RollupCheatCodes
    ethEndpoint = await getEthereumEndpoint(config.NAMESPACE);
    if (ethEndpoint.process) {
      childProcesses.push(ethEndpoint.process);
    }
    const ethCheatCodes = new EthCheatCodesWithState([ethEndpoint.url], new DateProvider());
    const l1ContractAddresses = await aztecNode.getNodeInfo().then(n => n.l1ContractAddresses);
    rollupCheatCodes = new RollupCheatCodes(ethCheatCodes, l1ContractAddresses);

    // Start wallet creation in the background (only needs rpcUrl)
    logger.info(`Creating ${NUM_WALLETS} wallet(s) in parallel with block wait...`);
    const walletCreationPromise = timesParallel(NUM_WALLETS, i => {
      logger.info(`Creating wallet ${i + 1}/${NUM_WALLETS}`);
      return createWorkerWalletClient(rpcUrl, config.REAL_VERIFIER, logger);
    });

    // Wait for at least one block to be mined
    const lagInEpochs = config.AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET;
    const estimatedFirstBlockSlot = (lagInEpochs + 1) * epochDurationSlots;
    const currentSlotAtStart = await rollupCheatCodes.getSlot();
    const slotsUntilFirstBlock = Math.max(0, estimatedFirstBlockSlot - Number(currentSlotAtStart));
    const secondsUntilFirstBlock = slotsUntilFirstBlock * slotDurationSeconds;
    const estimatedTime = new Date(Date.now() + secondsUntilFirstBlock * 1000);
    logger.info(
      `Waiting for first block (current slot ${currentSlotAtStart}, estimated first block at slot ${estimatedFirstBlockSlot}, ` +
        `~${formatDuration(secondsUntilFirstBlock)} from now, around ${estimatedTime.toISOString()})`,
    );
    let lastLoggedSlot: SlotNumber | undefined;
    await retryUntil(
      async () => {
        const blockNumber = await aztecNode.getBlockNumber();
        if (blockNumber > INITIAL_L2_BLOCK_NUM) {
          return true;
        }
        const slot = await rollupCheatCodes.getSlot();
        if (slot !== lastLoggedSlot) {
          lastLoggedSlot = slot;
          const slotsLeft = Math.max(0, estimatedFirstBlockSlot - Number(slot));
          const secondsLeft = slotsLeft * slotDurationSeconds;
          logger.info(
            `Waiting for the first block to mine (slot ${slot}, ~${formatDuration(secondsLeft)} remaining)...`,
          );
        }
        return false;
      },
      'get block number',
      2 * 60 * 60,
      12,
    );

    logger.info(`First block produced. Deploying account contracts`);

    testWallets = await walletCreationPromise;
    wallets = testWallets.map(tw => tw.wallet);

    // Register FPC and create/deploy accounts
    const fpcAddress = await getSponsoredFPCAddress();
    const sponsor = new SponsoredFeePaymentMethod(fpcAddress);
    accountAddresses = await Promise.all(
      wallets.map(async wallet => {
        const secret = Fr.random();
        const salt = Fr.random();
        const signingKey = GrumpkinScalar.random();
        const address = await wallet.registerAccount(secret, salt, signingKey);
        await registerSponsoredFPC(wallet);
        const manager = await AccountManager.create(wallet, secret, new SchnorrAccountContract(signingKey), { salt });
        const deployMethod = await manager.getDeployMethod();
        await deployMethod.send({
          from: NO_FROM,
          fee: { paymentMethod: sponsor },
          wait: { timeout: 2400 },
        });
        logger.info(`Account deployed at ${address}`);
        return address;
      }),
    );

    logger.info('Deploying benchmark contract...');
    ({ contract: benchmarkContract } = await AvmGadgetsTestContract.deploy(wallets[0]).send({
      from: accountAddresses[0],
      fee: { paymentMethod: sponsor },
    }));

    logger.info('Test setup complete');
  });

  beforeEach(async () => {
    logger.info(`Creating ${wallets.length} tx producers`);
    producers = await Promise.all(
      wallets.map(async (wallet, i) => {
        const accountAddress = accountAddresses[i];
        const proto = config.REAL_VERIFIER
          ? undefined
          : await createTx(wallet, accountAddress, benchmarkContract, logger);
        return { wallet, accountAddress, prototypeTx: proto, readyTx: null };
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

    if (slotsUntilNextEpoch > SLOTS_BUFFER) {
      const slotsToWait = slotsUntilNextEpoch - SLOTS_BUFFER;
      const targetSlot = SlotNumber(Number(currentSlot) + slotsToWait);
      // Use getSecondsUntilSlot to account for how far we are into the current slot
      const secondsToWait = (await rollupCheatCodes.getSecondsUntilSlot(targetSlot)) + 1; // add a 1s buffer
      const endTime = new Date(Date.now() + secondsToWait * 1000);
      logger.info(
        `Waiting ${formatDuration(secondsToWait)} (${slotsToWait} slots) until ${SLOTS_BUFFER} slot(s) before epoch boundary (until ${endTime.toISOString()})...`,
      );
      await sleep(secondsToWait * 1000);

      // Port-forward to L1 may have died during the wait; re-establish before using rollupCheatCodes.
      ethEndpoint?.process?.kill();
      ethEndpoint = await getEthereumEndpoint(config.NAMESPACE);
      if (ethEndpoint.process) {
        childProcesses.push(ethEndpoint.process);
      }
      const freshEthCheatCodes = new EthCheatCodesWithState([ethEndpoint.url], new DateProvider());
      const freshL1Addresses = await aztecNode.getNodeInfo().then(n => n.l1ContractAddresses);
      rollupCheatCodes = new RollupCheatCodes(freshEthCheatCodes, freshL1Addresses);
    }
  });

  it(`sends ${TARGET_TPS} TPS for a full epoch and waits for proof`, async () => {
    const [testEpoch, startSlot] = await Promise.all([rollupCheatCodes.getEpoch(), rollupCheatCodes.getSlot()]);
    const targetEpoch = testEpoch + 1;
    logger.info(
      `Starting test in epoch ${testEpoch}, slot ${startSlot}, target epoch is ${targetEpoch} (real_verifier=${config.REAL_VERIFIER})`,
    );

    const msPerTx = 1000 / TARGET_TPS;
    const sendDurationMs = epochDurationSeconds * 1000 + SLOTS_BUFFER * slotDurationSeconds * 1000; // 2 slot buffer
    logger.info(`Will send transactions at ${TARGET_TPS} TPS for ${epochDurationSeconds}s (1 epoch)`);

    const sentTxs: TxHash[] = [];
    const sendStartTime = performance.now();
    const sendDeadline = sendStartTime + sendDurationMs;
    let i = 0;

    while (performance.now() < sendDeadline) {
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
      try {
        await aztecNode.sendTx(tx);
        sentTxs.push(tx.getTxHash());
        logger.info(`Sent tx ${i + 1}`);
      } catch (err) {
        logger.warn(`Failed to send tx ${i + 1}: ${err}`);
      }
      i++;

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
    const txsPerBlock = new Map<number, number>();
    const pendingTxs = new Map<string, TxHash>();
    for (const txHash of sentTxs) {
      pendingTxs.set(txHash.toString(), txHash);
    }

    let successCount = 0;
    let failureCount = 0;

    const batchSize = 10;
    const TX_MINING_TIMEOUT_S = 5 * slotDurationSeconds;
    const NO_PROGRESS_TIMEOUT_S = 3 * slotDurationSeconds;
    const miningTimer = new Timer();
    let lastProgressTime = performance.now();
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
          if (receipt.blockNumber !== undefined) {
            txsPerBlock.set(receipt.blockNumber, (txsPerBlock.get(receipt.blockNumber) ?? 0) + 1);
          }
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
        lastProgressTime = performance.now();
        logger.info(
          `Processed ${totalSent - pendingTxs.size}/${totalSent} transactions (${successCount} success, ${failureCount} failed)`,
        );
      }

      const noProgressSeconds = (performance.now() - lastProgressTime) / 1000;
      if (noProgressSeconds > NO_PROGRESS_TIMEOUT_S) {
        logger.warn(
          `No mining progress for ${Math.floor(noProgressSeconds)}s. ` +
            `Giving up on ${pendingTxs.size}/${totalSent} transactions. ` +
            `Remaining tx hashes: ${[...pendingTxs.values()].map(h => h.toString()).join(', ')}`,
        );
        failureCount += pendingTxs.size;
        break;
      }

      if (miningTimer.s() > TX_MINING_TIMEOUT_S) {
        const remainingHashes = [...pendingTxs.values()].map(h => h.toString());
        logger.warn(
          `Timed out waiting for ${pendingTxs.size}/${totalSent} transactions after ${TX_MINING_TIMEOUT_S}s. ` +
            `These transactions likely were not included in this epoch's blocks. ` +
            `Remaining tx hashes: ${remainingHashes.join(', ')}`,
        );
        break;
      }

      if (processedCount === 0) {
        logger.info(
          `Still waiting for ${pendingTxs.size}/${totalSent} transactions (${Math.floor(miningTimer.s())}s elapsed)`,
        );
      }

      await sleep(500);
    }

    metrics.recordSuccessfulTxs(successCount);
    logger.info(`Transaction inclusion complete: ${successCount} succeeded, ${failureCount} failed`);

    // Map blocks to epochs and find the epoch with the most txs
    const txsPerEpoch = new Map<number, number>();
    const maxBlockPerEpoch = new Map<number, number>();

    for (const [blockNum, txCount] of txsPerBlock) {
      const header = (await aztecNode.getBlockData(BlockNumber(blockNum)))?.header;
      const epoch = Math.floor(Number(header!.getSlot()) / epochDurationSlots);
      txsPerEpoch.set(epoch, (txsPerEpoch.get(epoch) ?? 0) + txCount);
      maxBlockPerEpoch.set(epoch, Math.max(maxBlockPerEpoch.get(epoch) ?? 0, blockNum));
    }

    let targetProofEpoch = 0;
    let maxTxCount = 0;
    for (const [epoch, count] of txsPerEpoch) {
      logger.info(`Epoch ${epoch}: ${count} txs`);
      if (count > maxTxCount) {
        maxTxCount = count;
        targetProofEpoch = epoch;
      }
    }

    const targetProvenBlock = maxBlockPerEpoch.get(targetProofEpoch)!;
    const proofStartTime = Date.now();

    logger.info(
      `Epoch ${targetProofEpoch} has the most txs (${maxTxCount}). Waiting for block ${targetProvenBlock} to be proven.`,
    );
    // Poll for proof completion while detecting reorgs
    let lastBlockNumber = await aztecNode.getBlockNumber();
    const currentProvenBlock = await aztecNode.getBlockNumber('proven');
    logger.info(`Waiting for proven chain to advance ${currentProvenBlock} -> ${targetProvenBlock}...`);
    const PROOF_TIMEOUT_S = 2 * epochDurationSeconds;
    const proofTimer = new Timer();

    while (true) {
      const [provenBlock, currentBlockNumber] = await Promise.all([
        aztecNode.getBlockNumber('proven'),
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

      if (proofTimer.s() > PROOF_TIMEOUT_S) {
        throw new Error(
          `Timed out waiting for proof after ${PROOF_TIMEOUT_S}s. Proven: ${provenBlock}, Target: ${targetProvenBlock}`,
        );
      }

      logger.info(`Proven: ${provenBlock}, Pending: ${currentBlockNumber}, Target: ${targetProvenBlock}`);
      lastBlockNumber = currentBlockNumber;

      await sleep(10 * 1000); // Poll every 10 seconds
    }

    const proofEndTime = Date.now();
    const proofDurationMs = proofEndTime - proofStartTime;
    const proofDurationSeconds = proofDurationMs / 1000;

    metrics.recordProofDuration(proofDurationSeconds);
    logger.info(`Epoch ${targetProofEpoch} proof completed in ${proofDurationSeconds.toFixed(1)}s`);

    const finalProvenBlock = await aztecNode.getBlockNumber('proven');
    expect(finalProvenBlock).toBeGreaterThanOrEqual(targetProvenBlock);

    logger.info('Test completed successfully');
  });
});

async function createTx(
  wallet: WorkerWallet,
  accountAddress: AztecAddress,
  benchmarkContract: AvmGadgetsTestContract,
  _logger: Logger,
): Promise<Tx> {
  const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
  const options = {
    from: accountAddress,
    fee: { paymentMethod: sponsor, gasSettings: { maxPriorityFeesPerGas: GasFees.empty() } },
  };
  const interaction = benchmarkContract.methods.keccak_hash_1400(Array(1400).fill(42));
  const execPayload = await interaction.request(options);
  const tx = await wallet.proveTx(execPayload, toSendOptions(options));
  return tx;
}

async function cloneTx(tx: Tx, aztecNode: AztecNode): Promise<Tx> {
  const clonedTx = Tx.clone(tx, false);

  // Fetch current minimum fees and apply 15x buffer to cover fee decay between blocks
  const paddedFees = await getPaddedMaxFeesPerGas(aztecNode, LARGE_MIN_FEE_PADDING);

  // Update gas settings with current fees
  (clonedTx.data.constants.txContext.gasSettings as any).maxFeesPerGas = paddedFees;

  // Randomize nullifiers to avoid conflicts
  if (clonedTx.data.forRollup) {
    for (let i = 0; i < clonedTx.data.forRollup.end.nullifiers.length; i++) {
      if (clonedTx.data.forRollup.end.nullifiers[i].isZero()) {
        continue;
      }
      clonedTx.data.forRollup.end.nullifiers[i] = Fr.random();
    }
  } else if (clonedTx.data.forPublic) {
    for (let i = 0; i < clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers.length; i++) {
      if (clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i].isZero()) {
        continue;
      }
      clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i] = Fr.random();
    }
  }

  await clonedTx.recomputeHash();
  return clonedTx;
}

async function startProducing(
  producer: WalletTxProducer,
  benchmarkContract: AvmGadgetsTestContract,
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
        ? await createTx(producer.wallet, producer.accountAddress, benchmarkContract, logger)
        : await cloneTx(producer.prototypeTx!, aztecNode);

      producer.readyTx = tx;
    } catch (err) {
      if (!signal.aborted) {
        logger.error(`Error producing tx: ${err}`);
      }
    }
  }
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
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
