import { EpochCache } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { InboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicDebugClient } from '@aztec/ethereum/types';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { merge } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { protocolContractNames } from '@aztec/protocol-contracts';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { FunctionType, decodeFunctionSignature } from '@aztec/stdlib/abi';
import type { ArchiverEmitter } from '@aztec/stdlib/block';
import { type ContractClassPublic, computePublicBytecodeCommitment } from '@aztec/stdlib/contract';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import { createPublicClient, fallback, http } from 'viem';

import { Archiver, type ArchiverDeps } from './archiver.js';
import { type ArchiverConfig, mapArchiverConfig } from './config.js';
import { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { ARCHIVER_DB_VERSION, KVArchiverDataStore } from './store/kv_archiver_store.js';

export const ARCHIVER_STORE_NAME = 'archiver';

/** Creates an archiver store. */
export async function createArchiverStore(
  userConfig: Pick<ArchiverConfig, 'archiverStoreMapSizeKb' | 'maxLogs'> & DataStoreConfig,
) {
  const config = {
    ...userConfig,
    dataStoreMapSizeKb: userConfig.archiverStoreMapSizeKb ?? userConfig.dataStoreMapSizeKb,
  };
  const store = await createStore(ARCHIVER_STORE_NAME, ARCHIVER_DB_VERSION, config, createLogger('archiver:lmdb'));
  return new KVArchiverDataStore(store, config.maxLogs);
}

/**
 * Creates a local archiver.
 * @param config - The archiver configuration.
 * @param deps - The archiver dependencies (blobClient, epochCache, dateProvider, telemetry).
 * @param opts - The options.
 * @returns The local archiver.
 */
export async function createArchiver(
  config: ArchiverConfig & DataStoreConfig,
  deps: ArchiverDeps,
  opts: { blockUntilSync: boolean } = { blockUntilSync: true },
): Promise<Archiver> {
  const archiverStore = await createArchiverStore(config);
  await registerProtocolContracts(archiverStore);

  // Create Ethereum clients
  const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(config.l1RpcUrls.map(url => http(url, { batch: false }))),
    pollingInterval: config.viemPollingIntervalMS,
  });

  // Create debug client using debug RPC URLs if available, otherwise fall back to regular RPC URLs
  const debugRpcUrls = config.l1DebugRpcUrls.length > 0 ? config.l1DebugRpcUrls : config.l1RpcUrls;
  const debugClient = createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(debugRpcUrls.map(url => http(url, { batch: false }))),
    pollingInterval: config.viemPollingIntervalMS,
  }) as ViemPublicDebugClient;

  // Create L1 contract instances
  const rollup = new RollupContract(publicClient, config.l1Contracts.rollupAddress);
  const inbox = new InboxContract(publicClient, config.l1Contracts.inboxAddress);

  // Fetch L1 constants from rollup contract
  const [l1StartBlock, l1GenesisTime, proofSubmissionEpochs, genesisArchiveRoot, slashingProposerAddress] =
    await Promise.all([
      rollup.getL1StartBlock(),
      rollup.getL1GenesisTime(),
      rollup.getProofSubmissionEpochs(),
      rollup.getGenesisArchiveTreeRoot(),
      rollup.getSlashingProposerAddress(),
    ] as const);

  const l1StartBlockHash = await publicClient
    .getBlock({ blockNumber: l1StartBlock, includeTransactions: false })
    .then(block => Buffer32.fromString(block.hash));

  const { aztecEpochDuration: epochDuration, aztecSlotDuration: slotDuration, ethereumSlotDuration } = config;

  const l1Constants = {
    l1StartBlockHash,
    l1StartBlock,
    l1GenesisTime,
    epochDuration,
    slotDuration,
    ethereumSlotDuration,
    proofSubmissionEpochs: Number(proofSubmissionEpochs),
    genesisArchiveRoot: Fr.fromString(genesisArchiveRoot.toString()),
  };

  const archiverConfig = merge(
    {
      pollingIntervalMs: 10_000,
      batchSize: 100,
      maxAllowedEthClientDriftSeconds: 300,
      ethereumAllowNoDebugHosts: false,
    },
    mapArchiverConfig(config),
  );

  const epochCache = deps.epochCache ?? (await EpochCache.create(config.l1Contracts.rollupAddress, config, deps));
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const instrumentation = await ArchiverInstrumentation.new(telemetry, () => archiverStore.estimateSize());

  // Create the event emitter that will be shared by archiver and synchronizer
  const events = new EventEmitter() as ArchiverEmitter;

  // Create the L1 synchronizer
  const synchronizer = new ArchiverL1Synchronizer(
    publicClient,
    debugClient,
    rollup,
    inbox,
    { ...config.l1Contracts, slashingProposerAddress },
    archiverStore,
    archiverConfig,
    deps.blobClient,
    epochCache,
    deps.dateProvider ?? new DateProvider(),
    instrumentation,
    l1Constants,
    events,
    instrumentation.tracer,
  );

  const archiver = new Archiver(
    publicClient,
    debugClient,
    rollup,
    { ...config.l1Contracts, slashingProposerAddress },
    archiverStore,
    archiverConfig,
    deps.blobClient,
    instrumentation,
    l1Constants,
    synchronizer,
    events,
  );

  await archiver.start(opts.blockUntilSync);
  return archiver;
}

async function registerProtocolContracts(store: KVArchiverDataStore) {
  const blockNumber = 0;
  for (const name of protocolContractNames) {
    const provider = new BundledProtocolContractsProvider();
    const contract = await provider.getProtocolContractArtifact(name);
    const contractClassPublic: ContractClassPublic = {
      ...contract.contractClass,
      privateFunctions: [],
      utilityFunctions: [],
    };

    const publicFunctionSignatures = contract.artifact.functions
      .filter(fn => fn.functionType === FunctionType.PUBLIC)
      .map(fn => decodeFunctionSignature(fn.name, fn.parameters));

    await store.registerContractFunctionSignatures(publicFunctionSignatures);
    const bytecodeCommitment = await computePublicBytecodeCommitment(contractClassPublic.packedBytecode);
    await store.addContractClasses([contractClassPublic], [bytecodeCommitment], BlockNumber(blockNumber));
    await store.addContractInstances([contract.instance], BlockNumber(blockNumber));
  }
}
