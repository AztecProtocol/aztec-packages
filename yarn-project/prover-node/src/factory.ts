import { type Archiver, createArchiver } from '@aztec/archiver';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import { EpochCache } from '@aztec/epoch-cache';
import { L1TxUtils, RollupContract, createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { trySnapshotSync } from '@aztec/node-lib/actions';
import { createProverClient } from '@aztec/prover-client';
import { createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { P2PApiSchema, type ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { type ProverNodeConfig, resolveConfig } from './config.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import type { TxSource } from './prover-coordination/combined-prover-coordination.js';
import { createProverCoordination } from './prover-coordination/factory.js';
import { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode, type ProverNodeOptions } from './prover-node.js';

/** Creates a new prover node given a config. */
export async function createProverNode(
  userConfig: ProverNodeConfig & DataStoreConfig,
  deps: {
    telemetry?: TelemetryClient;
    log?: Logger;
    aztecNodeTxProvider?: TxSource;
    archiver?: Archiver;
    publisher?: ProverNodePublisher;
    blobSinkClient?: BlobSinkClientInterface;
    broker?: ProvingJobBroker;
    l1TxUtils?: L1TxUtils;
  } = {},
  options: {
    prefilledPublicData?: PublicDataTreeLeaf[];
  } = {},
  services: NamespacedApiHandlers = {} as NamespacedApiHandlers,
) {
  const config = resolveConfig(userConfig);
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const blobSinkClient =
    deps.blobSinkClient ?? createBlobSinkClient(config, { logger: createLogger('prover-node:blob-sink:client') });
  const log = deps.log ?? createLogger('prover-node');

  await trySnapshotSync(config, log);

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
  const l1Client = createExtendedL1Client(rpcUrls, publisherPrivateKey, chain.chainInfo);

  const rollupContract = new RollupContract(l1Client, config.l1Contracts.rollupAddress.toString());

  const l1TxUtils = deps.l1TxUtils ?? new L1TxUtils(l1Client, log, config);
  const publisher = deps.publisher ?? new ProverNodePublisher(config, { telemetry, rollupContract, l1TxUtils });

  const epochCache = await EpochCache.create(config.l1Contracts.rollupAddress, config);

  // If config.p2pEnabled is true, createProverCoordination will create a p2p client where txs are requested
  // If config.proverCoordinationNodeUrls is not empty, createProverCoordination will create set of aztec node clients from which txs are requested
  const { proverCoordination, p2pClient } = await createProverCoordination(config, {
    aztecNodeTxProvider: deps.aztecNodeTxProvider,
    worldStateSynchronizer,
    archiver,
    epochCache,
    telemetry,
  });

  if (p2pClient) {
    services.p2p = [p2pClient, P2PApiSchema];
  }

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
