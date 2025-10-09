import { type Archiver, createArchiver } from '@aztec/archiver';
import { BBCircuitVerifier, QueuedIVCVerifier, TestCircuitVerifier } from '@aztec/bb-prover';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import { EpochCache } from '@aztec/epoch-cache';
import { L1TxUtils, PublisherManager, RollupContract, createEthereumChain } from '@aztec/ethereum';
import { pick } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { type KeyStoreConfig, KeystoreManager, loadKeystores, mergeKeystores } from '@aztec/node-keystore';
import { trySnapshotSync } from '@aztec/node-lib/actions';
import { createL1TxUtilsFromEthSignerWithStore } from '@aztec/node-lib/factories';
import { NodeRpcTxSource, createP2PClient } from '@aztec/p2p';
import { type ProverClientConfig, createProverClient } from '@aztec/prover-client';
import { createAndStartProvingBroker } from '@aztec/prover-client/broker';
import type { AztecNode, ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { P2PClientType } from '@aztec/stdlib/p2p';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { L1Metrics, type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient, fallback, http } from 'viem';

import { type ProverNodeConfig, createKeyStoreForProver } from './config.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { ProverNode } from './prover-node.js';
import { ProverPublisherFactory } from './prover-publisher-factory.js';

export type ProverNodeDeps = {
  telemetry?: TelemetryClient;
  log?: Logger;
  aztecNodeTxProvider?: Pick<AztecNode, 'getTxsByHash'>;
  archiver?: Archiver;
  publisherFactory?: ProverPublisherFactory;
  blobSinkClient?: BlobSinkClientInterface;
  broker?: ProvingJobBroker;
  l1TxUtils?: L1TxUtils;
  dateProvider?: DateProvider;
};

/** Creates a new prover node given a config. */
export async function createProverNode(
  userConfig: ProverNodeConfig & DataStoreConfig & KeyStoreConfig,
  deps: ProverNodeDeps = {},
  options: {
    prefilledPublicData?: PublicDataTreeLeaf[];
  } = {},
) {
  const config = { ...userConfig };
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const dateProvider = deps.dateProvider ?? new DateProvider();
  const blobSinkClient =
    deps.blobSinkClient ?? createBlobSinkClient(config, { logger: createLogger('prover-node:blob-sink:client') });
  const log = deps.log ?? createLogger('prover-node');

  // Build a key store from file if given or from environment otherwise
  let keyStoreManager: KeystoreManager | undefined;
  const keyStoreProvided = config.keyStoreDirectory !== undefined && config.keyStoreDirectory.length > 0;
  if (keyStoreProvided) {
    const keyStores = loadKeystores(config.keyStoreDirectory!);
    keyStoreManager = new KeystoreManager(mergeKeystores(keyStores));
  } else {
    const keyStore = createKeyStoreForProver(config);
    if (keyStore) {
      keyStoreManager = new KeystoreManager(keyStore);
    }
  }

  await keyStoreManager?.validateSigners();

  // Extract the prover signers from the key store and verify that we have one.
  const proverSigners = keyStoreManager?.createProverSigners();

  if (proverSigners === undefined) {
    throw new Error('Failed to create prover key store configuration');
  } else if (proverSigners.signers.length === 0) {
    throw new Error('No prover signers found in the key store');
  } else if (!keyStoreProvided) {
    log.warn(
      'KEY STORE CREATED FROM ENVIRONMENT, IT IS RECOMMENDED TO USE A FILE-BASED KEY STORE IN PRODUCTION ENVIRONMENTS',
    );
  }

  log.info(`Creating prover with publishers ${proverSigners.signers.map(signer => signer.address.toString()).join()}`);

  // Only consider user provided config if it is valid
  const proverIdInUserConfig = config.proverId === undefined || config.proverId.isZero() ? undefined : config.proverId;

  // ProverId: Take from key store if provided, otherwise from user config if valid, otherwise address of first signer
  const proverId = proverSigners.id ?? proverIdInUserConfig ?? proverSigners.signers[0].address;

  // Now create the prover client configuration from this.
  const proverClientConfig: ProverClientConfig = {
    ...config,
    proverId,
  };

  await trySnapshotSync(config, log);

  const epochCache = await EpochCache.create(config.l1Contracts.rollupAddress, config);

  const archiver =
    deps.archiver ??
    (await createArchiver(config, { blobSinkClient, epochCache, telemetry, dateProvider }, { blockUntilSync: true }));
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

  const prover = await createProverClient(proverClientConfig, worldStateSynchronizer, broker, telemetry);

  const { l1RpcUrls: rpcUrls, l1ChainId: chainId } = config;
  const chain = createEthereumChain(rpcUrls, chainId);

  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(config.l1RpcUrls.map((url: string) => http(url))),
    pollingInterval: config.viemPollingIntervalMS,
  });

  const rollupContract = new RollupContract(publicClient, config.l1Contracts.rollupAddress.toString());

  const l1TxUtils = deps.l1TxUtils
    ? [deps.l1TxUtils]
    : await createL1TxUtilsFromEthSignerWithStore(
        publicClient,
        proverSigners.signers,
        { ...config, scope: 'prover' },
        { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider },
      );

  const publisherFactory =
    deps.publisherFactory ??
    new ProverPublisherFactory(config, {
      rollupContract,
      publisherManager: new PublisherManager(l1TxUtils, config),
      telemetry,
    });

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
    {
      txCollectionNodeSources: deps.aztecNodeTxProvider
        ? [new NodeRpcTxSource(deps.aztecNodeTxProvider, 'TestNode')]
        : [],
    },
  );

  await p2pClient.start();

  const proverNodeConfig = {
    ...pick(
      config,
      'proverNodeMaxPendingJobs',
      'proverNodeMaxParallelBlocksPerEpoch',
      'proverNodePollingIntervalMs',
      'proverNodeEpochProvingDelayMs',
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
    { pollingIntervalMs: config.proverNodePollingIntervalMs, provingDelayMs: config.proverNodeEpochProvingDelayMs },
    telemetry,
  );

  const l1Metrics = new L1Metrics(
    telemetry.getMeter('ProverNodeL1Metrics'),
    publicClient,
    l1TxUtils.map(utils => utils.getSenderAddress()),
  );

  return new ProverNode(
    prover,
    publisherFactory,
    archiver,
    archiver,
    archiver,
    worldStateSynchronizer,
    p2pClient,
    epochMonitor,
    rollupContract,
    l1Metrics,
    proverNodeConfig,
    telemetry,
  );
}
