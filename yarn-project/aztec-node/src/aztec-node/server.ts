import { Archiver, createArchiver } from '@aztec/archiver';
import { BBCircuitVerifier, BatchChonkVerifier, QueuedIVCVerifier } from '@aztec/bb-prover';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { type BlobClientInterface, createBlobClientWithFileStores } from '@aztec/blob-client/client';
import { Blob } from '@aztec/blob-lib';
import { ARCHIVE_HEIGHT, type L1_TO_L2_MSG_TREE_HEIGHT, type NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { EpochCache, type EpochCacheInterface } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { getPublicClient, makeL1HttpTransport } from '@aztec/ethereum/client';
import { RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import { type L1ContractAddresses, pickL1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import {
  BlockNumber,
  CheckpointNumber,
  type CheckpointProposalHash,
  EpochNumber,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { chunkBy, compactArray, pick, unique } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { count } from '@aztec/foundation/string';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';
import { type KeyStore, KeystoreManager, loadKeystores, mergeKeystores } from '@aztec/node-keystore';
import { trySnapshotSync, uploadSnapshot } from '@aztec/node-lib/actions';
import { createForwarderL1TxUtilsFromSigners, createL1TxUtilsFromSigners } from '@aztec/node-lib/factories';
import {
  type P2P,
  type P2PClientDeps,
  createP2PClient,
  createTxValidatorForAcceptingTxsOverRPC,
  getDefaultAllowedSetupFunctions,
} from '@aztec/p2p';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type ProverNode, type ProverNodeDeps, createProverNode } from '@aztec/prover-node';
import { createKeyStoreForProver } from '@aztec/prover-node/config';
import {
  FeeProviderImpl,
  GlobalVariableBuilder,
  SequencerClient,
  type SequencerPublisher,
} from '@aztec/sequencer-client';
import { AutomineSequencer, createAutomineSequencer } from '@aztec/sequencer-client/automine';
import {
  AttestationsBlockWatcher,
  AttestedInvalidProposalWatcher,
  BroadcastedInvalidCheckpointProposalWatcher,
  CheckpointEquivocationWatcher,
  DataWithholdingWatcher,
  type SlasherClientInterface,
  type Watcher,
  createSlasher,
} from '@aztec/slasher';
import { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS } from '@aztec/standard-contracts/multi-call-entrypoint';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  type BlockParameter,
  BlockTag,
  type CheckpointsQuery,
  type CommitteeAttestation,
  type DataInBlock,
  type L2BlockSource,
  type L2BlockTag,
  type L2Tips,
  type NormalizedBlockParameter,
  inspectBlockParameter,
} from '@aztec/stdlib/block';
import {
  type CheckpointData,
  CheckpointReexecutionTracker,
  L1PublishedData,
  type PublishedCheckpoint,
} from '@aztec/stdlib/checkpoint';
import type {
  ContractClassPublic,
  ContractDataSource,
  ContractInstanceWithAddress,
  NodeInfo,
  ProtocolContractAddresses,
} from '@aztec/stdlib/contract';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees, type ManaUsageEstimate, getNetworkTxGasLimits } from '@aztec/stdlib/gas';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type {
  AztecNode,
  AztecNodeAdmin,
  AztecNodeAdminConfig,
  AztecNodeDebug,
  BlockIncludeOptions,
  BlockResponse,
  BlocksIncludeOptions,
  CheckpointIncludeOptions,
  CheckpointParameter,
  CheckpointResponse,
  CheckpointTag,
  GetTxByHashOptions,
  PeerInfo,
  ProposalsForSlot,
} from '@aztec/stdlib/interfaces/client';
import { AztecNodeAdminConfigSchema } from '@aztec/stdlib/interfaces/client';
import {
  type AllowedElement,
  type ClientProtocolCircuitVerifier,
  type L2LogsSource,
  type Service,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import type { DebugLogStore, LogResult, PrivateLogsQuery, PublicLogsQuery } from '@aztec/stdlib/logs';
import { InMemoryDebugLogStore, NullDebugLogStore } from '@aztec/stdlib/logs';
import { InboxLeaf, type L1ToL2MessageSource, type L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import type { CheckpointAttestation } from '@aztec/stdlib/p2p';
import type { Offense } from '@aztec/stdlib/slashing';
import type { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import {
  DroppedTxReceipt,
  type FeeProvider,
  type GetTxReceiptOptions,
  type GlobalVariableBuilder as GlobalVariableBuilderInterface,
  type IndexedTxEffect,
  MinedTxReceipt,
  type MinedTxStatus,
  PendingTxReceipt,
  PublicSimulationOutput,
  type SimulationOverrides,
  Tx,
  type TxHash,
  type TxReceipt,
  TxStatus,
  type TxValidationResult,
} from '@aztec/stdlib/tx';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import type { SingleValidatorStats, ValidatorsStats } from '@aztec/stdlib/validators';
import type { GenesisData } from '@aztec/stdlib/world-state';
import {
  Attributes,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';
import {
  FullNodeCheckpointsBuilder as CheckpointsBuilder,
  FullNodeCheckpointsBuilder,
  NodeKeystoreAdapter,
  ValidatorClient,
  createProposalHandler,
  createValidatorClient,
} from '@aztec/validator-client';
import type { SlashingProtectionDatabase } from '@aztec/validator-ha-signer/types';
import { createWorldState, createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient } from 'viem';

import { createSentinel } from '../sentinel/factory.js';
import { Sentinel } from '../sentinel/sentinel.js';
import {
  blockResponseFromBlockData,
  blockResponseFromL2Block,
  checkpointResponseFromCheckpointData,
  checkpointResponseFromPublishedCheckpoint,
  projectProposedToCheckpointResponse,
} from './block_response_helpers.js';
import { type AztecNodeConfig, createKeyStoreForValidator } from './config.js';
import { NodeMetrics } from './node_metrics.js';
import { NodePublicCallsSimulator } from './node_public_calls_simulator.js';

/**
 * The aztec node.
 */
export class AztecNodeService implements AztecNode, AztecNodeAdmin, AztecNodeDebug, Traceable {
  private metrics: NodeMetrics;
  // Prevent two snapshot operations to happen simultaneously
  private isUploadingSnapshot = false;
  // Saved minTxsPerBlock used by `pauseSequencer` to restore production-sequencer config on resume.
  private sequencerPausedMinTxsPerBlock: number | undefined;
  private readonly nodePublicCallsSimulator: NodePublicCallsSimulator;

  public readonly tracer: Tracer;

  constructor(
    protected config: AztecNodeConfig,
    protected readonly p2pClient: P2P,
    protected readonly blockSource: L2BlockSource & Partial<Service>,
    protected readonly logsSource: L2LogsSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly worldStateSynchronizer: WorldStateSynchronizer,
    protected readonly sequencer: SequencerClient | undefined,
    protected readonly proverNode: ProverNode | undefined,
    protected readonly slasherClient: SlasherClientInterface | undefined,
    protected readonly validatorsSentinel: Sentinel | undefined,
    private readonly stopStartedWatchers: () => Promise<void>,
    protected readonly l1ChainId: number,
    protected readonly version: number,
    protected readonly globalVariableBuilder: GlobalVariableBuilderInterface,
    protected readonly rollupContract: RollupContract | undefined,
    protected readonly feeProvider: FeeProvider,
    protected readonly epochCache: EpochCacheInterface,
    protected readonly packageVersion: string,
    private peerProofVerifier: ClientProtocolCircuitVerifier,
    private rpcProofVerifier: ClientProtocolCircuitVerifier,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('node'),
    private blobClient?: BlobClientInterface,
    private validatorClient?: ValidatorClient,
    private keyStoreManager?: KeystoreManager,
    private debugLogStore: DebugLogStore = new NullDebugLogStore(),
    private readonly automineSequencer?: AutomineSequencer,
  ) {
    this.metrics = new NodeMetrics(telemetry, 'AztecNodeService');
    this.tracer = telemetry.getTracer('AztecNodeService');

    // The node never represents a proposer's payout addresses, so the simulator zeroes coinbase and
    // fee recipient. The signature context only needs chain id + rollup address (see signature_utils).
    this.nodePublicCallsSimulator = new NodePublicCallsSimulator({
      blockSource: this.blockSource,
      worldStateSynchronizer: this.worldStateSynchronizer,
      l1ToL2MessageSource: this.l1ToL2MessageSource,
      contractDataSource: this.contractDataSource,
      globalVariableBuilder: this.globalVariableBuilder,
      rollupContract: this.rollupContract,
      epochCache: this.epochCache,
      signatureContext: { chainId: this.l1ChainId, rollupAddress: this.config.rollupAddress },
      config: this.config,
      telemetry: this.telemetry,
      log: this.log.createChild('public-calls-simulator'),
    });

    this.log.info(`Aztec Node version: ${this.packageVersion}`);
    this.log.info(`Aztec Node started on chain 0x${l1ChainId.toString(16)}`, pickL1ContractAddresses(config));

    // A defensive check that protects us against introducing a bug in the complex `createAndSync` function. We must
    // never have debugLogStore enabled when not in test mode because then we would be accumulating debug logs in
    // memory which could be a DoS vector on the sequencer (since no fees are paid for debug logs).
    if (debugLogStore.isEnabled && config.realProofs) {
      throw new Error('debugLogStore should never be enabled when realProofs are set');
    }
  }

  /** @internal Exposed for testing — returns the RPC proof verifier. */
  public getProofVerifier(): ClientProtocolCircuitVerifier {
    return this.rpcProofVerifier;
  }

  public async getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    const status = await this.worldStateSynchronizer.status();
    return status.syncSummary;
  }

  public getChainTips(): Promise<L2Tips> {
    return this.blockSource.getL2Tips();
  }

  public getL1Constants() {
    return this.blockSource.getL1Constants();
  }

  public getSyncedL2SlotNumber() {
    return this.blockSource.getSyncedL2SlotNumber();
  }

  public getSyncedL2EpochNumber() {
    return this.blockSource.getSyncedL2EpochNumber();
  }

  public getSyncedL1Timestamp() {
    return this.blockSource.getL1Timestamp();
  }

  public getCheckpointsData(query: CheckpointsQuery) {
    return this.blockSource.getCheckpointsData(query);
  }

  public async getBlockNumber(tip?: L2BlockTag): Promise<BlockNumber> {
    if (tip === undefined || tip === 'proposed') {
      return this.blockSource.getBlockNumber();
    }
    return (await this.blockSource.getBlockNumber({ tag: tip })) ?? BlockNumber.ZERO;
  }

  public async getCheckpointNumber(tip?: CheckpointTag): Promise<CheckpointNumber> {
    const tips = await this.blockSource.getL2Tips();
    switch (tip) {
      case undefined:
      case 'checkpointed':
        return tips.checkpointed.checkpoint.number;
      case 'proven':
        return tips.proven.checkpoint.number;
      case 'finalized':
        return tips.finalized.checkpoint.number;
    }
  }

  private isCheckpointTag(value: unknown): value is CheckpointTag {
    return value === 'checkpointed' || value === 'proven' || value === 'finalized';
  }

  /**
   * Normalizes a {@link BlockParameter} (which may be a bare value) into a
   * {@link NormalizedBlockParameter} object form. Performs no chain-tip resolution — tag
   * lookups are deferred to the underlying block source.
   */
  private normalizeBlockParameter(param: BlockParameter): NormalizedBlockParameter {
    if (BlockHash.isBlockHash(param)) {
      return { hash: param };
    }
    if (typeof param === 'number') {
      return { number: param as BlockNumber };
    }
    if (typeof param === 'string') {
      if (this.isBlockTag(param)) {
        return { tag: param === 'latest' ? 'proposed' : param };
      }
      throw new BadRequestError(`Invalid BlockParameter tag: ${param}`);
    }
    if (typeof param === 'object' && param !== null) {
      if ('number' in param) {
        return { number: param.number };
      }
      if ('hash' in param) {
        return { hash: param.hash };
      }
      if ('archive' in param) {
        return { archive: param.archive };
      }
      if ('tag' in param) {
        if (this.isBlockTag(param.tag)) {
          return { tag: param.tag };
        }
        throw new BadRequestError(`Invalid BlockParameter tag: ${param.tag}`);
      }
    }
    throw new BadRequestError(`Invalid BlockParameter: ${JSON.stringify(param)}`);
  }

  private isBlockTag(value: string): value is BlockTag {
    return BlockTag.includes(value as BlockTag);
  }

  /**
   * Resolves a {@link CheckpointParameter} into a concrete `{ number }` or `{ slot }` query.
   *
   * Tag-based parameters (`'checkpointed'`, `'proven'`, `'finalized'`) are translated up-front to the
   * corresponding tip's checkpoint number via {@link L2BlockSource.getL2Tips}. After resolution the
   * unified {@link getCheckpoint} flow can perform a single confirmed→proposed lookup against either
   * store.
   */
  private async resolveCheckpointParameter(
    param: CheckpointParameter,
  ): Promise<{ number: CheckpointNumber } | { slot: SlotNumber }> {
    if (typeof param === 'number') {
      return { number: param as CheckpointNumber };
    }
    if (this.isCheckpointTag(param)) {
      const tips = await this.blockSource.getL2Tips();
      switch (param) {
        case 'checkpointed':
          return { number: tips.checkpointed.checkpoint.number };
        case 'proven':
          return { number: tips.proven.checkpoint.number };
        case 'finalized':
          return { number: tips.finalized.checkpoint.number };
      }
    }
    if (typeof param === 'object' && param !== null) {
      if ('number' in param) {
        return { number: param.number };
      }
      if ('slot' in param) {
        return { slot: param.slot };
      }
    }
    throw new BadRequestError(`Invalid CheckpointParameter: ${JSON.stringify(param)}`);
  }

  /** Fetches checkpoint-level L1 and attestation data for use as block response context. */
  async #getCheckpointContext(
    checkpointNumber: CheckpointNumber,
  ): Promise<{ l1?: L1PublishedData; attestations?: CommitteeAttestation[] } | undefined> {
    const checkpoint = await this.blockSource.getCheckpointData({ number: checkpointNumber });
    if (!checkpoint) {
      return undefined;
    }
    return { l1: checkpoint.l1, attestations: checkpoint.attestations };
  }

  public async getBlock<Opts extends BlockIncludeOptions = {}>(
    param: BlockParameter,
    options: Opts = {} as Opts,
  ): Promise<BlockResponse<Opts> | undefined> {
    const query = this.normalizeBlockParameter(param);
    const wantTxs = !!options.includeTransactions;
    const wantContext = !!options.includeL1PublishInfo || !!options.includeAttestations;

    if (wantTxs) {
      const block = await this.blockSource.getBlock(query);
      if (!block) {
        return undefined;
      }
      const ctx = wantContext ? await this.#getCheckpointContext(block.checkpointNumber) : undefined;
      return (await blockResponseFromL2Block(block, options, ctx)) as BlockResponse<Opts>;
    }
    const data = await this.blockSource.getBlockData(query);
    if (!data) {
      return undefined;
    }
    const ctx = wantContext ? await this.#getCheckpointContext(data.checkpointNumber) : undefined;
    return blockResponseFromBlockData(data, options, ctx) as BlockResponse<Opts>;
  }

  public getBlockData(param: BlockParameter): Promise<BlockData | undefined> {
    const query = this.normalizeBlockParameter(param);
    return this.blockSource.getBlockData(query);
  }

  public async getBlocks<Opts extends BlocksIncludeOptions = {}>(
    from: BlockNumber,
    limit: number,
    options: Opts = {} as Opts,
  ): Promise<BlockResponse<Opts>[]> {
    const wantTxs = !!options.includeTransactions;
    const wantContext = !!options.includeL1PublishInfo || !!options.includeAttestations;
    const onlyCheckpointed = !!options.onlyCheckpointed;
    if (wantTxs) {
      const blocks = await this.blockSource.getBlocks({ from, limit, onlyCheckpointed });
      const ctxByCheckpoint = await this.#getCheckpointContextsForBlocks(wantContext ? blocks : []);
      return (await Promise.all(
        blocks.map(block => blockResponseFromL2Block(block, options, ctxByCheckpoint.get(block.checkpointNumber))),
      )) as BlockResponse<Opts>[];
    }
    const dataItems = await this.blockSource.getBlocksData({ from, limit, onlyCheckpointed });
    const ctxByCheckpoint = await this.#getCheckpointContextsForBlocks(wantContext ? dataItems : []);
    return (await Promise.all(
      dataItems.map(data => blockResponseFromBlockData(data, options, ctxByCheckpoint.get(data.checkpointNumber))),
    )) as BlockResponse<Opts>[];
  }

  /** Fetches checkpoint context for a set of blocks, deduplicating shared checkpoints. */
  async #getCheckpointContextsForBlocks(
    blocks: { checkpointNumber: CheckpointNumber }[],
  ): Promise<Map<CheckpointNumber, { l1?: L1PublishedData; attestations?: CommitteeAttestation[] } | undefined>> {
    const unique = Array.from(new Set(blocks.map(b => b.checkpointNumber)));
    const entries = await Promise.all(unique.map(async n => [n, await this.#getCheckpointContext(n)] as const));
    return new Map(entries);
  }

  public async getCheckpoint<Opts extends CheckpointIncludeOptions = {}>(
    param: CheckpointParameter,
    options: Opts = {} as Opts,
  ): Promise<CheckpointResponse<Opts> | undefined> {
    const query = await this.resolveCheckpointParameter(param);

    // Try the confirmed store first.
    const confirmed = options.includeBlocks
      ? await this.blockSource.getCheckpoint(query)
      : await this.blockSource.getCheckpointData(query);
    if (confirmed) {
      return (await (options.includeBlocks
        ? checkpointResponseFromPublishedCheckpoint(confirmed as PublishedCheckpoint, options)
        : checkpointResponseFromCheckpointData(confirmed as CheckpointData, options))) as CheckpointResponse<Opts>;
    }

    // Fall back to the proposed store.
    const proposed = await this.blockSource.getProposedCheckpointData(query);
    if (proposed) {
      if (options.includeAttestations || options.includeL1PublishInfo) {
        throw new BadRequestError(
          `Options includeL1PublishInfo or includeAttestations cannot be satisfied for a proposed checkpoint`,
        );
      }
      const blocks = options.includeBlocks
        ? await this.blockSource.getBlocks({ from: proposed.startBlock, limit: proposed.blockCount })
        : undefined;
      return (await projectProposedToCheckpointResponse(proposed, options, blocks)) as CheckpointResponse<Opts>;
    }

    return undefined;
  }

  public async getCheckpoints<Opts extends CheckpointIncludeOptions = {}>(
    from: CheckpointNumber,
    limit: number,
    options: Opts = {} as Opts,
  ): Promise<CheckpointResponse<Opts>[]> {
    if (options.includeBlocks) {
      const checkpoints = await this.blockSource.getCheckpoints({ from, limit });
      return (await Promise.all(
        checkpoints.map(cp => checkpointResponseFromPublishedCheckpoint(cp, options)),
      )) as CheckpointResponse<Opts>[];
    }
    const datas = await this.blockSource.getCheckpointsData({ from, limit });
    return datas.map(d => checkpointResponseFromCheckpointData(d, options)) as CheckpointResponse<Opts>[];
  }

  /**
   * initializes the Aztec Node, wait for component to sync.
   * @param config - The configuration to be used by the aztec node.
   * @returns - A fully synced Aztec Node for use in development/testing.
   */
  public static async createAndSync(
    inputConfig: AztecNodeConfig,
    deps: {
      telemetry?: TelemetryClient;
      logger?: Logger;
      publisher?: SequencerPublisher;
      dateProvider?: DateProvider;
      p2pClientDeps?: P2PClientDeps;
      proverNodeDeps?: Partial<ProverNodeDeps>;
      slashingProtectionDb?: SlashingProtectionDatabase;
    } = {},
    options: {
      genesis?: GenesisData;
      dontStartSequencer?: boolean;
      dontStartProverNode?: boolean;
    } = {},
  ): Promise<AztecNodeService> {
    const config = { ...inputConfig }; // Copy the config so we dont mutate the input object
    const log = deps.logger ?? createLogger('node');

    // Initialise the bb.js sync WASM singleton here, before any subsystem runs.
    const { BarretenbergSync } = await import('@aztec/bb.js');
    await BarretenbergSync.initSingleton();

    const packageVersion = getPackageVersion();
    const telemetry = deps.telemetry ?? getTelemetryClient();
    const dateProvider = deps.dateProvider ?? new DateProvider();
    const ethereumChain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);

    // Build a key store from file if given or from environment otherwise.
    // We keep the raw KeyStore available so we can merge with prover keys if enableProverNode is set.
    let keyStoreManager: KeystoreManager | undefined;
    const keyStoreProvided = config.keyStoreDirectory !== undefined && config.keyStoreDirectory.length > 0;
    if (keyStoreProvided) {
      const keyStores = loadKeystores(config.keyStoreDirectory!);
      keyStoreManager = new KeystoreManager(mergeKeystores(keyStores));
    } else {
      const rawKeyStores: KeyStore[] = [];
      const validatorKeyStore = createKeyStoreForValidator(config);
      if (validatorKeyStore) {
        rawKeyStores.push(validatorKeyStore);
      }
      if (config.enableProverNode) {
        const proverKeyStore = createKeyStoreForProver(config);
        if (proverKeyStore) {
          rawKeyStores.push(proverKeyStore);
        }
      }
      if (rawKeyStores.length > 0) {
        keyStoreManager = new KeystoreManager(
          rawKeyStores.length === 1 ? rawKeyStores[0] : mergeKeystores(rawKeyStores),
        );
      }
    }

    await keyStoreManager?.validateSigners();

    // If we are a validator, verify our configuration before doing too much more.
    if (!config.disableValidator) {
      if (keyStoreManager === undefined) {
        throw new Error('Failed to create key store, a requirement for running a validator');
      }
      if (!keyStoreProvided && process.env.NODE_ENV !== 'test') {
        log.warn("Keystore created from env: it's recommended to use a file-based key store for production");
      }
      ValidatorClient.validateKeyStoreConfiguration(keyStoreManager, log);
    }

    // validate that the actual chain id matches that specified in configuration
    if (config.l1ChainId !== ethereumChain.chainInfo.id) {
      throw new Error(
        `RPC URL configured for chain id ${ethereumChain.chainInfo.id} but expected id ${config.l1ChainId}`,
      );
    }

    const publicClient = createPublicClient({
      chain: ethereumChain.chainInfo,
      transport: makeL1HttpTransport(config.l1RpcUrls, { timeout: config.l1HttpTimeoutMS }),
      pollingInterval: config.viemPollingIntervalMS,
    });

    const l1ContractsAddresses = await RegistryContract.collectAddresses(
      publicClient,
      config.registryAddress,
      config.rollupVersion ?? 'canonical',
    );

    Object.assign(config, l1ContractsAddresses);

    const rollupContract = new RollupContract(publicClient, config.rollupAddress.toString());
    const [l1GenesisTime, slotDuration, epochDuration, rollupVersionFromRollup, rollupManaLimit] = await Promise.all([
      rollupContract.getL1GenesisTime(),
      rollupContract.getSlotDuration(),
      rollupContract.getEpochDuration(),
      rollupContract.getVersion(),
      rollupContract.getManaLimit().then(Number),
    ] as const);

    config.rollupVersion ??= Number(rollupVersionFromRollup);

    if (config.rollupVersion !== Number(rollupVersionFromRollup)) {
      log.warn(
        `Registry looked up and returned a rollup with version (${config.rollupVersion}), but this does not match with version detected from the rollup directly: (${rollupVersionFromRollup}).`,
      );
    }

    const blobClient = await createBlobClientWithFileStores(config, log.createChild('blob-client'));

    // attempt snapshot sync if possible
    await trySnapshotSync(config, log);

    const epochCache = await EpochCache.create(config.rollupAddress, config, { dateProvider });

    // Track started resources so we can clean up on partial failure during node creation.
    const started: { stop?(): Promise<void> | void }[] = [];
    try {
      config.skipOrphanProposedBlockPruning ||= !!config.useAutomineSequencer;

      AztecNodeService.checkConfigMatchesRollup(config, {
        slotDuration: Number(slotDuration),
        epochDuration: Number(epochDuration),
      });

      // Create world-state first so we can retrieve the initial header before constructing the archiver.
      const nativeWs = await createWorldState(config, options.genesis);
      const initialHeader = nativeWs.getInitialHeader();
      const initialBlockHash = await initialHeader.hash();
      const archiver = await createArchiver(
        config,
        { blobClient, epochCache, telemetry, dateProvider },
        { blockUntilSync: !config.skipArchiverInitialSync },
        initialHeader,
        initialBlockHash,
      );
      started.push(archiver);

      // The synchronizer takes ownership of the native world-state from here
      const worldStateSynchronizer = await createWorldStateSynchronizer(config, archiver, nativeWs, telemetry);
      started.push(worldStateSynchronizer);
      const useRealVerifiers = config.realProofs || config.debugForceTxProofVerification;
      let peerProofVerifier: ClientProtocolCircuitVerifier;
      let rpcProofVerifier: ClientProtocolCircuitVerifier;
      if (useRealVerifiers) {
        peerProofVerifier = await BatchChonkVerifier.new(config, config.bbChonkVerifyMaxBatch, 'peer');
        const rpcVerifier = await BBCircuitVerifier.new(config);
        rpcProofVerifier = new QueuedIVCVerifier(rpcVerifier, config.numConcurrentIVCVerifiers);
      } else {
        peerProofVerifier = new TestCircuitVerifier(config.proverTestVerificationDelayMs);
        rpcProofVerifier = new TestCircuitVerifier(config.proverTestVerificationDelayMs);
      }
      started.push(peerProofVerifier, rpcProofVerifier);

      let debugLogStore: DebugLogStore;
      if (!config.realProofs) {
        log.warn(`Aztec node is accepting fake proofs`);

        debugLogStore = new InMemoryDebugLogStore();
        log.info(
          'Aztec node started in test mode (realProofs set to false) hence debug logs from public functions will be collected and served',
        );
      } else {
        debugLogStore = new NullDebugLogStore();
      }

      const globalVariableBuilderConfig = {
        rollupAddress: config.rollupAddress,
        ethereumSlotDuration: config.ethereumSlotDuration,
        rollupVersion: BigInt(config.rollupVersion),
        l1GenesisTime,
        slotDuration: Number(slotDuration),
      };

      const globalVariableBuilder = new GlobalVariableBuilder(publicClient, globalVariableBuilderConfig);
      const feeProvider = new FeeProviderImpl(dateProvider, publicClient, globalVariableBuilderConfig);

      const proverOnly = config.enableProverNode && config.disableValidator;
      if (proverOnly) {
        log.info('Starting in prover-only mode: skipping validator, sequencer, sentinel, and slasher subsystems');
      }

      // create the tx pool and the p2p client, which will need the l2 block source
      const p2pClient = await createP2PClient(
        config,
        archiver,
        peerProofVerifier,
        worldStateSynchronizer,
        epochCache,
        feeProvider,
        packageVersion,
        dateProvider,
        telemetry,
        deps.p2pClientDeps,
        initialBlockHash,
      );
      started.push(p2pClient);
      archiver.setCheckpointProposalPresence(p2pClient);

      // We'll accumulate sentinel watchers here
      const watchers: Watcher[] = [];

      // Create FullNodeCheckpointsBuilder for block proposal handling and tx validation.
      // Override maxTxsPerCheckpoint with the validator-specific limit if set.
      const validatorCheckpointsBuilder = new FullNodeCheckpointsBuilder(
        {
          ...config,
          l1GenesisTime,
          slotDuration: Number(slotDuration),
          rollupManaLimit,
          maxTxsPerCheckpoint: config.validateMaxTxsPerCheckpoint,
        },
        worldStateSynchronizer,
        archiver,
        dateProvider,
        telemetry,
      );

      let validatorClient: ValidatorClient | undefined;

      // Tracks successful checkpoint re-execution by a checkpoint proposal handler.
      const reexecutionTracker = new CheckpointReexecutionTracker();

      if (!config.disableValidator) {
        // Create validator client if required
        validatorClient = await createValidatorClient(config, {
          checkpointsBuilder: validatorCheckpointsBuilder,
          worldState: worldStateSynchronizer,
          p2pClient,
          telemetry,
          dateProvider,
          epochCache,
          blockSource: archiver,
          l1ToL2MessageSource: archiver,
          keyStoreManager,
          blobClient,
          reexecutionTracker,
          slashingProtectionDb: deps.slashingProtectionDb,
        });

        // If we have a validator client, register it as a source of offenses for the slasher,
        // and have it register callbacks on the p2p client *before* we start it, otherwise messages
        // like attestations or auths will fail.
        if (validatorClient) {
          watchers.push(validatorClient);

          const vc = validatorClient;
          const getValidatorAddresses = () => vc.getValidatorAddresses().map(a => a.toString());
          validatorClient.getProposalHandler().register(p2pClient, true, archiver, getValidatorAddresses);

          if (!options.dontStartSequencer) {
            await validatorClient.registerHandlers();
          }
        }
      }

      // If there's no validator client, create a ProposalHandler to handle block and checkpoint proposals
      // for monitoring or reexecution. Reexecution (default) allows us to follow the pending chain,
      // while non-reexecution is used for validating the proposals and collecting their txs.
      // Checkpoint proposals rebuild blobs if the blob client can upload blobs.
      if (!validatorClient) {
        const reexecute = !!config.alwaysReexecuteBlockProposals;
        log.info(`Setting up proposal handler` + (reexecute ? ' with reexecution of proposals' : ''));
        createProposalHandler(config, {
          checkpointsBuilder: validatorCheckpointsBuilder,
          worldState: worldStateSynchronizer,
          epochCache,
          blockSource: archiver,
          l1ToL2MessageSource: archiver,
          p2pClient,
          blobClient,
          dateProvider,
          telemetry,
          reexecutionTracker,
        }).register(p2pClient, reexecute, archiver);
      }

      // Start world state and wait for it to sync to the archiver.
      await worldStateSynchronizer.start();

      // Start p2p. Note that it depends on world state to be running.
      await p2pClient.start();

      let validatorsSentinel: Awaited<ReturnType<typeof createSentinel>> | undefined;
      let dataWithholdingWatcher: DataWithholdingWatcher | undefined;
      let attestationsBlockWatcher: AttestationsBlockWatcher | undefined;
      let attestedInvalidProposalWatcher: AttestedInvalidProposalWatcher | undefined;
      let broadcastedInvalidCheckpointProposalWatcher: BroadcastedInvalidCheckpointProposalWatcher | undefined;
      let checkpointEquivocationWatcher: CheckpointEquivocationWatcher | undefined;

      if (!proverOnly) {
        validatorsSentinel = await createSentinel(epochCache, archiver, p2pClient, reexecutionTracker, config);
        if (validatorsSentinel) {
          watchers.push(validatorsSentinel);
        }

        dataWithholdingWatcher = new DataWithholdingWatcher(
          epochCache,
          archiver,
          p2pClient.getTxProvider(),
          p2pClient,
          reexecutionTracker,
          { chainId: config.l1ChainId, rollupAddress: config.rollupAddress },
          config,
        );
        watchers.push(dataWithholdingWatcher);

        broadcastedInvalidCheckpointProposalWatcher = new BroadcastedInvalidCheckpointProposalWatcher(
          p2pClient,
          archiver,
          epochCache,
          config,
        );
        watchers.push(broadcastedInvalidCheckpointProposalWatcher);

        if (validatorClient) {
          attestedInvalidProposalWatcher = new AttestedInvalidProposalWatcher(
            p2pClient,
            validatorClient,
            archiver,
            epochCache,
            config,
            { log: log.createChild('attested-invalid-proposal-watcher') },
          );
          watchers.push(attestedInvalidProposalWatcher);
        }

        checkpointEquivocationWatcher = new CheckpointEquivocationWatcher(archiver, epochCache, config);
        watchers.push(checkpointEquivocationWatcher);

        attestationsBlockWatcher = new AttestationsBlockWatcher(archiver, epochCache, config, log.getBindings());
        watchers.push(attestationsBlockWatcher);
      }

      const watchersToStart = compactArray([
        validatorsSentinel,
        dataWithholdingWatcher,
        attestationsBlockWatcher,
        broadcastedInvalidCheckpointProposalWatcher,
        attestedInvalidProposalWatcher,
        checkpointEquivocationWatcher,
      ]);
      const startedWatchers: Watcher[] = [];
      const stopStartedWatchers = async () => {
        for (const watcher of startedWatchers) {
          await tryStop(watcher);
        }
      };

      // Start p2p-related services once the archiver has completed sync
      void archiver
        .waitForInitialSync()
        .then(async () => {
          for (const watcher of watchersToStart) {
            await watcher.start();
            startedWatchers.push(watcher);
          }
          log.info(`All p2p services started`);
        })
        .catch(err => log.error('Failed to start p2p services after archiver sync', err));
      started.push({ stop: stopStartedWatchers });

      // Validator enabled, create/start relevant service
      let sequencer: SequencerClient | undefined;
      let automineSequencer: AutomineSequencer | undefined;
      let slasherClient: SlasherClientInterface | undefined;
      if (!config.disableValidator && validatorClient) {
        // We create a slasher only if we have a sequencer, since all slashing actions go through the sequencer publisher
        // as they are executed when the node is selected as proposer.
        const validatorAddresses = keyStoreManager
          ? NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager).getAddresses()
          : [];

        slasherClient = await createSlasher(
          config,
          pickL1ContractAddresses(config),
          getPublicClient(config),
          watchers,
          dateProvider,
          epochCache,
          validatorAddresses,
          undefined, // logger
        );
        await slasherClient.start();
        started.push(slasherClient);

        const l1TxUtils = config.sequencerPublisherForwarderAddress
          ? await createForwarderL1TxUtilsFromSigners(
              publicClient,
              keyStoreManager!.createAllValidatorPublisherSigners(),
              config.sequencerPublisherForwarderAddress,
              { ...config, scope: 'sequencer' },
              { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider, kzg: Blob.getViemKzgInstance() },
            )
          : await createL1TxUtilsFromSigners(
              publicClient,
              keyStoreManager!.createAllValidatorPublisherSigners(),
              { ...config, scope: 'sequencer' },
              { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider, kzg: Blob.getViemKzgInstance() },
            );

        // Create a funder L1TxUtils from the keystore funding account (if configured)
        const fundingSigner = keyStoreManager?.createFundingSigner();
        let funderL1TxUtils: L1TxUtils | undefined;
        if (fundingSigner) {
          const [funder] = await createL1TxUtilsFromSigners(
            publicClient,
            [fundingSigner],
            { ...config, scope: 'sequencer' },
            { telemetry, logger: log.createChild('l1-tx-utils:funder'), dateProvider },
          );
          funderL1TxUtils = funder;
        }

        // Create and start the sequencer client
        const checkpointsBuilder = new CheckpointsBuilder(
          { ...config, l1GenesisTime, slotDuration: Number(slotDuration), rollupManaLimit },
          worldStateSynchronizer,
          archiver,
          dateProvider,
          telemetry,
          debugLogStore,
        );

        if (config.useAutomineSequencer) {
          // Test-only path: deterministic, queue-driven sequencer for non-block-building e2e tests.
          // See `AUTOMINE_E2E_OPTS` in `end-to-end/src/fixtures/fixtures.ts`.
          automineSequencer = await createAutomineSequencer({
            config,
            l1TxUtils,
            funderL1TxUtils,
            publicClient,
            rollupContract,
            epochCache,
            blobClient,
            telemetry,
            dateProvider,
            keyStoreManager: keyStoreManager!,
            validatorClient,
            checkpointsBuilder,
            globalVariableBuilder,
            worldStateSynchronizer,
            archiver,
            p2pClient,
            l1Constants: {
              l1GenesisTime,
              slotDuration: Number(slotDuration),
              ethereumSlotDuration: config.ethereumSlotDuration,
              rollupManaLimit,
            },
            autoSettle: config.automineEnableProveEpoch,
            log,
          });
        } else {
          sequencer = await SequencerClient.new(config, {
            ...deps,
            epochCache,
            l1TxUtils,
            funderL1TxUtils,
            validatorClient,
            p2pClient,
            worldStateSynchronizer,
            slasherClient,
            checkpointsBuilder,
            l2BlockSource: archiver,
            l1ToL2MessageSource: archiver,
            telemetry,
            dateProvider,
            blobClient,
            nodeKeyStore: keyStoreManager!,
            globalVariableBuilder,
          });
        }
      }

      if (!options.dontStartSequencer && sequencer) {
        await sequencer.start();
        started.push(sequencer);
        log.verbose(`Sequencer started`);
      } else if (sequencer) {
        log.warn(`Sequencer created but not started`);
      }

      if (!options.dontStartSequencer && automineSequencer) {
        await automineSequencer.start();
        started.push({ stop: () => automineSequencer!.stop() });
        log.verbose(`AutomineSequencer started`);
      } else if (automineSequencer) {
        log.warn(`AutomineSequencer created but not started`);
      }

      // Create prover node subsystem if enabled
      let proverNode: ProverNode | undefined;
      if (config.enableProverNode) {
        proverNode = await createProverNode(config, {
          ...deps.proverNodeDeps,
          telemetry,
          dateProvider,
          archiver,
          worldStateSynchronizer,
          p2pClient,
          epochCache,
          blobClient,
          keyStoreManager,
        });

        if (!options.dontStartProverNode) {
          await proverNode.start();
          started.push(proverNode);
          log.info(`Prover node subsystem started`);
        } else {
          log.info(`Prover node subsystem created but not started`);
        }
      }

      const node = new AztecNodeService(
        config,
        p2pClient,
        archiver,
        archiver,
        archiver,
        archiver,
        worldStateSynchronizer,
        sequencer,
        proverNode,
        slasherClient,
        validatorsSentinel,
        stopStartedWatchers,
        ethereumChain.chainInfo.id,
        config.rollupVersion,
        globalVariableBuilder,
        rollupContract,
        feeProvider,
        epochCache,
        packageVersion,
        peerProofVerifier,
        rpcProofVerifier,
        telemetry,
        log,
        blobClient,
        validatorClient,
        keyStoreManager,
        debugLogStore,
        automineSequencer,
      );

      return node;
    } catch (err) {
      log.error('Failed during node creation, stopping started resources', err);
      for (const resource of started.reverse()) {
        await tryStop(resource);
      }
      throw err;
    }
  }

  /**
   * Verifies the node's configured L1 timing matches the rollup contract it is pointed at, for the fields the
   * node's own config carries. Each comparison is guarded against an undefined config value, so a config that
   * does not carry a field is not checked. Throws a single error listing every mismatch. Runs in the shared
   * startup path for every node role.
   */
  private static checkConfigMatchesRollup(
    config: AztecNodeConfig,
    rollup: { slotDuration: number; epochDuration: number },
  ): void {
    const mismatches: string[] = [];
    if (config.aztecSlotDuration !== undefined && config.aztecSlotDuration !== rollup.slotDuration) {
      mismatches.push(`aztecSlotDuration is ${config.aztecSlotDuration} but the rollup reports ${rollup.slotDuration}`);
    }
    if (config.aztecEpochDuration !== undefined && config.aztecEpochDuration !== rollup.epochDuration) {
      mismatches.push(
        `aztecEpochDuration is ${config.aztecEpochDuration} but the rollup reports ${rollup.epochDuration}`,
      );
    }
    if (mismatches.length > 0) {
      throw new Error(
        `The node's configured L1 timing does not match the rollup contract it is pointed at: ${mismatches.join('; ')}`,
      );
    }
  }

  /**
   * Returns the sequencer client instance.
   * @returns The sequencer client instance.
   */
  public getSequencer(): SequencerClient | undefined {
    return this.sequencer;
  }

  /** Test-only: returns the AutomineSequencer when wired via `useAutomineSequencer`. */
  public getAutomineSequencer(): AutomineSequencer | undefined {
    return this.automineSequencer;
  }

  /** Returns the prover node subsystem, if enabled. */
  public getProverNode(): ProverNode | undefined {
    return this.proverNode;
  }

  public getBlockSource(): L2BlockSource {
    return this.blockSource;
  }

  public getContractDataSource(): ContractDataSource {
    return this.contractDataSource;
  }

  public getP2P(): P2P {
    return this.p2pClient;
  }

  /**
   * Method to return the currently deployed L1 contract addresses.
   * @returns - The currently deployed L1 contract addresses.
   */
  public getL1ContractAddresses(): Promise<L1ContractAddresses> {
    return Promise.resolve(pickL1ContractAddresses(this.config));
  }

  public getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve(this.p2pClient.getEnr()?.encodeTxt());
  }

  public async getAllowedPublicSetup(): Promise<AllowedElement[]> {
    return [...(await getDefaultAllowedSetupFunctions()), ...(this.config.txPublicSetupAllowListExtend ?? [])];
  }

  /**
   * Method to determine if the node is ready to accept transactions.
   * @returns - Flag indicating the readiness for tx submission.
   */
  public isReady() {
    return Promise.resolve(this.p2pClient.isReady() ?? false);
  }

  public async getNodeInfo(): Promise<NodeInfo> {
    const [nodeVersion, rollupVersion, chainId, enr, contractAddresses, protocolContractAddresses, l1Constants] =
      await Promise.all([
        this.getNodeVersion(),
        this.getVersion(),
        this.getChainId(),
        this.getEncodedEnr(),
        this.getL1ContractAddresses(),
        this.getProtocolContractAddresses(),
        this.blockSource.getL1Constants(),
      ]);

    // Gas limits a single tx may declare on this network, derived from network-wide constants only (the
    // timetable's blocks-per-checkpoint and the network-minimum per-block multipliers) — never this node's
    // local caps or configured multipliers, which can make the node stricter at block-building time but
    // cannot define what the network accepts for relay. Clients read txsLimits to set fallback gas limits.
    const maxTxGas = getNetworkTxGasLimits(this.config, l1Constants);

    const nodeInfo: NodeInfo = {
      nodeVersion,
      l1ChainId: chainId,
      rollupVersion,
      enr,
      l1ContractAddresses: contractAddresses,
      protocolContractAddresses: protocolContractAddresses,
      realProofs: !!this.config.realProofs,
      txsLimits: { gas: { daGas: maxTxGas.daGas, l2Gas: maxTxGas.l2Gas } },
    };

    return nodeInfo;
  }

  public async getCurrentMinFees(): Promise<GasFees> {
    return await this.feeProvider.getCurrentMinFees();
  }

  /** Returns predicted min fees for the current slot and next N slots. */
  public async getPredictedMinFees(manaUsage?: ManaUsageEstimate): Promise<GasFees[]> {
    return await this.feeProvider.getPredictedMinFees(manaUsage);
  }

  public async getMaxPriorityFees(): Promise<GasFees> {
    for await (const tx of this.p2pClient.iteratePendingTxs({ includeProof: false })) {
      return tx.getGasSettings().maxPriorityFeesPerGas;
    }

    return GasFees.from({ feePerDaGas: 0n, feePerL2Gas: 0n });
  }

  /**
   * Method to fetch the version of the package.
   * @returns The node package version
   */
  public getNodeVersion(): Promise<string> {
    return Promise.resolve(this.packageVersion);
  }

  /**
   * Method to fetch the version of the rollup the node is connected to.
   * @returns The rollup version.
   */
  public getVersion(): Promise<number> {
    return Promise.resolve(this.version);
  }

  /**
   * Method to fetch the chain id of the base-layer for the rollup.
   * @returns The chain id.
   */
  public getChainId(): Promise<number> {
    return Promise.resolve(this.l1ChainId);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.contractDataSource.getContractClass(id);
  }

  public getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.contractDataSource.getContract(address);
  }

  public getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]> {
    return this.logsSource.getPrivateLogsByTags(query);
  }

  public getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]> {
    return this.logsSource.getPublicLogsByTags(query);
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   */
  public async sendTx(tx: Tx) {
    await this.#sendTx(tx);
  }

  async #sendTx(tx: Tx) {
    const timer = new Timer();
    const txHash = tx.getTxHash().toString();

    const valid = await this.isValidTx(tx);
    if (valid.result !== 'valid') {
      const reason = valid.reason.join(', ');
      this.metrics.receivedTx(timer.ms(), false);
      this.log.warn(`Received invalid tx ${txHash}: ${reason}`, { txHash });
      throw new Error(`Invalid tx: ${reason}`);
    }

    try {
      await this.p2pClient!.sendTx(tx);
    } catch (err) {
      this.metrics.receivedTx(timer.ms(), false);
      this.log.warn(`Mempool rejected tx ${txHash}: ${(err as Error).message}`, { txHash });
      throw err;
    }
    const duration = timer.ms();
    this.metrics.receivedTx(duration, true);
    this.log.info(`Received tx ${txHash} in ${duration}ms`, { txHash });
  }

  public async getTxReceipt<TGetTxReceiptOptions extends GetTxReceiptOptions = {}>(
    txHash: TxHash,
    options?: TGetTxReceiptOptions,
  ): Promise<TxReceipt<TGetTxReceiptOptions>> {
    // Check the tx pool status first. If the tx is known to the pool (pending or mined), we'll use that
    // as a fallback if we don't find a mined tx effect in the archiver.
    const txPoolStatus = await this.p2pClient.getTxStatus(txHash);
    const isKnownToPool = txPoolStatus === 'pending' || txPoolStatus === 'mined';

    // Then get the raw tx effect from the archiver, which tracks every tx in a mined block.
    const indexed = await this.blockSource.getTxEffect(txHash);

    let receipt: TxReceipt;
    if (indexed) {
      receipt = await this.#assembleMinedReceipt(indexed, options);
    } else if (isKnownToPool) {
      // If the tx is in the pool but not in the archiver, it's pending.
      // This handles race conditions between archiver and p2p, where the archiver
      // has pruned the block in which a tx was mined, but p2p has not caught up yet.
      let tx: Tx | undefined;
      if (options?.includePendingTx) {
        // The tx may have left the pool since we checked its status (mined or dropped); in that case we
        // leave `tx` unset and still return a pending receipt.
        tx = await this.p2pClient.getTxByHashFromPool(txHash, { includeProof: !!options.includeProof });
      }
      receipt = new PendingTxReceipt(txHash, tx);
    } else {
      // Otherwise, if we don't know the tx, we consider it dropped.
      receipt = new DroppedTxReceipt(txHash, 'Tx dropped by P2P node');
    }

    this.debugLogStore.decorateReceiptWithLogs(txHash.toString(), receipt);

    return receipt;
  }

  /**
   * Assembles a {@link MinedTxReceipt} from a raw {@link IndexedTxEffect}, deriving the finalization status from the
   * cached L2 tips and the epoch from the block's slot number.
   */
  async #assembleMinedReceipt(indexed: IndexedTxEffect, options?: GetTxReceiptOptions): Promise<MinedTxReceipt> {
    const blockNumber = indexed.l2BlockNumber;
    const [tips, l1Constants] = await Promise.all([this.blockSource.getL2Tips(), this.blockSource.getL1Constants()]);

    const status = this.#deriveMinedStatus(blockNumber, tips);
    const epochNumber = getEpochAtSlot(indexed.slotNumber, l1Constants);

    return new MinedTxReceipt(
      indexed.data.txHash,
      status,
      MinedTxReceipt.executionResultFromRevertCode(indexed.data.revertCode),
      indexed.data.transactionFee.toBigInt(),
      indexed.l2BlockHash,
      blockNumber,
      indexed.slotNumber,
      indexed.txIndexInBlock,
      epochNumber,
      options?.includeTxEffect ? indexed.data : undefined,
      /*debugLogs=*/ undefined,
    );
  }

  #deriveMinedStatus(blockNumber: BlockNumber, tips: L2Tips): MinedTxStatus {
    if (blockNumber <= tips.finalized.block.number) {
      return TxStatus.FINALIZED;
    } else if (blockNumber <= tips.proven.block.number) {
      return TxStatus.PROVEN;
    } else if (blockNumber <= tips.checkpointed.block.number) {
      return TxStatus.CHECKPOINTED;
    } else {
      return TxStatus.PROPOSED;
    }
  }

  public getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.blockSource.getTxEffect(txHash);
  }

  /**
   * Method to stop the aztec node.
   */
  public async stop() {
    this.log.info(`Stopping Aztec Node`);
    await this.stopStartedWatchers();
    await tryStop(this.slasherClient);
    await Promise.all([tryStop(this.peerProofVerifier), tryStop(this.rpcProofVerifier)]);
    await tryStop(this.sequencer);
    await tryStop(this.automineSequencer);
    await tryStop(this.proverNode);
    await tryStop(this.p2pClient);
    await tryStop(this.worldStateSynchronizer);
    await tryStop(this.blockSource);
    await tryStop(this.blobClient);
    await tryStop(this.telemetry);
    this.log.info(`Stopped Aztec Node`);
  }

  /**
   * Returns the blob client used by this node.
   * @internal - Exposed for testing purposes only.
   */
  public getBlobClient(): BlobClientInterface | undefined {
    return this.blobClient;
  }

  /**
   * Method to retrieve pending txs.
   * @param limit - The number of items to returns
   * @param after - The last known pending tx. Used for pagination
   * @returns - The pending txs.
   */
  public getPendingTxs(limit?: number, after?: TxHash, options?: GetTxByHashOptions): Promise<Tx[]> {
    return this.p2pClient!.getPendingTxs(limit, after, options);
  }

  public getPendingTxCount(): Promise<number> {
    return this.p2pClient!.getPendingTxCount();
  }

  public getPeers(includePending?: boolean): Promise<PeerInfo[]> {
    return this.p2pClient!.getPeers(includePending);
  }

  public getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    return this.p2pClient!.getCheckpointAttestationsForSlot(slot, proposalPayloadHash);
  }

  public getProposalsForSlot(slot: SlotNumber): Promise<ProposalsForSlot> {
    return this.p2pClient!.getProposalsForSlot(slot);
  }

  /**
   * Method to retrieve a single tx from the mempool or unfinalized chain. The tx's proof is only loaded and returned
   * when `includeProof` is set.
   * @param txHash - The transaction hash to return.
   * @param options - Options for the returned tx (eg whether to include its proof).
   * @returns - The tx if it exists.
   */
  public getTxByHash(txHash: TxHash, options?: GetTxByHashOptions): Promise<Tx | undefined> {
    return this.p2pClient!.getTxByHashFromPool(txHash, { includeProof: !!options?.includeProof });
  }

  /**
   * Method to retrieve txs from the mempool or unfinalized chain. The txs' proofs are only loaded and returned when
   * `includeProof` is set.
   * @param txHash - The transaction hash to return.
   * @param options - Options for the returned txs (eg whether to include their proofs).
   * @returns - The txs if it exists.
   */
  public async getTxsByHash(txHashes: TxHash[], options?: GetTxByHashOptions): Promise<Tx[]> {
    const txs = await this.p2pClient!.getTxsByHashFromPool(txHashes, { includeProof: !!options?.includeProof });
    return compactArray(txs);
  }

  public async findLeavesIndexes(
    referenceBlock: BlockParameter,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(DataInBlock<bigint> | undefined)[]> {
    const committedDb = await this.getWorldState(referenceBlock);
    const maybeIndices = await committedDb.findLeafIndices(
      treeId,
      leafValues.map(x => x.toBuffer()),
    );
    // Filter out undefined values to query block numbers only for found leaves
    const definedIndices = maybeIndices.filter(x => x !== undefined);

    // Now we find the block numbers for the defined indices
    const blockNumbers = await committedDb.getBlockNumbersForLeafIndices(treeId, definedIndices);

    // Build a map from leaf index to block number
    const indexToBlockNumber = new Map<bigint, BlockNumber>();
    for (let i = 0; i < definedIndices.length; i++) {
      const blockNumber = blockNumbers[i];
      if (blockNumber === undefined) {
        throw new Error(
          `Block number is undefined for leaf index ${definedIndices[i]} in tree ${MerkleTreeId[treeId]}`,
        );
      }
      indexToBlockNumber.set(definedIndices[i], blockNumber);
    }

    // Get unique block numbers in order to optimize num calls to getLeafValue function.
    const uniqueBlockNumbers = [...new Set(indexToBlockNumber.values())];

    // Now we obtain the block hashes from the archive tree (block number = leaf index in archive tree).
    const blockHashes = await Promise.all(
      uniqueBlockNumbers.map(blockNumber => {
        return committedDb.getLeafValue(MerkleTreeId.ARCHIVE, BigInt(blockNumber));
      }),
    );

    // Build a map from block number to block hash
    const blockNumberToHash = new Map<BlockNumber, BlockHash>();
    for (let i = 0; i < uniqueBlockNumbers.length; i++) {
      const blockHash = blockHashes[i];
      if (blockHash === undefined) {
        throw new Error(`Block hash is undefined for block number ${uniqueBlockNumbers[i]}`);
      }
      blockNumberToHash.set(uniqueBlockNumbers[i], blockHash);
    }

    // Create DataInBlock objects by combining indices, blockNumbers and blockHashes and return them.
    return maybeIndices.map(index => {
      if (index === undefined) {
        return undefined;
      }
      const blockNumber = indexToBlockNumber.get(index);
      if (blockNumber === undefined) {
        throw new Error(`Block number not found for leaf index ${index} in tree ${MerkleTreeId[treeId]}`);
      }
      const l2BlockHash = blockNumberToHash.get(blockNumber);
      if (l2BlockHash === undefined) {
        throw new Error(`Block hash not found for block number ${blockNumber}`);
      }
      return {
        l2BlockNumber: blockNumber,
        l2BlockHash,
        data: index,
      };
    });
  }

  public async getBlockHashMembershipWitness(
    referenceBlock: BlockParameter,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    // The Noir circuit checks the archive membership proof against `anchor_block_header.last_archive.root`,
    // which is the archive tree root BEFORE the anchor block was added (i.e. the state after block N-1).
    // So we need the world state at block N-1, not block N, to produce a sibling path matching that root.
    const referenceBlockNumber = await this.resolveBlockNumber(referenceBlock);
    if (referenceBlockNumber === BlockNumber.ZERO) {
      // Block 0 (the initial block) has an empty archive, so no membership witness can exist.
      return undefined;
    }
    const committedDb = await this.getWorldState(BlockNumber(referenceBlockNumber - 1));
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.ARCHIVE>(MerkleTreeId.ARCHIVE, [blockHash]);
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public async getNoteHashMembershipWitness(
    referenceBlock: BlockParameter,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.NOTE_HASH_TREE>(
      MerkleTreeId.NOTE_HASH_TREE,
      [noteHash],
    );
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public async getL1ToL2MessageMembershipWitness(
    referenceBlock: BlockParameter,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    const db = await this.getWorldState(referenceBlock);
    const [witness] = await db.findSiblingPaths(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, [l1ToL2Message]);
    if (!witness) {
      return undefined;
    }

    // REFACTOR: Return a MembershipWitness object
    return [witness.index, witness.path];
  }

  public async getL1ToL2MessageCheckpoint(l1ToL2Message: Fr): Promise<CheckpointNumber | undefined> {
    const messageIndex = await this.l1ToL2MessageSource.getL1ToL2MessageIndex(l1ToL2Message);
    return messageIndex !== undefined ? InboxLeaf.checkpointNumberFromIndex(messageIndex) : undefined;
  }

  /**
   * Returns all the L2 to L1 messages in an epoch.
   *
   * @deprecated Use {@link getL2ToL1MembershipWitness} to get an L2-to-L1 message witness directly.
   *
   * @param epoch - The epoch at which to get the data.
   * @returns The L2 to L1 messages (empty array if the epoch is not found).
   */
  public async getL2ToL1Messages(epoch: EpochNumber): Promise<Fr[][][][]> {
    const blocks = await this.blockSource.getBlocks({ epoch, onlyCheckpointed: true });
    const blocksInCheckpoints = chunkBy(blocks, block => block.header.globalVariables.slotNumber);
    return blocksInCheckpoints.map(slotBlocks =>
      slotBlocks.map(block => block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs)),
    );
  }

  /**
   * Returns the L2-to-L1 membership witness for a message in `txHash`. Passthrough to the
   * archiver's locally-cached resolver — see {@link Archiver.getL2ToL1MembershipWitness}.
   */
  public getL2ToL1MembershipWitness(
    txHash: TxHash,
    message: Fr,
    messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined> {
    return this.blockSource.getL2ToL1MembershipWitness(txHash, message, messageIndexInTx);
  }

  public async getNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const db = await this.getWorldState(referenceBlock);
    const [witness] = await db.findSiblingPaths(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]);
    if (!witness) {
      return undefined;
    }

    const { index, path } = witness;
    const leafPreimage = await db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index);
    if (!leafPreimage) {
      return undefined;
    }

    return new NullifierMembershipWitness(index, leafPreimage as NullifierLeafPreimage, path);
  }

  public async getLowNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const findResult = await committedDb.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!findResult) {
      return undefined;
    }
    const { index, alreadyPresent } = findResult;
    if (alreadyPresent) {
      throw new Error(
        `Cannot prove nullifier non-inclusion: nullifier ${nullifier.toBigInt()} already exists in the tree`,
      );
    }
    const preimageData = (await committedDb.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index))!;

    const siblingPath = await committedDb.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, BigInt(index));
    return new NullifierMembershipWitness(BigInt(index), preimageData as NullifierLeafPreimage, siblingPath);
  }

  async getPublicDataWitness(referenceBlock: BlockParameter, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult) {
      return undefined;
    } else {
      const preimage = (await committedDb.getLeafPreimage(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      )) as PublicDataTreeLeafPreimage;
      const path = await committedDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
      return new PublicDataWitness(lowLeafResult.index, preimage, path);
    }
  }

  public async getPublicStorageAt(referenceBlock: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr> {
    const committedDb = await this.getWorldState(referenceBlock);
    const leafSlot = await computePublicDataTreeLeafSlot(contract, slot);

    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }
    const preimage = (await committedDb.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;
    return preimage.leaf.value;
  }

  /**
   * Simulates the public part of a transaction with the current state.
   * @param tx - The transaction to simulate.
   * @param skipFeeEnforcement - If true, fee enforcement is skipped.
   * @param overrides - Optional pre-simulation overrides applied to the ephemeral fork and contract DB.
   **/
  @trackSpan('AztecNodeService.simulatePublicCalls', (tx: Tx) => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
  }))
  public simulatePublicCalls(
    tx: Tx,
    skipFeeEnforcement = false,
    overrides?: SimulationOverrides,
  ): Promise<PublicSimulationOutput> {
    return this.nodePublicCallsSimulator.simulate(tx, skipFeeEnforcement, overrides);
  }

  public async isValidTx(
    tx: Tx,
    { isSimulation, skipFeeEnforcement }: { isSimulation?: boolean; skipFeeEnforcement?: boolean } = {},
  ): Promise<TxValidationResult> {
    const db = this.worldStateSynchronizer.getCommitted();
    const verifier = isSimulation ? undefined : this.rpcProofVerifier;

    // We accept transactions if they are not expired by the next slot (checked based on the ExpirationTimestamp field)
    const { ts: nextSlotTimestamp } = this.epochCache.getEpochAndSlotInNextL1Slot();
    const blockNumber = BlockNumber((await this.blockSource.getBlockNumber()) + 1);
    const l1Constants = await this.blockSource.getL1Constants();
    // Enforce the same network admission limit the node advertises in getNodeInfo (network-wide, not this
    // node's local caps), so a tx the wallet sized against txsLimits is not rejected here.
    const networkTxGasLimits = getNetworkTxGasLimits(this.config, l1Constants);
    const validator = createTxValidatorForAcceptingTxsOverRPC(
      db,
      this.contractDataSource,
      verifier,
      {
        timestamp: nextSlotTimestamp,
        blockNumber,
        l1ChainId: this.l1ChainId,
        rollupVersion: this.version,
        setupAllowList: [
          ...(await getDefaultAllowedSetupFunctions()),
          ...(this.config.txPublicSetupAllowListExtend ?? []),
        ],
        gasFees: await this.getCurrentMinFees(),
        skipFeeEnforcement,
        isSimulation,
        txsPermitted: !this.config.disableTransactions,
        maxTxL2Gas: networkTxGasLimits.l2Gas,
        maxTxDAGas: networkTxGasLimits.daGas,
      },
      this.log.getBindings(),
    );

    return await validator.validateTx(tx);
  }

  public getConfig(): Promise<AztecNodeAdminConfig> {
    const schema = AztecNodeAdminConfigSchema;
    const keys = schema.keyof().options;
    return Promise.resolve(pick(this.config, ...keys));
  }

  public async setConfig(config: Partial<AztecNodeAdminConfig>): Promise<void> {
    const newConfig = { ...this.config, ...config };
    // If the sequencer is currently paused via pauseSequencer(), record the caller's desired
    // minTxsPerBlock as the restore value (so resumeSequencer applies it) and keep the freeze
    // (MAX_SAFE_INTEGER) applied to the underlying sequencer. Without this guard, forwarding
    // the new minTxsPerBlock to the sequencer would silently unpause block production while
    // pauseSequencer() still considers it paused.
    const sequencerUpdate = { ...config };
    if (this.sequencerPausedMinTxsPerBlock !== undefined && sequencerUpdate.minTxsPerBlock !== undefined) {
      this.sequencerPausedMinTxsPerBlock = sequencerUpdate.minTxsPerBlock;
      delete sequencerUpdate.minTxsPerBlock;
    }
    this.sequencer?.updateConfig(sequencerUpdate);
    this.automineSequencer?.updateConfig(sequencerUpdate);
    this.slasherClient?.updateConfig(config);
    this.validatorsSentinel?.updateConfig(config);
    await this.p2pClient.updateP2PConfig(config);
    const archiver = this.blockSource as Archiver;
    if ('updateConfig' in archiver) {
      archiver.updateConfig(config);
    }
    if (newConfig.realProofs !== this.config.realProofs) {
      await Promise.all([tryStop(this.peerProofVerifier), tryStop(this.rpcProofVerifier)]);
      if (newConfig.realProofs) {
        this.peerProofVerifier = await BatchChonkVerifier.new(newConfig, newConfig.bbChonkVerifyMaxBatch, 'peer');
        const rpcVerifier = await BBCircuitVerifier.new(newConfig);
        this.rpcProofVerifier = new QueuedIVCVerifier(rpcVerifier, newConfig.numConcurrentIVCVerifiers);
      } else {
        this.peerProofVerifier = new TestCircuitVerifier();
        this.rpcProofVerifier = new TestCircuitVerifier();
      }
    }

    this.config = newConfig;
  }

  public getProtocolContractAddresses(): Promise<ProtocolContractAddresses> {
    return Promise.resolve({
      classRegistry: ProtocolContractAddress.ContractClassRegistry,
      feeJuice: ProtocolContractAddress.FeeJuice,
      instanceRegistry: ProtocolContractAddress.ContractInstanceRegistry,
      multiCallEntrypoint: STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS,
    });
  }

  public registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return this.contractDataSource.registerContractFunctionSignatures(signatures);
  }

  public getValidatorsStats(): Promise<ValidatorsStats> {
    return this.validatorsSentinel?.computeStats() ?? Promise.resolve({ stats: {}, slotWindow: 0 });
  }

  public getValidatorStats(
    validatorAddress: EthAddress,
    fromSlot?: SlotNumber,
    toSlot?: SlotNumber,
  ): Promise<SingleValidatorStats | undefined> {
    return this.validatorsSentinel?.getValidatorStats(validatorAddress, fromSlot, toSlot) ?? Promise.resolve(undefined);
  }

  public async startSnapshotUpload(location: string): Promise<void> {
    // Note that we are forcefully casting the blocksource as an archiver
    // We break support for archiver running remotely to the node
    const archiver = this.blockSource as Archiver;
    if (!('backupTo' in archiver)) {
      this.metrics.recordSnapshotError();
      throw new Error('Archiver implementation does not support backups. Cannot generate snapshot.');
    }

    // Test that the archiver has done an initial sync.
    if (!archiver.isInitialSyncComplete()) {
      this.metrics.recordSnapshotError();
      throw new Error(`Archiver initial sync not complete. Cannot start snapshot.`);
    }

    // And it has an L2 block hash
    const l2BlockHash = await archiver.getL2Tips().then(tips => tips.proposed.hash);
    if (!l2BlockHash) {
      this.metrics.recordSnapshotError();
      throw new Error(`Archiver has no latest L2 block hash downloaded. Cannot start snapshot.`);
    }

    if (this.isUploadingSnapshot) {
      this.metrics.recordSnapshotError();
      throw new Error(`Snapshot upload already in progress. Cannot start another one until complete.`);
    }

    // Do not wait for the upload to be complete to return to the caller, but flag that an operation is in progress
    this.isUploadingSnapshot = true;
    const timer = new Timer();
    void uploadSnapshot(location, this.blockSource as Archiver, this.worldStateSynchronizer, this.config, this.log)
      .then(() => {
        this.isUploadingSnapshot = false;
        this.metrics.recordSnapshot(timer.ms());
      })
      .catch(err => {
        this.isUploadingSnapshot = false;
        this.metrics.recordSnapshotError();
        this.log.error(`Error uploading snapshot: ${err}`);
      });

    return Promise.resolve();
  }

  public async rollbackTo(targetBlock: BlockNumber, force?: boolean, resumeSync = true): Promise<void> {
    const archiver = this.blockSource as Archiver;
    if (!('rollbackTo' in archiver)) {
      throw new Error('Archiver implementation does not support rollbacks.');
    }

    const finalizedBlock = await archiver.getL2Tips().then(tips => tips.finalized.block.number);
    if (targetBlock < finalizedBlock) {
      if (force) {
        this.log.warn(`Clearing world state database to allow rolling back behind finalized block ${finalizedBlock}`);
        await this.worldStateSynchronizer.clear();
        await this.p2pClient.clear();
      } else {
        throw new Error(`Cannot rollback to block ${targetBlock} as it is before finalized ${finalizedBlock}`);
      }
    }

    try {
      this.log.info(`Pausing archiver and world state sync to start rollback`);
      await archiver.stop();
      await this.worldStateSynchronizer.stopSync();
      const currentBlock = await archiver.getBlockNumber();
      const blocksToUnwind = currentBlock - targetBlock;
      this.log.info(`Unwinding ${count(blocksToUnwind, 'block')} from L2 block ${currentBlock} to ${targetBlock}`);
      await archiver.rollbackTo(targetBlock);
      this.log.info(`Unwinding complete.`);
    } catch (err) {
      this.log.error(`Error during rollback`, err);
      throw err;
    } finally {
      if (resumeSync) {
        this.log.info(`Resuming world state and archiver sync.`);
        this.worldStateSynchronizer.resumeSync();
        archiver.resume();
      } else {
        this.log.info(`Sync left paused after rollback (resumeSync=false).`);
      }
    }
  }

  public async pauseSync(): Promise<void> {
    this.log.info(`Pausing archiver and world state sync`);
    await (this.blockSource as Archiver).stop();
    await this.worldStateSynchronizer.stopSync();
  }

  public resumeSync(): Promise<void> {
    this.log.info(`Resuming world state and archiver sync.`);
    this.worldStateSynchronizer.resumeSync();
    (this.blockSource as Archiver).resume();
    return Promise.resolve();
  }

  public pauseSequencer(): Promise<void> {
    if (this.automineSequencer) {
      this.automineSequencer.pause();
      return Promise.resolve();
    }
    if (this.sequencer) {
      if (this.sequencerPausedMinTxsPerBlock === undefined) {
        this.sequencerPausedMinTxsPerBlock = this.sequencer.getSequencer().getConfig().minTxsPerBlock ?? 0;
        this.sequencer.updateConfig({ minTxsPerBlock: Number.MAX_SAFE_INTEGER });
        this.log.info(`Sequencer paused (minTxsPerBlock set to MAX_SAFE_INTEGER)`, {
          previousMinTxsPerBlock: this.sequencerPausedMinTxsPerBlock,
        });
      }
      return Promise.resolve();
    }
    throw new BadRequestError('Cannot pause sequencer: no sequencer is running');
  }

  public resumeSequencer(): Promise<void> {
    if (this.automineSequencer) {
      this.automineSequencer.resume();
      return Promise.resolve();
    }
    if (this.sequencer) {
      if (this.sequencerPausedMinTxsPerBlock !== undefined) {
        const restored = this.sequencerPausedMinTxsPerBlock;
        this.sequencerPausedMinTxsPerBlock = undefined;
        this.sequencer.updateConfig({ minTxsPerBlock: restored });
        this.log.info(`Sequencer resumed (minTxsPerBlock restored)`, { minTxsPerBlock: restored });
      }
      return Promise.resolve();
    }
    throw new BadRequestError('Cannot resume sequencer: no sequencer is running');
  }

  public getSlashOffenses(round: bigint | 'all' | 'current'): Promise<Offense[]> {
    if (!this.slasherClient) {
      throw new Error(`Slasher client not enabled`);
    }
    if (round === 'all') {
      return this.slasherClient.getOffenses();
    } else {
      return this.slasherClient.gatherOffensesForRound(round === 'current' ? undefined : BigInt(round));
    }
  }

  public async reloadKeystore(): Promise<void> {
    if (!this.config.keyStoreDirectory?.length) {
      throw new BadRequestError(
        'Cannot reload keystore: node is not using a file-based keystore. ' +
          'Set KEY_STORE_DIRECTORY to use file-based keystores.',
      );
    }
    if (!this.validatorClient) {
      throw new BadRequestError('Cannot reload keystore: validator is not enabled.');
    }

    this.log.info('Reloading keystore from disk');

    // Re-read and validate keystore files
    const keyStores = loadKeystores(this.config.keyStoreDirectory);
    const newManager = new KeystoreManager(mergeKeystores(keyStores));
    await newManager.validateSigners();
    ValidatorClient.validateKeyStoreConfiguration(newManager, this.log);

    // Validate that every validator's publisher keys overlap with the L1 signers
    // that were initialized at startup. Publishers cannot be hot-reloaded, so a
    // validator with a publisher key that doesn't match any existing L1 signer
    // would silently fail on every proposer slot.
    if (this.keyStoreManager && this.sequencer) {
      const oldAdapter = NodeKeystoreAdapter.fromKeyStoreManager(this.keyStoreManager);
      const availablePublishers = new Set(
        oldAdapter
          .getAttesterAddresses()
          .flatMap(a => oldAdapter.getPublisherAddresses(a).map(p => p.toString().toLowerCase())),
      );

      const newAdapter = NodeKeystoreAdapter.fromKeyStoreManager(newManager);
      for (const attester of newAdapter.getAttesterAddresses()) {
        const pubs = newAdapter.getPublisherAddresses(attester);
        if (pubs.length > 0 && !pubs.some(p => availablePublishers.has(p.toString().toLowerCase()))) {
          throw new BadRequestError(
            `Cannot reload keystore: validator ${attester} has publisher keys ` +
              `[${pubs.map(p => p.toString()).join(', ')}] but none match the L1 signers initialized at startup ` +
              `[${[...availablePublishers].join(', ')}]. Publishers cannot be hot-reloaded — ` +
              `use an existing publisher key or restart the node.`,
          );
        }
      }
    }

    // Build adapters for old and new keystores to compute diff
    const newAdapter = NodeKeystoreAdapter.fromKeyStoreManager(newManager);
    const newAddresses = newAdapter.getAttesterAddresses();
    const oldAddresses = this.keyStoreManager
      ? NodeKeystoreAdapter.fromKeyStoreManager(this.keyStoreManager).getAttesterAddresses()
      : [];

    const oldSet = new Set(oldAddresses.map(a => a.toString()));
    const newSet = new Set(newAddresses.map(a => a.toString()));
    const added = newAddresses.filter(a => !oldSet.has(a.toString()));
    const removed = oldAddresses.filter(a => !newSet.has(a.toString()));

    if (added.length > 0) {
      this.log.info(`Keystore reload: adding attester keys: ${added.map(a => a.toString()).join(', ')}`);
    }
    if (removed.length > 0) {
      this.log.info(`Keystore reload: removing attester keys: ${removed.map(a => a.toString()).join(', ')}`);
    }
    if (added.length === 0 && removed.length === 0) {
      this.log.info('Keystore reload: attester keys unchanged');
    }

    // Update the validator client (coinbase, feeRecipient, attester keys)
    this.validatorClient.reloadKeystore(newManager);

    // Update the publisher factory's keystore so newly-added validators
    // can be matched to existing publisher keys when proposing blocks.
    if (this.sequencer) {
      this.sequencer.updatePublisherNodeKeyStore(newAdapter);
    }

    // Update slasher's "don't-slash-self" list with new validator addresses
    if (this.slasherClient && !this.config.slashSelfAllowed) {
      const slashValidatorsNever = unique(
        [...(this.config.slashValidatorsNever ?? []), ...newAddresses].map(a => a.toString()),
      ).map(EthAddress.fromString);
      this.slasherClient.updateConfig({ slashValidatorsNever });
    }

    this.keyStoreManager = newManager;
    this.log.info('Keystore reloaded: coinbase, feeRecipient, and attester keys updated');
  }

  public async mineBlock(): Promise<void> {
    if (this.automineSequencer) {
      await this.automineSequencer.buildEmptyBlock();
      return;
    }
    if (!this.sequencer) {
      throw new BadRequestError('Cannot mine block: no sequencer is running');
    }

    const currentBlockNumber = await this.getBlockNumber();

    // Use slot duration + 50% buffer as the timeout so this works on running networks too
    const { slotDuration } = await this.blockSource.getL1Constants();
    const timeoutSeconds = Math.ceil(slotDuration * 1.5);

    // Temporarily set minTxsPerBlock to 0 so the sequencer produces a block even with no txs
    const originalMinTxsPerBlock = this.sequencer.getSequencer().getConfig().minTxsPerBlock;
    this.sequencer.updateConfig({ minTxsPerBlock: 0 });

    try {
      // Trigger the sequencer to produce a block immediately
      void this.sequencer.trigger();

      // Wait for the new L2 block to appear
      await retryUntil(
        async () => {
          const newBlockNumber = await this.getBlockNumber();
          return newBlockNumber > currentBlockNumber ? true : undefined;
        },
        'mineBlock',
        timeoutSeconds,
        0.1,
      );
    } finally {
      this.sequencer.updateConfig({ minTxsPerBlock: originalMinTxsPerBlock });
    }
  }

  public async prove(upToCheckpoint?: CheckpointNumber): Promise<CheckpointNumber> {
    if (!this.automineSequencer) {
      throw new BadRequestError('Cannot prove checkpoint: no automine sequencer is running');
    }
    return await this.automineSequencer.prove(upToCheckpoint);
  }

  /**
   * Returns an instance of MerkleTreeOperations having first ensured the world state is fully synched
   * @param block - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @returns An instance of a committed MerkleTreeOperations
   */
  protected async getWorldState(block: BlockParameter) {
    const query = this.normalizeBlockParameter(block);

    // When the request anchors on a specific block hash, resolve it against the archiver up front and
    // drive the world-state sync to that exact block number and hash. Resolving against the archiver
    // first fails fast with a clear reorg error if the hash is unknown, and passing the hash to the
    // synchronizer makes the sync reorg-aware: it barriers until the archive-tree commit for that block
    // has landed and verifies it matches the requested fork, instead of syncing to bare latest height
    // and then racing the snapshot read below against an in-flight archive-tree write.
    const requestedHash = 'hash' in query ? query.hash : undefined;
    const anchorBlockNumber = requestedHash !== undefined ? await this.resolveBlockNumber(query) : undefined;

    let blockSyncedTo: BlockNumber = BlockNumber.ZERO;
    try {
      // Attempt to sync the world state if necessary
      blockSyncedTo = await this.#syncWorldState(anchorBlockNumber, requestedHash);
    } catch (err) {
      this.log.error(`Error getting world state: ${err}`);
    }

    if ('tag' in query && query.tag === 'proposed') {
      this.log.debug(`Using committed db for latest block, world state synced upto ${blockSyncedTo}`);
      return this.worldStateSynchronizer.getCommitted();
    }

    const blockNumber = anchorBlockNumber ?? (await this.resolveBlockNumber(query));

    // Check it's within world state sync range
    if (blockNumber > blockSyncedTo) {
      throw new Error(
        `Queried block ${inspectBlockParameter(block)} not yet synced by the node (node is synced upto ${blockSyncedTo}).`,
      );
    }
    this.log.debug(`Using snapshot for block ${blockNumber}, world state synced upto ${blockSyncedTo}`);

    const snapshot = this.worldStateSynchronizer.getSnapshot(blockNumber);

    // Double-check world-state synced to the same block hash as was requested.
    // Block 0 is skipped: the snapshot returned by `getSnapshot(0)` is the *pre*-genesis archive
    // (size 0), so leaf 0 is not yet inserted from that snapshot's view even though block 0's hash
    // does live at archive index 0 in the committed tree. The genesis hash is already validated by
    // the archiver when it resolves the hash query to block number 0.
    if (requestedHash !== undefined && blockNumber !== BlockNumber.ZERO) {
      const blockHash = await snapshot.getLeafValue(MerkleTreeId.ARCHIVE, BigInt(blockNumber));
      if (!blockHash || !requestedHash.equals(blockHash)) {
        throw new Error(
          `Block hash ${requestedHash.toString()} not found in world state at block number ${blockNumber} (world state has ${blockHash?.toString() ?? 'no hash'} at that index, genesis header hash is ${this.blockSource.getGenesisBlockHash().toString()}). If the node API has been queried with anchor block hash possibly a reorg has occurred.`,
        );
      }
    }

    return snapshot;
  }

  /** Resolves any {@link BlockParameter} variant to a concrete block number. */
  protected async resolveBlockNumber(block: BlockParameter): Promise<BlockNumber> {
    const query = this.normalizeBlockParameter(block);
    const blockNumber = await this.blockSource.getBlockNumber(query);
    if (blockNumber === undefined) {
      if ('hash' in query) {
        throw new Error(
          `Block hash ${query.hash.toString()} not found when querying world state. If the node API has been queried with anchor block hash possibly a reorg has occurred.`,
        );
      }
      if ('archive' in query) {
        throw new Error(`Block with archive ${query.archive.toString()} not found.`);
      }
      throw new Error(`Block not found for ${inspectBlockParameter(block)}.`);
    }
    return blockNumber;
  }

  /**
   * Ensure the world state is synced.
   * @param targetBlockNumber - Block to sync up to. Defaults to the latest block known to the archiver.
   * @param blockHash - If provided, the synchronizer verifies the block at `targetBlockNumber` matches this
   * hash, resyncing (and so detecting reorgs) if it does not yet match or has been reorged away.
   * @returns A promise that fulfils once the world state is synced
   */
  async #syncWorldState(targetBlockNumber?: BlockNumber, blockHash?: BlockHash): Promise<BlockNumber> {
    const target = targetBlockNumber ?? (await this.blockSource.getBlockNumber());
    return await this.worldStateSynchronizer.syncImmediate(target, blockHash);
  }
}
