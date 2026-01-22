import type { SentTx } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { GasFees } from '@aztec/stdlib/gas';
import { TopicType } from '@aztec/stdlib/p2p';
import { Tx } from '@aztec/stdlib/tx';
import { ProvenTx, TestWallet, proveInteraction } from '@aztec/test-wallet/server';

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
import { TxInclusionMetrics } from './tx_metrics.js';
import {
  getChartDir,
  getExternalIP,
  getGitProjectRoot,
  installChaosMeshChart,
  setupEnvironment,
  startPortForwardForPrometeheus,
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

const p2pLatencyQuery = (perc: string, topicName: TopicType) =>
  `histogram_quantile(${perc}, sum(rate(aztec_p2p_gossip_message_latency_milliseconds_bucket{k8s_namespace_name="${config.NAMESPACE}", aztec_gossip_topic_name="${topicName}"}[1m])) by (le))`;

const attestationLatencyQuery = (perc: string) =>
  `histogram_quantile(${perc}, sum(rate(aztec_sequencer_checkpoint_attestation_delay_milliseconds_bucket{k8s_namespace_name="${config.NAMESPACE}"}[1m])) by (le))`;

const attestationSuccessCountQuery = () =>
  `sum(aztec_validator_attestation_success_count{k8s_namespace_name="${config.NAMESPACE}"})`;

const attestationFailedBadProposalCountQuery = () =>
  `sum(aztec_validator_attestation_failed_bad_proposal_count{k8s_namespace_name="${config.NAMESPACE}"})`;

const attestationFailedNodeIssueCountQuery = () =>
  `sum(aztec_validator_attestation_failed_node_issue_count{k8s_namespace_name="${config.NAMESPACE}"})`;

const reqRespTxsFractionQuery = () =>
  `sum(rate(aztec_tx_collector_txs_requested_fraction_sum{k8s_namespace_name="${config.NAMESPACE}"}[1m])) / ` +
  `sum(rate(aztec_tx_collector_txs_requested_fraction_count{k8s_namespace_name="${config.NAMESPACE}"}[1m]))`;

const reqRespTxsDelayQuery = (perc: string) =>
  `histogram_quantile(${perc}, sum(rate(aztec_tx_collector_txs_requested_delay_milliseconds_bucket{k8s_namespace_name="${config.NAMESPACE}"}[1m])) by (le))`;

const mempoolTxMinedDelayQuery = (perc: string) =>
  `histogram_quantile(${perc}, sum(rate(aztec_mempool_tx_mined_delay_milliseconds_bucket{k8s_namespace_name="${config.NAMESPACE}"}[1m])) by (le))`;

const mempoolAttestationMinedDelayQuery = (perc: string) =>
  `histogram_quantile(${perc}, sum(rate(aztec_mempool_attestations_mined_delay_milliseconds_bucket{k8s_namespace_name="${config.NAMESPACE}"}[1m])) by (le))`;

const peerCountQuery = () => `avg(aztec_peer_manager_peer_count{k8s_namespace_name="${config.NAMESPACE}"})`;

const peerConnectionDurationQuery = (perc: string) =>
  `histogram_quantile(${perc}, sum(rate(aztec_peer_manager_peer_connection_duration_milliseconds_bucket{k8s_namespace_name="${config.NAMESPACE}"}[1m])) by (le))`;

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
  let prometheusClient: PrometheusClient;
  let childProcesses: ChildProcess[];

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      for (const topic of Object.values(TopicType)) {
        try {
          const [p50, p95] = await Promise.all([
            prometheusClient.querySingleValue(p2pLatencyQuery('0.50', topic)),
            prometheusClient.querySingleValue(p2pLatencyQuery('0.95', topic)),
          ]);

          metrics.recordP2PGossipLatency(topic, p50, p95);
        } catch (err) {
          logger.warn(`Failed to scrape P2P gossip latency: ${err}`, { err });
        }
      }

      try {
        const [p50, p95] = await Promise.all([
          prometheusClient.querySingleValue(attestationLatencyQuery('0.50')),
          prometheusClient.querySingleValue(attestationLatencyQuery('0.95')),
        ]);
        metrics.recordAttestationLatency(p50, p95);
      } catch (err) {
        logger.warn(`Failed to scrape attestation latency: ${err}`, { err });
      }

      try {
        const [success, failedBad, failedNode] = await Promise.all([
          prometheusClient.querySingleValue(attestationSuccessCountQuery()),
          prometheusClient.querySingleValue(attestationFailedBadProposalCountQuery()),
          prometheusClient.querySingleValue(attestationFailedNodeIssueCountQuery()),
        ]);
        metrics.recordAttestationCounts(success, failedBad, failedNode);
      } catch (err) {
        logger.warn(`Failed to scrape attestation counts: ${err}`, { err });
      }

      try {
        const [fraction, delayP50, delayP95] = await Promise.all([
          prometheusClient.querySingleValue(reqRespTxsFractionQuery()),
          prometheusClient.querySingleValue(reqRespTxsDelayQuery('0.50')),
          prometheusClient.querySingleValue(reqRespTxsDelayQuery('0.95')),
        ]);
        metrics.recordReqRespStats(fraction, delayP50, delayP95);
      } catch (err) {
        logger.warn(`Failed to scrape req/resp stats: ${err}`, { err });
      }

      try {
        const [avgCount, durationP50, durationP95] = await Promise.all([
          prometheusClient.querySingleValue(peerCountQuery()),
          prometheusClient.querySingleValue(peerConnectionDurationQuery('0.50')),
          prometheusClient.querySingleValue(peerConnectionDurationQuery('0.95')),
        ]);
        metrics.recordPeerStats(avgCount, durationP50, durationP95);
      } catch (err) {
        logger.warn(`Failed to scrape peer stats: ${err}`, { err });
      }

      try {
        const [txP50, txP95, attestationP50, attestationP95] = await Promise.all([
          prometheusClient.querySingleValue(mempoolTxMinedDelayQuery('0.50')),
          prometheusClient.querySingleValue(mempoolTxMinedDelayQuery('0.95')),
          prometheusClient.querySingleValue(mempoolAttestationMinedDelayQuery('0.50')),
          prometheusClient.querySingleValue(mempoolAttestationMinedDelayQuery('0.95')),
        ]);
        metrics.recordMempoolMinedDelay(txP50, txP95, attestationP50, attestationP95);
      } catch (err) {
        logger.warn(`Failed to scrape mempool mined delay stats: ${err}`, { err });
      }

      await mkdir(dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(metrics.toGithubActionBenchmarkJSON()));
    }

    for (const { cleanup } of testWallets!) {
      await cleanup();
    }

    for (const proc of childProcesses) {
      proc.kill();
    }

    await uninstallChaosMesh(CHAOS_MESH_NAME, config.NAMESPACE, logger);
  });

  beforeAll(async () => {
    logger.info(`Starting test setup for sustained TPS tests over ${TEST_DURATION_SECONDS} seconds...`);
    childProcesses = [];

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
    aztecNode = createAztecNodeClient(rpcUrl, {}, defaultFetch);

    const promPortForward = await startPortForwardForPrometeheus('metrics');
    childProcesses.push(promPortForward.process);

    prometheusClient = new PrometheusClient({
      server: new URL(`http://127.0.0.1:${promPortForward.port}`),
    });

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
      .send({ from: localTestAccounts[0].recipientAddress, fee: { paymentMethod: sponsor } })
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
