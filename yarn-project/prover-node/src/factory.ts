import { type Archiver, createArchiver } from '@aztec/archiver';
import { BBCircuitVerifier, QueuedIVCVerifier, TestCircuitVerifier } from '@aztec/bb-prover';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import { EpochCache } from '@aztec/epoch-cache';
import { L1TxUtils, RollupContract, createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import { pick } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { trySnapshotSync } from '@aztec/node-lib/actions';
import { createP2PClient } from '@aztec/p2p';
import { createProverClient } from '@aztec/prover-client';
import { createAndStartProvingBroker } from '@aztec/prover-client/broker';
import type { ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { P2PClientType } from '@aztec/stdlib/p2p';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { type ProverNodeConfig, resolveConfig } from './config.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import type { TxSource } from './prover-coordination/combined-prover-coordination.js';
import { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode } from './prover-node.js';

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
    dateProvider?: DateProvider;
  } = {},
  options: {
    prefilledPublicData?: PublicDataTreeLeaf[];
  } = {},
) {
  const config = resolveConfig(userConfig);
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const dateProvider = deps.dateProvider ?? new DateProvider();
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
  const l1Client = createExtendedL1Client(rpcUrls, publisherPrivateKey.getValue(), chain.chainInfo);

  const rollupContract = new RollupContract(l1Client, config.l1Contracts.rollupAddress.toString());

  const l1TxUtils = deps.l1TxUtils ?? new L1TxUtils(l1Client, log, config);
  const publisher = deps.publisher ?? new ProverNodePublisher(config, { telemetry, rollupContract, l1TxUtils });

  const epochCache = await EpochCache.create(config.l1Contracts.rollupAddress, config);

  const proofVerifier = new QueuedIVCVerifier(
    config,
    config.realProofs ? await BBCircuitVerifier.new(config) : new TestCircuitVerifier(),
  );

  const p2pClient = await createP2PClient(
    P2PClientType.Prover,
    config,
    archiver,
    proofVerifier,
    worldStateSynchronizer,
    epochCache,
    getPackageVersion() ?? '',
    dateProvider,
    telemetry,
  );

  await p2pClient.start();

  const proverNodeConfig = {
    ...pick(
      config,
      'proverNodeMaxPendingJobs',
      'proverNodeMaxParallelBlocksPerEpoch',
      'proverNodePollingIntervalMs',
      'txGatheringMaxParallelRequests',
      'txGatheringIntervalMs',
      'txGatheringTimeoutMs',
      'proverNodeFailedEpochStore',
      'dataDirectory',
      'l1ChainId',
      'rollupVersion',
    ),
  };

  const epochMonitor = await EpochMonitor.create(
    archiver,
    { pollingIntervalMs: config.proverNodePollingIntervalMs },
    telemetry,
  );

  return new ProverNode(
    prover,
    publisher,
    archiver,
    archiver,
    archiver,
    worldStateSynchronizer,
    p2pClient,
    epochMonitor,
    proverNodeConfig,
    telemetry,
  );
}
