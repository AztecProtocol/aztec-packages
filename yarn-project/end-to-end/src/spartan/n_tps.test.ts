import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { NO_FROM } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT, toSendOptions } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient, waitForTx } from '@aztec/aztec.js/node';
import { AccountManager } from '@aztec/aztec.js/wallet';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { times, timesParallel } from '@aztec/foundation/collection';
import { randomBigInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { TopicType } from '@aztec/stdlib/p2p';
import { Tx, TxHash, TxStatus } from '@aztec/stdlib/tx';
import { getGasLimits } from '@aztec/wallet-sdk/base-wallet';

import { jest } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';
import { PrometheusClient } from '../quality_of_service/prometheus_client.js';
import { ProvenTx } from '../test-wallet/utils.js';
import type { WorkerWallet } from '../test-wallet/worker_wallet.js';
import { type WorkerWalletWrapper, createWorkerWalletClient } from './setup_test_wallets.js';
import { TxInclusionMetrics } from './tx_metrics.js';
import {
  type ServiceEndpoint,
  getChartDir,
  getGitProjectRoot,
  getRPCEndpoint,
  hasDeployedHelmRelease,
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
const MIN_FEE_REFRESH_INTERVAL_MS = 5_000;
const HIGH_VALUE_FEE_MULTIPLIER = 10n;

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

const peerCountQuery = () => `avg(aztec_peer_manager_peer_count_peers{k8s_namespace_name="${config.NAMESPACE}"})`;

const peerConnectionDurationQuery = (perc: string, windowSeconds: number) =>
  `histogram_quantile(${perc}, sum(rate(aztec_peer_manager_peer_connection_duration_milliseconds_bucket{k8s_namespace_name="${config.NAMESPACE}"}[${windowSeconds}s])) by (le))`;

// Sustained mixed-priority TPS test against a live k8s deployment. Drives LOW_VALUE_TPS and HIGH_VALUE_TPS
// traffic simultaneously, optionally with Chaos Mesh network shaping, and collects Prometheus metrics for
// p2p latency, attestation timing, and peer connections.
describe('sustained N TPS test', () => {
  jest.setTimeout(60 * 60 * 1000 * 10); // 10 hours

  const logger = createLogger(`e2e:spartan-test:sustained-tps`);
  const TEST_DURATION_SECONDS = parseInt(process.env.TEST_DURATION_SECONDS || '600', 10);

  let testWallets: WorkerWalletWrapper[];
  let lowValueWallets: WorkerWallet[];
  let highValueWallets: WorkerWallet[];
  let lowValueAddresses: AztecAddress[];
  let highValueAddresses: AztecAddress[];
  let lowValueTestWallets: WorkerWalletWrapper[];
  let highValueTestWallets: WorkerWalletWrapper[];

  let aztecNode: AztecNode;
  let benchmarkContract: BenchmarkingContract;

  let metrics: TxInclusionMetrics;
  let prometheusClient: PrometheusClient;
  const endpoints: ServiceEndpoint[] = [];
  let promProcess: ReturnType<typeof startPortForwardForPrometeheus> extends Promise<infer T> ? T : never;

  afterAll(async () => {
    logger.info('Collecting benchmark metrics and cleaning up...');
    if (process.env.BENCH_OUTPUT) {
      for (const topic of Object.values(TopicType)) {
        try {
          const [p50, p95] = await Promise.all([
            prometheusClient.querySingleValue(p2pLatencyQuery('0.50', topic)),
            prometheusClient.querySingleValue(p2pLatencyQuery('0.95', topic)),
          ]);

          metrics.recordP2PGossipLatency(topic, p50, p95);
          logger.debug(`Scraped P2P gossip latency for ${topic}`, { p50, p95 });
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
        logger.debug('Scraped attestation latency', { p50, p95 });
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
        logger.debug('Scraped attestation counts', { success, failedBad, failedNode });
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
        logger.debug('Scraped req/resp stats', { fraction, delayP50, delayP95 });
      } catch (err) {
        logger.warn(`Failed to scrape req/resp stats: ${err}`, { err });
      }

      try {
        const [avgCount, durationP50, durationP95] = await Promise.all([
          prometheusClient.querySingleValue(peerCountQuery()),
          prometheusClient.querySingleValue(peerConnectionDurationQuery('0.50', TEST_DURATION_SECONDS + 60)),
          prometheusClient.querySingleValue(peerConnectionDurationQuery('0.95', TEST_DURATION_SECONDS + 60)),
        ]);
        metrics.recordPeerStats(avgCount, durationP50, durationP95);
        logger.debug('Scraped peer stats', { avgCount, durationP50, durationP95 });
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
        logger.debug('Scraped mempool mined delay stats', { txP50, txP95, attestationP50, attestationP95 });
      } catch (err) {
        logger.warn(`Failed to scrape mempool mined delay stats: ${err}`, { err });
      }

      const benchmarkData = metrics.toGithubActionBenchmarkJSON();
      await mkdir(dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(benchmarkData));
      logger.info('Wrote benchmark output', { path: process.env.BENCH_OUTPUT, entries: benchmarkData.length });
    } else {
      logger.info('BENCH_OUTPUT not set; skipping benchmark JSON output');
    }

    logger.info('Cleaning up wallets and endpoints', {
      walletCount: testWallets?.length ?? 0,
      endpointCount: endpoints?.length ?? 0,
    });
    for (const { cleanup } of testWallets!) {
      await cleanup();
    }

    endpoints.forEach(e => e.process?.kill());
    promProcess?.process?.kill();

    await uninstallChaosMesh(CHAOS_MESH_NAME, config.NAMESPACE, logger);
  });

  beforeAll(async () => {
    logger.info(`Starting test setup for sustained TPS tests over ${TEST_DURATION_SECONDS} seconds...`);
    logger.info('Test configuration', {
      namespace: config.NAMESPACE,
      lowValueTps,
      highValueTps,
      lowValueAccounts,
      highValueAccounts,
      testDurationSeconds: TEST_DURATION_SECONDS,
      realVerifier: config.REAL_VERIFIER,
      benchOutput: process.env.BENCH_OUTPUT,
      benchScenario: process.env.BENCH_SCENARIO,
    });
    const spartanDir = `${getGitProjectRoot()}/spartan`;

    // Skip chaos mesh installation if it was already deployed by deploy_network.sh
    // (via CHAOS_MESH_SCENARIOS_FILE). Installing before infra ensures partition
    // rules are in place when pods start, preventing unwanted peer connections.
    const alreadyDeployed = await hasDeployedHelmRelease(CHAOS_MESH_NAME, config.NAMESPACE);
    if (alreadyDeployed) {
      logger.info('Chaos mesh chart already deployed, skipping installation');
    } else {
      logger.info('Installing chaos mesh chart', {
        name: CHAOS_MESH_NAME,
        namespace: config.NAMESPACE,
        valuesFile: 'network-requirements.yaml',
      });
      await installChaosMeshChart({
        logger,
        targetNamespace: config.NAMESPACE,
        instanceName: CHAOS_MESH_NAME,
        valuesFile: 'network-requirements.yaml',
        helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
      });
      logger.info('Chaos mesh installation complete');

      logger.info('Waiting for network to stabilize after chaos mesh installation...');
      await sleep(30 * 1000);
      logger.info('Network stabilization wait complete');
    }

    const rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint);
    const rpcUrl = rpcEndpoint.url;
    logger.info('Resolved RPC endpoint', { rpcUrl });
    aztecNode = createAztecNodeClient(rpcUrl);

    promProcess = await startPortForwardForPrometeheus('metrics');
    logger.info('Started Prometheus port-forward', { port: promProcess.port, pid: promProcess.process.pid });

    prometheusClient = new PrometheusClient({
      server: new URL(`http://127.0.0.1:${promProcess.port}`),
    });

    metrics = new TxInclusionMetrics(aztecNode, logger);

    await retryUntil(
      async () => {
        try {
          const blockNumber = await aztecNode.getBlockNumber();
          if (blockNumber > INITIAL_L2_BLOCK_NUM) {
            return true;
          }
          logger.info('Waiting for the first block to mine...', { blockNumber, threshold: INITIAL_L2_BLOCK_NUM });
          return false;
        } catch (err) {
          logger.warn('Failed to get block number from RPC', { error: String(err) });
          return false;
        }
      },
      'get block number',
      60 * 60 * 3, // wait up to 3 hours
      60,
    );

    const initialBlockNumber = await aztecNode.getBlockNumber();
    logger.info('Initial block mined', { blockNumber: initialBlockNumber });

    // One WorkerWallet per test wallet: each runs its own PXE in a worker_threads.Worker,
    // so the per-wallet proveTx (for the prototype build) and any reorg-triggered
    // prototype rebuilds run in parallel instead of serialising on a single main-thread PXE.
    // config.REAL_VERIFIER threads through to proverEnabled on each worker's PXE: false
    // makes the client-side prover skip proof and witness generation entirely.
    testWallets = await timesParallel(lowValueAccounts + highValueAccounts, i => {
      logger.info(`Creating wallet and pxe for wallet ${i + 1}/${lowValueAccounts + highValueAccounts}`);
      return createWorkerWalletClient(rpcUrl, config.REAL_VERIFIER, logger);
    });
    logger.info('Wallet provisioning complete', { walletCount: testWallets.length });

    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const wallets = testWallets.map(tw => tw.wallet);
    const accountAddresses = await Promise.all(
      wallets.map(async wallet => {
        const secret = Fr.random();
        const salt = Fr.random();
        const signingKey = GrumpkinScalar.random();
        const address = await wallet.registerAccount(secret, salt, signingKey);
        await registerSponsoredFPC(wallet);
        const manager = await AccountManager.create(wallet, secret, new SchnorrAccountContract(signingKey), { salt });
        const deployMethod = await manager.getDeployMethod();
        // Explicit gas estimation: BaseWallet's fallback bakes ~196_608 daGas into deploys, which exceeds
        // the proposer's per-block fair-share daGas (~94k at 10 blocks/checkpoint
        // with pipelining). Estimate first, send with the result. EmbeddedWallet
        // does this automatically; TestWallet (used here via WorkerWallet) does not.
        const deploySim = await deployMethod.simulate({
          from: NO_FROM,
          fee: { paymentMethod: sponsor },
          includeMetadata: true,
        });
        const { txsLimits } = await aztecNode.getNodeInfo();
        const deployGasLimits = getGasLimits(deploySim.gasUsed!, Gas.from(txsLimits.gas));
        await deployMethod.send({
          from: NO_FROM,
          fee: { paymentMethod: sponsor, gasSettings: deployGasLimits },
          wait: { timeout: 2400 },
        });
        return address;
      }),
    );

    lowValueWallets = wallets.slice(0, lowValueAccounts);
    highValueWallets = wallets.slice(lowValueAccounts);
    lowValueAddresses = accountAddresses.slice(0, lowValueAccounts);
    highValueAddresses = accountAddresses.slice(lowValueAccounts);
    lowValueTestWallets = testWallets.slice(0, lowValueAccounts);
    highValueTestWallets = testWallets.slice(lowValueAccounts);
    logger.info('Test accounts deployed', {
      totalAccounts: accountAddresses.length,
      lowValueWallets: lowValueWallets.length,
      highValueWallets: highValueWallets.length,
    });

    logger.info('Deploying benchmark contract...');
    const deployInteraction = BenchmarkingContract.deploy(wallets[0]);
    const deploySim = await deployInteraction.simulate({
      from: accountAddresses[0],
      fee: { paymentMethod: sponsor },
      includeMetadata: true,
    });
    const { txsLimits } = await aztecNode.getNodeInfo();
    const benchmarkDeployGasLimits = getGasLimits(deploySim.gasUsed!, Gas.from(txsLimits.gas));
    logger.info('Benchmark contract deploy estimated gas', { gasLimits: benchmarkDeployGasLimits.gasLimits });
    ({ contract: benchmarkContract } = await deployInteraction.send({
      from: accountAddresses[0],
      fee: { paymentMethod: sponsor, gasSettings: benchmarkDeployGasLimits },
    }));
    logger.info('Benchmark contract deployed', { address: benchmarkContract.address.toString() });

    // Estimate benchmark-tx gas ONCE, up-front, using wallets[0]'s address (the only
    // one registered in benchmarkContract.wallet's PXE). Doing this lazily from
    // submitProven meant any wallet losing the race to be first to simulate would
    // throw `Account not found in wallet for address` from wallets[0]'s worker PXE.
    // Gas estimate is sender-independent, so one pre-warmed value for all senders.
    const estimateSim = await benchmarkContract.methods.sha256_hash_1024(Array(1024).fill(42)).simulate({
      from: accountAddresses[0],
      fee: { paymentMethod: sponsor },
      includeMetadata: true,
    });
    benchmarkGasEstimate = getGasLimits(estimateSim.gasUsed!, Gas.from(txsLimits.gas));
    logger.info('Benchmark tx estimated gas', { gasLimits: benchmarkGasEstimate?.gasLimits });

    const currentMinFees = await refreshMinFees();
    logger.info('Initial min fee quote', {
      daGas: currentMinFees.feePerDaGas.toString(),
      l2Gas: currentMinFees.feePerL2Gas.toString(),
    });

    logger.info(`Test setup complete`);
  });

  let benchmarkGasEstimate: { gasLimits: Gas; teardownGasLimits: Gas } | undefined;
  let cachedMinFees: GasFees | undefined;
  let nextMinFeeRefreshAt = 0;
  let minFeeRefreshPromise: Promise<GasFees> | undefined;

  const refreshMinFees = async (): Promise<GasFees> => {
    if (minFeeRefreshPromise) {
      return minFeeRefreshPromise;
    }

    minFeeRefreshPromise = aztecNode.getCurrentMinFees();
    try {
      const minFees = await minFeeRefreshPromise;
      cachedMinFees = minFees;
      nextMinFeeRefreshAt = Date.now() + MIN_FEE_REFRESH_INTERVAL_MS;
      logger.debug('Refreshed min fee quote', {
        daGas: minFees.feePerDaGas.toString(),
        l2Gas: minFees.feePerL2Gas.toString(),
      });
      return minFees;
    } finally {
      minFeeRefreshPromise = undefined;
    }
  };

  const getMinFeesForSend = async (): Promise<GasFees> => {
    if (!cachedMinFees || Date.now() >= nextMinFeeRefreshAt) {
      return await refreshMinFees();
    }
    return cachedMinFees;
  };

  const getLowValueFeeQuote = async (txCount: number): Promise<FeeQuote> => {
    const minFees = await getMinFeesForSend();
    const feeBump = BigInt(Math.floor(txCount / 1000) + 1);
    const priorityFeeL2 = minFees.feePerL2Gas * feeBump;
    const maxFeeL2 = priorityFeeL2 > minFees.feePerL2Gas ? priorityFeeL2 : minFees.feePerL2Gas;
    return {
      maxFeesPerGas: new GasFees(minFees.feePerDaGas, maxFeeL2),
      maxPriorityFeesPerGas: new GasFees(0n, priorityFeeL2),
    };
  };

  const getHighValueFeeQuote = async (jitter: bigint): Promise<FeeQuote> => {
    const minFees = await getMinFeesForSend();
    const priorityFee = new GasFees(
      minFees.feePerDaGas * HIGH_VALUE_FEE_MULTIPLIER,
      minFees.feePerL2Gas * HIGH_VALUE_FEE_MULTIPLIER + jitter,
    );
    return { maxFeesPerGas: priorityFee, maxPriorityFeesPerGas: priorityFee };
  };

  const submitProven = async (
    wallet: WorkerWallet,
    walletNode: AztecNode,
    from: AztecAddress,
    feeQuote?: FeeQuote,
  ): Promise<ProvenTx> => {
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const interaction = benchmarkContract.methods.sha256_hash_1024(Array(1024).fill(42));
    const gasSettings: BenchmarkGasSettings = { ...benchmarkGasEstimate, maxPriorityFeesPerGas: GasFees.empty() };
    if (feeQuote) {
      gasSettings.maxFeesPerGas = feeQuote.maxFeesPerGas;
      gasSettings.maxPriorityFeesPerGas = feeQuote.maxPriorityFeesPerGas;
    }
    const interactionOptions = {
      from,
      fee: {
        paymentMethod: sponsor,
        gasSettings,
      },
    };
    const execPayload = await interaction.request(interactionOptions);
    // WorkerWallet.proveTx returns a plain Tx (the ProvenTx's node + offchainEffects are
    // stripped at the worker-thread boundary). Rehydrate into a ProvenTx bound to the
    // wallet's OWN AztecNode so .send() goes through a per-wallet JSON-RPC client.
    // A shared node client coalesces concurrent sendTx calls from all 10 wallets into
    // one HTTP POST (batchWindowMS=0 still batches same-tick calls), which can exceed
    // the server's 1 MB body limit and produce "request entity too large" errors.
    const tx = await wallet.proveTx(execPayload, toSendOptions(interactionOptions));
    return new ProvenTx(walletNode, tx, [], undefined);
  };

  const prototypeTxs = new Map<string, ProvenTx>();
  const submitUnproven = async (
    wallet: WorkerWallet,
    walletNode: AztecNode,
    from: AztecAddress,
    feeQuote: FeeQuote,
  ) => {
    const key = from.toString();
    let prototypeTx = prototypeTxs.get(key);
    if (!prototypeTx) {
      prototypeTx = await submitProven(wallet, walletNode, from);
      prototypeTxs.set(key, prototypeTx);
    }

    const tx = await cloneTx(prototypeTx, feeQuote, logger);
    return tx;
  };

  // The prototype's anchor block header is bound into the private kernel proof. If the
  // chain reorgs past that block — or on very long runs the header ages out of
  // WS_NUM_HISTORIC_BLOCKS — the node rejects clones with `Block header not found`.
  // Detect this on send, invalidate the cached prototype, and retry once.
  const STALE_ANCHOR_MESSAGE = 'Block header not found';
  const isStaleAnchorError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes(STALE_ANCHOR_MESSAGE);
  };

  const buildAndSend = async (
    wallet: WorkerWallet,
    walletNode: AztecNode,
    from: AztecAddress,
    feeQuote: FeeQuote,
    beforeSend?: (tx: ProvenTx) => void,
  ): Promise<{ txHash: string; cloneMs: number; sendMs: number }> => {
    for (let attempt = 1; ; attempt++) {
      const t0 = performance.now();
      const tx = await (config.REAL_VERIFIER
        ? submitProven(wallet, walletNode, from, feeQuote)
        : submitUnproven(wallet, walletNode, from, feeQuote));
      const t1 = performance.now();
      beforeSend?.(tx);
      try {
        const txHash = await tx.send({ wait: NO_WAIT });
        const t2 = performance.now();
        return { txHash: txHash.toString(), cloneMs: Math.round(t1 - t0), sendMs: Math.round(t2 - t1) };
      } catch (err) {
        if (isStaleAnchorError(err) && attempt === 1) {
          logger.warn('Stale anchor on send; invalidating prototype and retrying', {
            walletKey: from.toString(),
            err: err instanceof Error ? err.message : String(err),
          });
          prototypeTxs.delete(from.toString());
          continue;
        }
        throw err;
      }
    }
  };

  it(`can send ${highValueTps}TPS of high-value txs`, async () => {
    logger.info(`Proving benchmark transactions...`);
    logger.info('Starting sustained TPS run', {
      lowValueTps,
      highValueTps,
      durationSeconds: TEST_DURATION_SECONDS,
      lowValueWallets: lowValueWallets.length,
      highValueWallets: highValueWallets.length,
    });

    let lowValueTxs = 0;
    const lowValueSendTx = async (wallet: WorkerWallet, walletNode: AztecNode, from: AztecAddress) => {
      lowValueTxs++;
      // Low-value lane stays near the network min to simulate cheap txs that should be
      // displaced by high-value txs, while still tracking the current fee floor.
      const feeQuote = await getLowValueFeeQuote(lowValueTxs);

      const { txHash, cloneMs, sendMs } = await buildAndSend(wallet, walletNode, from, feeQuote);

      logger.info('Low value tx sent', {
        txNum: lowValueTxs,
        feeL2: feeQuote.maxPriorityFeesPerGas.feePerL2Gas.toString(),
        maxFeeL2: feeQuote.maxFeesPerGas.feePerL2Gas.toString(),
        cloneMs,
        sendMs,
        totalMs: cloneMs + sendMs,
      });
      return txHash;
    };

    let highValueTxs = 0;
    const highValueSendTx = async (wallet: WorkerWallet, walletNode: AztecNode, from: AztecAddress) => {
      highValueTxs++;
      const jitter = BigInt(Number(randomBigInt(10n)));
      const feeQuote = await getHighValueFeeQuote(jitter);
      const feeAmount = Number(feeQuote.maxPriorityFeesPerGas.feePerL2Gas);

      const { txHash, cloneMs, sendMs } = await buildAndSend(wallet, walletNode, from, feeQuote, tx =>
        metrics.recordSentTx(tx, 'tx_inclusion_time'),
      );

      logger.info('High value tx sent', {
        txNum: highValueTxs,
        feeAmount,
        cloneMs,
        sendMs,
        totalMs: cloneMs + sendMs,
      });
      return txHash;
    };

    const abortController = new AbortController();
    // Bind each lane to its wallet's OWN aztecNode (not the shared outer `aztecNode`).
    // Per-wallet clients prevent JSON-RPC batch coalescence from packing all 10 sends
    // into one HTTP POST that can exceed the server's 1 MB body limit.
    const lowValueLanes = lowValueWallets.map((wallet, i) => ({
      wallet,
      aztecNode: lowValueTestWallets[i].aztecNode,
      address: lowValueAddresses[i],
    }));
    const highValueLanes = highValueWallets.map((wallet, i) => ({
      wallet,
      aztecNode: highValueTestWallets[i].aztecNode,
      address: highValueAddresses[i],
    }));
    const startedAt = new Date().toISOString();

    // Block-watcher: stamps wall-clock minedAtMs on each sent tx the first time
    // its block becomes visible to this client. Runs throughout sending AND the
    // post-window inclusion wait so late blocks still get a true client-observed
    // timestamp. recordMinedTx (in waitForHighValueTx) is the slow-path fallback for any
    // tx the watcher misses.
    let lastSeenBlock = await aztecNode.getBlockNumber();
    const blockWatcher = new RunningPromise(
      async () => {
        const current = await aztecNode.getBlockNumber();
        while (lastSeenBlock < current) {
          const n = BlockNumber.add(lastSeenBlock, 1);
          const block = await aztecNode.getBlock(n, { includeTransactions: true });
          lastSeenBlock = n;
          if (!block) {
            continue;
          }
          metrics.observeBlockForMinedTxs(
            n,
            block.body.txEffects.map(t => t.txHash),
            Date.now(),
          );
        }
      },
      logger,
      1000,
    );
    blockWatcher.start();

    sendTxsAtTps(logger, abortController.signal, lowValueLanes, lowValueTps, lowValueSendTx);
    const sentTxHashes = sendTxsAtTps(logger, abortController.signal, highValueLanes, highValueTps, highValueSendTx);

    await sleep(TEST_DURATION_SECONDS * 1000);
    abortController.abort();
    const endedAt = new Date().toISOString();
    logger.info('Stopped transaction senders', {
      lowValueTxs,
      highValueTxs,
      highValueSent: sentTxHashes.length,
    });

    const results: { success: boolean; txHash: string; error?: any }[] = [];
    const highValueInclusionWaitTimeoutSeconds = 300;
    const waitForHighValueTx = async (txHash: string, txName: string) => {
      try {
        const receipt = await waitForTx(aztecNode, TxHash.fromString(txHash), {
          timeout: highValueInclusionWaitTimeoutSeconds,
          waitForStatus: TxStatus.PROPOSED,
        });
        logger.info(`${txName} included in block ${receipt.blockNumber}`, {
          txName,
          blockNumber: receipt.blockNumber,
        });
        logger.debug(`${txName} receipt details`, {
          txHash: receipt.txHash.toString(),
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          transactionFee: receipt.transactionFee?.toString(),
        });
        await metrics.recordMinedTx(receipt);
        results.push({ success: true, txHash });
      } catch (error) {
        const receipt = await aztecNode.getTxReceipt(TxHash.fromString(txHash)).catch(() => undefined);
        logger.error(`${txName} was not included`, {
          txName,
          txHash,
          err: error,
          receiptStatus: receipt?.status,
          receiptBlockNumber: receipt?.blockNumber,
          receiptError: receipt?.error,
        });
        results.push({ success: false, txHash, error });
      }
    };

    let index = 0;
    const totalHighValueSent = sentTxHashes.length;
    logger.info('Waiting for high-value txs to be mined', { totalSent: totalHighValueSent });
    while (sentTxHashes.length > 0) {
      const chunk = sentTxHashes.splice(0, 10);
      await Promise.all(chunk.map((txHash, idx) => waitForHighValueTx(txHash, `highValueTx_${idx + 1 + index}`)));
      index += chunk.length;
      logger.debug('Processed tx batch', { processed: index, remaining: sentTxHashes.length });
    }

    await blockWatcher.stop();

    // Metadata + per-tx inclusion records for the bench_scrape script. Records
    // are filtered to the high-value group, so this is the authoritative
    // client-observed inclusion-latency dataset for the run.
    const inclusionRecords = metrics.getInclusionRecords('tx_inclusion_time');
    const metadataPath = '/tmp/n_tps_timing_data.json';
    await writeFile(
      metadataPath,
      JSON.stringify({ startedAt, endedAt, runId: process.env.BENCH_RUN_ID, inclusionRecords }),
    );
    logger.info('Wrote benchmark metadata', {
      path: metadataPath,
      startedAt,
      endedAt,
      inclusionRecords: inclusionRecords.length,
    });

    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Log failed transactions for debugging
    results
      .filter(r => !r.success)
      .forEach((result, idx) => {
        logger.warn(`Failed transaction ${idx + 1}: ${result.error}`);
      });

    const txInclusionGroup = 'tx_inclusion_time';
    const inclusionStats = metrics.inclusionTimeInSeconds(txInclusionGroup);
    logger.info(`Transaction inclusion summary: ${successCount} succeeded, ${failureCount} failed`);
    logger.info('Inclusion time stats', inclusionStats);

    if (totalHighValueSent === 0 && highValueTps > 0) {
      throw new Error('No high-value txs were sent; check earlier submission errors');
    }
    if (successCount !== totalHighValueSent) {
      const message = `Only ${successCount}/${totalHighValueSent} high-value txs were included; ${failureCount} failed`;
      throw new Error(message);
    }
  });
});

type WalletLane = { wallet: WorkerWallet; aztecNode: AztecNode; address: AztecAddress };
type FeeQuote = { maxFeesPerGas: GasFees; maxPriorityFeesPerGas: GasFees };
type BenchmarkGasSettings = {
  gasLimits?: Gas;
  teardownGasLimits?: Gas;
  maxFeesPerGas?: GasFees;
  maxPriorityFeesPerGas: GasFees;
};

function sendTxsAtTps(
  logger: Logger,
  signal: AbortSignal,
  lanes: WalletLane[],
  targetTps: number,
  sendTx: (wallet: WorkerWallet, walletNode: AztecNode, from: AztecAddress) => Promise<string>,
): string[] {
  const promiseCount = Math.ceil(targetTps);
  if (lanes.length < promiseCount) {
    throw new Error('Not enough wallets to achieve desired TPS');
  }

  const txHashes: string[] = [];
  const targetTpsPerPromise = targetTps / promiseCount;
  logger.info('Starting TPS sender', {
    targetTps,
    walletCount: lanes.length,
    promiseCount,
    targetTpsPerPromise,
  });
  // start N "threads", where N is the target TPS rounded up
  // each wallet is responsible for N/targetTps txs per sec
  const promises = times(
    promiseCount,
    i =>
      new RunningPromise(
        async () => {
          const { wallet, aztecNode: walletNode, address } = lanes[i];

          const start = performance.now(); // ms
          try {
            const txHash = await sendTx(wallet, walletNode, address);
            txHashes.push(txHash);
          } catch (err) {
            logger.error('Failed to submit tx', { walletIndex: i, err });
            throw err;
          }
          const dt = performance.now() - start; // ms

          const tps = 1000 / dt; // We just sent one tx. Calculate TPS. Note: we have to convert ms to s

          const expectedMs = 1000 / targetTpsPerPromise;
          if (dt > expectedMs * 2) {
            logger.debug('Tx submission slower than target', {
              walletIndex: i,
              durationMs: dt,
              targetMs: expectedMs,
              observedTps: tps,
            });
          }

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

  return txHashes;
}

async function cloneTx(tx: ProvenTx, feeQuote: FeeQuote, logger: Logger): Promise<ProvenTx> {
  const t0 = performance.now();
  const clonedTxData = Tx.clone(tx, false);
  const t1 = performance.now();

  // The tx pool orders by priority fee capped by maxFeesPerGas; keep both values explicit so
  // refreshed fee floors do not erase the low/high-value priority split.
  const gasSettings = clonedTxData.data.constants.txContext.gasSettings;
  clonedTxData.data.constants.txContext.gasSettings = GasSettings.from({
    gasLimits: gasSettings.gasLimits,
    teardownGasLimits: gasSettings.teardownGasLimits,
    maxFeesPerGas: feeQuote.maxFeesPerGas,
    maxPriorityFeesPerGas: feeQuote.maxPriorityFeesPerGas,
  });

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
  const t2 = performance.now();

  const clonedTx = new ProvenTx((tx as any).node, clonedTxData, tx.offchainEffects, tx.stats);
  await clonedTx.recomputeHash();
  const t3 = performance.now();

  logger.debug('cloneTx timing', {
    cloneMs: Math.round(t1 - t0),
    mutateMs: Math.round(t2 - t1),
    rehashMs: Math.round(t3 - t2),
    totalMs: Math.round(t3 - t0),
  });
  return clonedTx;
}
