import type { Archiver } from '@aztec/archiver';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import { Blob } from '@aztec/blob-lib';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { makeL1HttpTransport } from '@aztec/ethereum/client';
import { RollupContract } from '@aztec/ethereum/contracts';
import { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { PublisherManager } from '@aztec/ethereum/publisher-manager';
import { pick } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { KeystoreManager } from '@aztec/node-keystore';
import { createForwarderL1TxUtilsFromSigners, createL1TxUtilsFromSigners } from '@aztec/node-lib/factories';
import { type ProverClientConfig, type ProverClientUserConfig, createProverClient } from '@aztec/prover-client';
import { createAndStartProvingBroker } from '@aztec/prover-client/broker';
import {
  type ProverPublisherConfig,
  type ProverTxSenderConfig,
  getPublisherConfigFromProverConfig,
} from '@aztec/sequencer-client';
import type { AvmIpcBackend, CdbIpcServer } from '@aztec/simulator/server';
import type {
  ITxProvider,
  ProverConfig,
  ProvingJobBroker,
  Service,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { L1Metrics, type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { createPublicClient } from 'viem';

import type { SpecificProverNodeConfig } from './config.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { ProverNode } from './prover-node.js';
import { ProverPublisherFactory } from './prover-publisher-factory.js';

export type ProverNodeDeps = {
  telemetry?: TelemetryClient;
  log?: Logger;
  archiver: Archiver;
  publisherFactory?: ProverPublisherFactory;
  broker?: ProvingJobBroker;
  l1TxUtils?: L1TxUtils;
  dateProvider?: DateProvider;
  worldStateSynchronizer: WorldStateSynchronizer;
  p2pClient: { getTxProvider(): ITxProvider } & Partial<Service>;
  epochCache: EpochCacheInterface;
  blobClient: BlobClientInterface;
  keyStoreManager?: KeystoreManager;
  /** AVM IPC backend for public simulation. */
  avmBackend: AvmIpcBackend;
  /** CDB IPC server for contract data queries during AVM simulation. */
  cdbServer?: CdbIpcServer;
};

/** Creates a new prover node subsystem given a config and dependencies */
export async function createProverNode(
  userConfig: SpecificProverNodeConfig &
    ProverConfig &
    ProverClientUserConfig &
    ProverPublisherConfig &
    ProverTxSenderConfig,
  deps: ProverNodeDeps,
) {
  const config = { ...userConfig };
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const dateProvider = deps.dateProvider ?? new DateProvider();
  const log = deps.log ?? createLogger('prover');

  const { p2pClient, archiver, keyStoreManager, worldStateSynchronizer } = deps;

  // Extract the prover signers from the key store and verify that we have one.
  await keyStoreManager?.validateSigners();
  const proverSigners = keyStoreManager?.createProverSigners();

  if (proverSigners === undefined) {
    throw new Error('Failed to create prover key store configuration');
  } else if (proverSigners.signers.length === 0) {
    throw new Error('No prover signers found in the key store');
  }

  log.info(`Creating prover with publishers ${proverSigners.signers.map(signer => signer.address.toString()).join()}`);

  // Only consider user provided config if it is valid
  const proverIdInUserConfig = config.proverId === undefined || config.proverId.isZero() ? undefined : config.proverId;

  // ProverId: Take from key store if provided, otherwise from user config if valid, otherwise address of first signer
  const proverId = proverSigners.id ?? proverIdInUserConfig ?? proverSigners.signers[0].address;

  // Now create the prover client configuration from this.
  const proverClientConfig: ProverClientConfig = { ...config, proverId };

  const broker = deps.broker ?? (await createAndStartProvingBroker(config, telemetry));

  const prover = await createProverClient(proverClientConfig, worldStateSynchronizer, broker, telemetry);

  const { l1RpcUrls: rpcUrls, l1ChainId: chainId } = config;
  const chain = createEthereumChain(rpcUrls, chainId);

  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: makeL1HttpTransport(config.l1RpcUrls, { timeout: config.l1HttpTimeoutMS }),
    pollingInterval: config.viemPollingIntervalMS,
  });

  const rollupContract = new RollupContract(publicClient, config.rollupAddress.toString());

  const l1TxUtils = deps.l1TxUtils
    ? [deps.l1TxUtils]
    : config.proverPublisherForwarderAddress
      ? await createForwarderL1TxUtilsFromSigners(
          publicClient,
          proverSigners.signers,
          config.proverPublisherForwarderAddress,
          { ...config, scope: 'prover' },
          { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider, kzg: Blob.getViemKzgInstance() },
        )
      : await createL1TxUtilsFromSigners(
          publicClient,
          proverSigners.signers,
          { ...config, scope: 'prover' },
          { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider },
        );

  // Create a funder L1TxUtils from the keystore funding account (if configured)
  const fundingSigner = keyStoreManager?.createFundingSigner();
  let funderL1TxUtils: L1TxUtils | undefined;
  if (fundingSigner) {
    const [funder] = await createL1TxUtilsFromSigners(
      publicClient,
      [fundingSigner],
      { ...config, scope: 'prover' },
      { telemetry, logger: log.createChild('l1-tx-utils:funder'), dateProvider },
    );
    funderL1TxUtils = funder;
  }

  const publisherFactory =
    deps.publisherFactory ??
    new ProverPublisherFactory(config, {
      rollupContract,
      publisherManager: new PublisherManager(l1TxUtils, getPublisherConfigFromProverConfig(config), {
        bindings: log.getBindings(),
        funder: funderL1TxUtils,
      }),
      telemetry,
    });

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
      'proverNodeDisableProofPublish',
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

  // Extract the shared delayer from the first L1TxUtils instance (all instances share the same delayer)
  const delayer = l1TxUtils[0]?.delayer;

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
    deps.avmBackend,
    deps.cdbServer,
    proverNodeConfig,
    telemetry,
    delayer,
    dateProvider,
  );
}
