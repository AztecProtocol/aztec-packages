import { EpochCache } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { makeL1HttpTransport } from '@aztec/ethereum/client';
import { InboxContract, OutboxContract, RollupContract } from '@aztec/ethereum/contracts';
import { pickL1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ViemPublicDebugClient } from '@aztec/ethereum/types';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { merge } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { DateProvider } from '@aztec/foundation/timer';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { protocolContractNames } from '@aztec/protocol-contracts';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { FunctionType, decodeFunctionSignature } from '@aztec/stdlib/abi';
import type { ArchiverEmitter, BlockHash } from '@aztec/stdlib/block';
import { DEFAULT_BLOCK_DURATION_MS } from '@aztec/stdlib/config';
import { type ContractClassPublicWithCommitment, computePublicBytecodeCommitment } from '@aztec/stdlib/contract';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';
import { MIN_EXECUTION_TIME } from '@aztec/stdlib/timetable';
import type { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import { createPublicClient } from 'viem';

import { Archiver, type ArchiverDeps } from './archiver.js';
import { type ArchiverConfig, mapArchiverConfig } from './config.js';
import { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { ARCHIVER_DB_VERSION, type ArchiverDataStores, createArchiverDataStores } from './store/data_stores.js';
import { L2TipsCache } from './store/l2_tips_cache.js';

export const ARCHIVER_STORE_NAME = 'archiver';

/** Creates an archiver store. */
export async function createArchiverStore(
  userConfig: Pick<ArchiverConfig, 'archiverStoreMapSizeKb'> & DataStoreConfig,
  genesisBlockHash: BlockHash,
): Promise<ArchiverDataStores> {
  const config = {
    ...userConfig,
    dataStoreMapSizeKb: userConfig.archiverStoreMapSizeKb ?? userConfig.dataStoreMapSizeKb,
  };
  const store = await createStore(ARCHIVER_STORE_NAME, ARCHIVER_DB_VERSION, config);
  return createArchiverDataStores(store, genesisBlockHash);
}

/**
 * Creates a local archiver.
 * @param config - The archiver configuration.
 * @param deps - The archiver dependencies (blobClient, epochCache, dateProvider, telemetry).
 * @param opts - The options.
 * @param initialHeader - The genesis block header from world-state, used to answer block-0 queries.
 * @param initialBlockHash - Precomputed hash of `initialHeader`. Hoisted to the caller so the archiver
 * can expose `getGenesisBlockHash()` synchronously.
 * @returns The local archiver.
 */
export async function createArchiver(
  config: ArchiverConfig & DataStoreConfig,
  deps: ArchiverDeps,
  opts: { blockUntilSync: boolean; enableOrphanProposedBlockPruning?: boolean } = { blockUntilSync: true },
  initialHeader: BlockHeader,
  initialBlockHash: BlockHash,
): Promise<Archiver> {
  const archiverStore = await createArchiverStore(config, initialBlockHash);
  await registerProtocolContracts(archiverStore);

  // Create Ethereum clients
  const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
  const httpTimeout = config.l1HttpTimeoutMS;
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: makeL1HttpTransport(config.l1RpcUrls, { timeout: httpTimeout }),
    pollingInterval: config.viemPollingIntervalMS,
  });

  // Create debug client using debug RPC URLs if available, otherwise fall back to regular RPC URLs
  const debugRpcUrls = config.l1DebugRpcUrls.length > 0 ? config.l1DebugRpcUrls : config.l1RpcUrls;
  const debugClient = createPublicClient({
    chain: chain.chainInfo,
    transport: makeL1HttpTransport(debugRpcUrls, { timeout: httpTimeout }),
    pollingInterval: config.viemPollingIntervalMS,
  }) as ViemPublicDebugClient;

  // Create L1 contract instances
  const rollup = new RollupContract(publicClient, config.rollupAddress);
  const inbox = new InboxContract(publicClient, config.inboxAddress);
  const outbox = new OutboxContract(publicClient, config.outboxAddress);

  // Fetch L1 constants from rollup contract
  const [
    l1StartBlock,
    l1GenesisTime,
    proofSubmissionEpochs,
    genesisArchiveRoot,
    slashingProposerAddress,
    targetCommitteeSize,
    rollupManaLimit,
  ] = await Promise.all([
    rollup.getL1StartBlock(),
    rollup.getL1GenesisTime(),
    rollup.getProofSubmissionEpochs(),
    rollup.getGenesisArchiveTreeRoot(),
    rollup.getSlashingProposerAddress(),
    rollup.getTargetCommitteeSize(),
    rollup.getManaLimit(),
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
    targetCommitteeSize,
    genesisArchiveRoot: Fr.fromString(genesisArchiveRoot.toString()),
    rollupManaLimit: Number(rollupManaLimit),
  };

  const archiverConfig = merge(
    {
      pollingIntervalMs: 10_000,
      batchSize: 100,
      maxAllowedEthClientDriftSeconds: 300,
      ethereumAllowNoDebugHosts: false,
      skipHistoricalLogsCheck: false,
<<<<<<< HEAD
      orphanProposedBlockPruneGraceSeconds: MIN_EXECUTION_TIME,
      enableOrphanProposedBlockPruning: opts.enableOrphanProposedBlockPruning ?? true,
=======
      checkpointProposalSyncGrace:
        config.checkpointProposalSyncGraceSeconds ??
        getDefaultCheckpointProposalSyncGrace((config.blockDurationMs ?? DEFAULT_BLOCK_DURATION_MS) / 1000),
      orphanPruneNoProposalTolerance: DEFAULT_ORPHAN_PRUNE_NO_PROPOSAL_TOLERANCE,
      skipOrphanProposedBlockPruning: false,
      blockDuration: (config.blockDurationMs ?? DEFAULT_BLOCK_DURATION_MS) / 1000,
>>>>>>> ab5413c72dc (feat: merge-train/spartan-v5 (#23975))
    },
    mapArchiverConfig(config),
  );

  const epochCache = deps.epochCache ?? (await EpochCache.create(config.rollupAddress, config, deps));
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const instrumentation = await ArchiverInstrumentation.new(telemetry, () => archiverStore.db.estimateSize());

  // Create the event emitter that will be shared by archiver and synchronizer
  const events = new EventEmitter() as ArchiverEmitter;

  // Create L2 tips cache shared by archiver and synchronizer. The genesis block hash is dynamic —
  // it depends on the injected initial header (genesisTimestamp + prefilled state). Hoisted to the
  // caller so we can pass the same value to the archiver and expose it via `getGenesisBlockHash()`.
  const l2TipsCache = new L2TipsCache(archiverStore.blocks, initialBlockHash);

  // Create the L1 synchronizer
  const synchronizer = new ArchiverL1Synchronizer(
    publicClient,
    debugClient,
    rollup,
    inbox,
    archiverStore,
    archiverConfig,
    deps.blobClient,
    epochCache,
    deps.dateProvider ?? new DateProvider(),
    instrumentation,
    l1Constants,
    events,
    instrumentation.tracer,
    l2TipsCache,
    undefined, // log (use default)
  );

  const archiver = new Archiver(
    publicClient,
    debugClient,
    rollup,
    outbox,
    { ...pickL1ContractAddresses(config), slashingProposerAddress },
    archiverStore,
    archiverConfig,
    deps.blobClient,
    instrumentation,
    l1Constants,
    synchronizer,
    events,
    initialHeader,
    initialBlockHash,
    l2TipsCache,
    deps.dateProvider ?? new DateProvider(),
  );

  await archiver.start(opts.blockUntilSync);
  return archiver;
}

/** Registers protocol contracts in the archiver store. Idempotent — skips contracts that already exist (e.g. on node restart). */
export async function registerProtocolContracts(stores: ArchiverDataStores) {
  const blockNumber = 0;
  for (const name of protocolContractNames) {
    const provider = new BundledProtocolContractsProvider();
    const contract = await provider.getProtocolContractArtifact(name);

    // Skip if already registered (happens on node restart with a persisted store).
    if (await stores.contractClasses.getContractClass(contract.contractClass.id)) {
      continue;
    }

    const publicBytecodeCommitment = await computePublicBytecodeCommitment(contract.contractClass.packedBytecode);
    const contractClassPublic: ContractClassPublicWithCommitment = {
      ...contract.contractClass,
      publicBytecodeCommitment,
    };

    const publicFunctionSignatures = contract.artifact.functions
      .filter(fn => fn.functionType === FunctionType.PUBLIC)
      .map(fn => decodeFunctionSignature(fn.name, fn.parameters));

    await stores.functionNames.register(publicFunctionSignatures);
    await stores.contractClasses.addContractClasses([contractClassPublic], BlockNumber(blockNumber));
    await stores.contractInstances.addContractInstances([contract.instance], BlockNumber(blockNumber));
  }
}
