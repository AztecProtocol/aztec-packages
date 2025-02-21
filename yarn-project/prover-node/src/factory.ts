import { type Archiver, createArchiver } from '@aztec/archiver';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import { type ProverCoordination, type ProvingJobBroker } from '@aztec/circuit-types/interfaces/server';
import { type PublicDataTreeLeaf } from '@aztec/circuits.js/trees';
import { EpochCache } from '@aztec/epoch-cache';
import { L1TxUtils, RollupContract, createEthereumChain, createL1Clients } from '@aztec/ethereum';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { createProverClient } from '@aztec/prover-client';
import { createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { type ProverNodeConfig } from './config.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { createProverCoordination } from './prover-coordination/factory.js';
import { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode, type ProverNodeOptions } from './prover-node.js';

/** Creates a new prover node given a config. */
export async function createProverNode(
  config: ProverNodeConfig & DataStoreConfig,
  deps: {
    telemetry?: TelemetryClient;
    log?: Logger;
    aztecNodeTxProvider?: ProverCoordination;
    archiver?: Archiver;
    publisher?: ProverNodePublisher;
    blobSinkClient?: BlobSinkClientInterface;
    broker?: ProvingJobBroker;
    l1TxUtils?: L1TxUtils;
  } = {},
  options: {
    prefilledPublicData?: PublicDataTreeLeaf[];
  } = {},
) {
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const blobSinkClient = deps.blobSinkClient ?? createBlobSinkClient(config);
  const log = deps.log ?? createLogger('prover-node');
  const archiver = deps.archiver ?? (await createArchiver(config, blobSinkClient, { blockUntilSync: true }, telemetry));
  log.verbose(`Created archiver and synced to block ${await archiver.getBlockNumber()}`);

  const worldStateConfig = { ...config, worldStateProvenBlocksOnly: false };
  const worldStateSynchronizer = await createWorldStateSynchronizer(
    worldStateConfig,
    archiver,
    options.prefilledPublicData,
    telemetry,
  );
  await worldStateSynchronizer.start();

  const broker = deps.broker ?? (await createAndStartProvingBroker(config, telemetry));
  const prover = await createProverClient(config, worldStateSynchronizer, broker, telemetry);

  const { l1RpcUrls: rpcUrls, l1ChainId: chainId, publisherPrivateKey } = config;
  const chain = createEthereumChain(rpcUrls, chainId);
  const { publicClient, walletClient } = createL1Clients(rpcUrls, publisherPrivateKey, chain.chainInfo);

  const rollupContract = new RollupContract(publicClient, config.l1Contracts.rollupAddress.toString());

  const l1TxUtils = deps.l1TxUtils ?? new L1TxUtils(publicClient, walletClient, log, config);
  const publisher = deps.publisher ?? new ProverNodePublisher(config, { telemetry, rollupContract, l1TxUtils });

  const epochCache = await EpochCache.create(config.l1Contracts.rollupAddress, config);

  // If config.p2pEnabled is true, createProverCoordination will create a p2p client where txs are requested
  // If config.p2pEnabled is false, createProverCoordination request information from the AztecNode
  const proverCoordination = await createProverCoordination(config, {
    aztecNodeTxProvider: deps.aztecNodeTxProvider,
    worldStateSynchronizer,
    archiver,
    epochCache,
    telemetry,
  });

  const proverNodeConfig: ProverNodeOptions = {
    maxPendingJobs: config.proverNodeMaxPendingJobs,
    pollingIntervalMs: config.proverNodePollingIntervalMs,
    maxParallelBlocksPerEpoch: config.proverNodeMaxParallelBlocksPerEpoch,
    txGatheringMaxParallelRequests: config.txGatheringMaxParallelRequests,
    txGatheringIntervalMs: config.txGatheringIntervalMs,
    txGatheringTimeoutMs: config.txGatheringTimeoutMs,
  };

  const epochMonitor = await EpochMonitor.create(archiver, proverNodeConfig, telemetry);

  return new ProverNode(
    prover,
    publisher,
    archiver,
    archiver,
    archiver,
    worldStateSynchronizer,
    proverCoordination,
    epochMonitor,
    proverNodeConfig,
    telemetry,
  );
}
