import { Archiver } from '@aztec/archiver';
import { BBCircuitVerifier, BatchChonkVerifier, QueuedIVCVerifier } from '@aztec/bb-prover';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import { ARCHIVE_HEIGHT, type L1_TO_L2_MSG_TREE_HEIGHT, type NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import type { EpochSlotMathInterface } from '@aztec/epoch-cache';
import { RollupContract } from '@aztec/ethereum/contracts';
import { type L1ContractAddresses, pickL1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import {
  BlockNumber,
  CheckpointNumber,
  type CheckpointProposalHash,
  EpochNumber,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { pick, unique } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { count } from '@aztec/foundation/string';
import { Timer } from '@aztec/foundation/timer';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';
import { KeystoreManager, loadKeystores, mergeKeystores } from '@aztec/node-keystore';
import { uploadSnapshot } from '@aztec/node-lib/actions';
import { type P2P, createTxValidatorForAcceptingTxsOverRPC, getDefaultAllowedSetupFunctions } from '@aztec/p2p';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { ProverNode } from '@aztec/prover-node';
import { SequencerClient } from '@aztec/sequencer-client';
import { AutomineSequencer } from '@aztec/sequencer-client/automine';
import type { SlasherClientInterface } from '@aztec/slasher';
import { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS } from '@aztec/standard-contracts/multi-call-entrypoint';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  type BlockParameter,
  type CheckpointsQuery,
  type DataInBlock,
  type L2BlockSource,
  type L2BlockTag,
  type L2Tips,
  inspectBlockParameter,
} from '@aztec/stdlib/block';
import type {
  ContractClassPublic,
  ContractDataSource,
  ContractInstanceWithAddress,
  NodeInfo,
  ProtocolContractAddresses,
} from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees, type ManaUsageEstimate, getNetworkTxGasLimits } from '@aztec/stdlib/gas';
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
  type ArchiverApi,
  type ClientProtocolCircuitVerifier,
  type L2LogsSource,
  type Service,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import type { DebugLogStore, LogResult, PrivateLogsQuery, PublicLogsQuery } from '@aztec/stdlib/logs';
import { NullDebugLogStore } from '@aztec/stdlib/logs';
import type { L1ToL2MessageSource, L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import type { CheckpointAttestation } from '@aztec/stdlib/p2p';
import type { Offense } from '@aztec/stdlib/slashing';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import {
  type FeeProvider,
  type GetTxReceiptOptions,
  type GlobalVariableBuilder as GlobalVariableBuilderInterface,
  type IndexedTxEffect,
  PublicSimulationOutput,
  type SimulationOverrides,
  Tx,
  type TxHash,
  type TxReceipt,
  type TxValidationResult,
} from '@aztec/stdlib/tx';
import type { SingleValidatorStats, ValidatorsStats } from '@aztec/stdlib/validators';
import {
  Attributes,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';
import { NodeKeystoreAdapter, ValidatorClient } from '@aztec/validator-client';

import { NodeBlockProvider } from '../modules/node_block_provider.js';
import { type NodeTxGateway, P2PTxGateway } from '../modules/node_tx_gateway.js';
import { NodeTxReceiptBuilder } from '../modules/node_tx_receipt.js';
import { NodeWorldStateQueries } from '../modules/node_world_state_queries.js';
import { Sentinel } from '../sentinel/sentinel.js';
import type { AztecNodeConfig } from './config.js';
import { NodeMetrics } from './node_metrics.js';
import { NodePublicCallsSimulator } from './node_public_calls_simulator.js';

/**
 * Fully-constructed collaborators and settings an {@link AztecNodeService} owns. Built by `createAztecNodeService`
 * (see `factory.ts`); passed as a single object so call sites name each dependency instead of relying on
 * positional order.
 */
export interface AztecNodeServiceDeps {
  config: AztecNodeConfig;
  /**
   * The node's p2p stack. Absent on a follower node, which replicates from an upstream node instead of
   * gossiping; every tx-related call then goes through {@link txGateway}.
   */
  p2pClient?: P2P;
  /** Source of not-yet-mined txs. Defaults to a {@link P2PTxGateway} over {@link p2pClient}. */
  txGateway?: NodeTxGateway;
  /** The archiver behind this node, exposed over the `archiver_*` RPC namespace for follower nodes. */
  archiverApi?: ArchiverApi;
  blockSource: L2BlockSource & Partial<Service>;
  logsSource: L2LogsSource;
  contractDataSource: ContractDataSource;
  l1ToL2MessageSource: L1ToL2MessageSource;
  worldStateSynchronizer: WorldStateSynchronizer;
  sequencer: SequencerClient | undefined;
  proverNode: ProverNode | undefined;
  slasherClient: SlasherClientInterface | undefined;
  validatorsSentinel: Sentinel | undefined;
  stopStartedWatchers: () => Promise<void>;
  l1ChainId: number;
  version: number;
  globalVariableBuilder: GlobalVariableBuilderInterface;
  rollupContract: RollupContract | undefined;
  feeProvider: FeeProvider;
  epochCache: EpochSlotMathInterface;
  packageVersion: string;
  /** Verifier for proofs received over p2p. Absent on a follower node, which has no p2p stack. */
  peerProofVerifier?: ClientProtocolCircuitVerifier;
  /** Verifier for proofs received over RPC. Absent only on a follower node configured as a pure relay. */
  rpcProofVerifier?: ClientProtocolCircuitVerifier;
  /**
   * Answers `isReady`. Defaults to the p2p client's own readiness; a follower node supplies a probe over its
   * replication health instead.
   */
  readinessProbe?: () => Promise<boolean>;
  telemetry?: TelemetryClient;
  log?: Logger;
  blobClient?: BlobClientInterface;
  validatorClient?: ValidatorClient;
  keyStoreManager?: KeystoreManager;
  debugLogStore?: DebugLogStore;
  automineSequencer?: AutomineSequencer;
}

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
  private readonly worldStateQueries: NodeWorldStateQueries;
  private readonly blockProvider: NodeBlockProvider;
  private readonly txReceiptBuilder: NodeTxReceiptBuilder;

  public readonly tracer: Tracer;

  protected config: AztecNodeConfig;
  protected readonly p2pClient: P2P | undefined;
  protected readonly txGateway: NodeTxGateway;
  protected readonly archiverApi: ArchiverApi | undefined;
  protected readonly blockSource: L2BlockSource & Partial<Service>;
  protected readonly logsSource: L2LogsSource;
  protected readonly contractDataSource: ContractDataSource;
  protected readonly l1ToL2MessageSource: L1ToL2MessageSource;
  protected readonly worldStateSynchronizer: WorldStateSynchronizer;
  protected readonly sequencer: SequencerClient | undefined;
  protected readonly proverNode: ProverNode | undefined;
  protected readonly slasherClient: SlasherClientInterface | undefined;
  protected readonly validatorsSentinel: Sentinel | undefined;
  private readonly stopStartedWatchers: () => Promise<void>;
  protected readonly l1ChainId: number;
  protected readonly version: number;
  protected readonly globalVariableBuilder: GlobalVariableBuilderInterface;
  protected readonly rollupContract: RollupContract | undefined;
  protected readonly feeProvider: FeeProvider;
  protected readonly epochCache: EpochSlotMathInterface;
  protected readonly packageVersion: string;
  private peerProofVerifier: ClientProtocolCircuitVerifier | undefined;
  private rpcProofVerifier: ClientProtocolCircuitVerifier | undefined;
  private readonly readinessProbe: () => Promise<boolean>;
  private telemetry: TelemetryClient;
  private log: Logger;
  private blobClient?: BlobClientInterface;
  private validatorClient?: ValidatorClient;
  private keyStoreManager?: KeystoreManager;
  private debugLogStore: DebugLogStore;
  private readonly automineSequencer?: AutomineSequencer;

  constructor(deps: AztecNodeServiceDeps) {
    this.config = deps.config;
    this.p2pClient = deps.p2pClient;
    const txGateway = deps.txGateway ?? (deps.p2pClient && new P2PTxGateway(deps.p2pClient));
    if (!txGateway) {
      throw new Error('An Aztec node needs either a p2p client or a tx gateway to handle transactions');
    }
    this.txGateway = txGateway;
    this.archiverApi = deps.archiverApi;
    this.blockSource = deps.blockSource;
    this.logsSource = deps.logsSource;
    this.contractDataSource = deps.contractDataSource;
    this.l1ToL2MessageSource = deps.l1ToL2MessageSource;
    this.worldStateSynchronizer = deps.worldStateSynchronizer;
    this.sequencer = deps.sequencer;
    this.proverNode = deps.proverNode;
    this.slasherClient = deps.slasherClient;
    this.validatorsSentinel = deps.validatorsSentinel;
    this.stopStartedWatchers = deps.stopStartedWatchers;
    this.l1ChainId = deps.l1ChainId;
    this.version = deps.version;
    this.globalVariableBuilder = deps.globalVariableBuilder;
    this.rollupContract = deps.rollupContract;
    this.feeProvider = deps.feeProvider;
    this.epochCache = deps.epochCache;
    this.packageVersion = deps.packageVersion;
    this.peerProofVerifier = deps.peerProofVerifier;
    this.rpcProofVerifier = deps.rpcProofVerifier;
    this.readinessProbe = deps.readinessProbe ?? (() => Promise.resolve(this.p2pClient?.isReady() ?? false));
    this.telemetry = deps.telemetry ?? getTelemetryClient();
    this.log = deps.log ?? createLogger('node');
    this.blobClient = deps.blobClient;
    this.validatorClient = deps.validatorClient;
    this.keyStoreManager = deps.keyStoreManager;
    this.debugLogStore = deps.debugLogStore ?? new NullDebugLogStore();
    this.automineSequencer = deps.automineSequencer;

    this.metrics = new NodeMetrics(this.telemetry, 'AztecNodeService');
    this.tracer = this.telemetry.getTracer('AztecNodeService');

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

    this.worldStateQueries = new NodeWorldStateQueries({
      worldStateSynchronizer: this.worldStateSynchronizer,
      blockSource: this.blockSource,
      l1ToL2MessageSource: this.l1ToL2MessageSource,
      log: this.log.createChild('world-state-queries'),
    });

    this.blockProvider = new NodeBlockProvider(this.blockSource);

    this.txReceiptBuilder = new NodeTxReceiptBuilder({
      txGateway: this.txGateway,
      blockSource: this.blockSource,
      debugLogStore: this.debugLogStore,
    });

    this.log.info(`Aztec Node version: ${this.packageVersion}`);
    this.log.info(`Aztec Node started on chain 0x${this.l1ChainId.toString(16)}`, pickL1ContractAddresses(this.config));

    // A defensive check that protects us against introducing a bug in the complex node creation flow. We must
    // never have debugLogStore enabled when not in test mode because then we would be accumulating debug logs in
    // memory which could be a DoS vector on the sequencer (since no fees are paid for debug logs).
    if (this.debugLogStore.isEnabled && this.config.realProofs) {
      throw new Error('debugLogStore should never be enabled when realProofs are set');
    }
  }

  /** @internal Exposed for testing — returns the RPC proof verifier, if this node runs one. */
  public getProofVerifier(): ClientProtocolCircuitVerifier | undefined {
    return this.rpcProofVerifier;
  }

  public async getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    const status = await this.worldStateSynchronizer.status();
    return status.syncSummary;
  }

  public getChainTips(): Promise<L2Tips> {
    return this.blockSource.getL2Tips();
  }

  public getL1Constants(): Promise<L1RollupConstants> {
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

  public getBlock<Opts extends BlockIncludeOptions = {}>(
    param: BlockParameter,
    options: Opts = {} as Opts,
  ): Promise<BlockResponse<Opts> | undefined> {
    return this.blockProvider.getBlock(param, options);
  }

  public getBlockData(param: BlockParameter): Promise<BlockData | undefined> {
    return this.blockProvider.getBlockData(param);
  }

  public getBlocks<Opts extends BlocksIncludeOptions = {}>(
    from: BlockNumber,
    limit: number,
    options: Opts = {} as Opts,
  ): Promise<BlockResponse<Opts>[]> {
    return this.blockProvider.getBlocks(from, limit, options);
  }

  public getCheckpoint<Opts extends CheckpointIncludeOptions = {}>(
    param: CheckpointParameter,
    options: Opts = {} as Opts,
  ): Promise<CheckpointResponse<Opts> | undefined> {
    return this.blockProvider.getCheckpoint(param, options);
  }

  public getCheckpoints<Opts extends CheckpointIncludeOptions = {}>(
    from: CheckpointNumber,
    limit: number,
    options: Opts = {} as Opts,
  ): Promise<CheckpointResponse<Opts>[]> {
    return this.blockProvider.getCheckpoints(from, limit, options);
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

  /**
   * Returns the p2p client backing this node.
   * @throws If the node runs without a p2p stack (follower mode) — use {@link tryGetP2P} to handle that case.
   */
  public getP2P(): P2P {
    if (!this.p2pClient) {
      throw new Error('This node runs without a p2p stack');
    }
    return this.p2pClient;
  }

  /** Returns the p2p client backing this node, or undefined if it runs without a p2p stack (follower mode). */
  public tryGetP2P(): P2P | undefined {
    return this.p2pClient;
  }

  /** Returns the archiver behind this node, for serving the `archiver_*` RPC namespace to follower nodes. */
  public getArchiverApi(): ArchiverApi | undefined {
    return this.archiverApi;
  }

  /**
   * Method to return the currently deployed L1 contract addresses.
   * @returns - The currently deployed L1 contract addresses.
   */
  public getL1ContractAddresses(): Promise<L1ContractAddresses> {
    return Promise.resolve(pickL1ContractAddresses(this.config));
  }

  public getEncodedEnr(): Promise<string | undefined> {
    return this.txGateway.getEncodedEnr();
  }

  public async getAllowedPublicSetup(): Promise<AllowedElement[]> {
    return [...(await getDefaultAllowedSetupFunctions()), ...(this.config.txPublicSetupAllowListExtend ?? [])];
  }

  /**
   * Method to determine if the node is ready to accept transactions. A full node reports its p2p client's
   * readiness; a follower node reports its replication and world-state health (see `createFollowerNodeService`).
   * @returns - Flag indicating the readiness for tx submission.
   */
  public isReady(): Promise<boolean> {
    return this.readinessProbe();
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

  public getMaxPriorityFees(): Promise<GasFees> {
    return this.txGateway.getMaxPriorityFees();
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

  public async getContract(
    address: AztecAddress,
    referenceBlock: BlockParameter = 'latest',
  ): Promise<ContractInstanceWithAddress | undefined> {
    const blockData = await this.getBlockData(referenceBlock);
    if (!blockData) {
      throw new Error(
        `Reference block ${inspectBlockParameter(referenceBlock)} not found when querying contract ${address}. If the node API has been queried with an anchor block hash, possibly a reorg has occurred.`,
      );
    }
    return this.contractDataSource.getContract(address, blockData.header.globalVariables.timestamp);
  }

  public getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]> {
    return this.logsSource.getPrivateLogsByTags(query);
  }

  public getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]> {
    return this.logsSource.getPublicLogsByTags(query);
  }

  /**
   * Method to submit a transaction to the p2p pool, or to the upstream node when running as a follower.
   * @param tx - The transaction to be submitted.
   */
  public async sendTx(tx: Tx) {
    await this.#sendTx(tx);
  }

  async #sendTx(tx: Tx) {
    const timer = new Timer();
    const txHash = tx.getTxHash().toString();

    // The gateway decides: a p2p-backed one always validates here, and a follower does too unless it has been
    // configured as a pure relay, in which case its upstream is the only thing standing between the tx and the
    // mempool. See `requiresLocalTxValidation`.
    if (this.txGateway.requiresLocalTxValidation) {
      const valid = await this.isValidTx(tx);
      if (valid.result !== 'valid') {
        const reason = valid.reason.join(', ');
        this.metrics.receivedTx(timer.ms(), false);
        this.log.warn(`Received invalid tx ${txHash}: ${reason}`, { txHash });
        throw new Error(`Invalid tx: ${reason}`);
      }
    }

    try {
      await this.txGateway.sendTx(tx);
    } catch (err) {
      this.metrics.receivedTx(timer.ms(), false);
      this.log.warn(`Mempool rejected tx ${txHash}: ${(err as Error).message}`, { txHash });
      throw err;
    }
    const duration = timer.ms();
    this.metrics.receivedTx(duration, true);
    this.log.info(`Received tx ${txHash} in ${duration}ms`, { txHash });
  }

  public getTxReceipt<TGetTxReceiptOptions extends GetTxReceiptOptions = {}>(
    txHash: TxHash,
    options?: TGetTxReceiptOptions,
  ): Promise<TxReceipt<TGetTxReceiptOptions>> {
    return this.txReceiptBuilder.getTxReceipt(txHash, options);
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
    await tryStop(this.txGateway);
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
    return this.txGateway.getPendingTxs(limit, after, options);
  }

  public getPendingTxCount(): Promise<number> {
    return this.txGateway.getPendingTxCount();
  }

  public getPeers(includePending?: boolean): Promise<PeerInfo[]> {
    return this.txGateway.getPeers(includePending);
  }

  public getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    return this.txGateway.getCheckpointAttestationsForSlot(slot, proposalPayloadHash);
  }

  public getProposalsForSlot(slot: SlotNumber): Promise<ProposalsForSlot> {
    return this.txGateway.getProposalsForSlot(slot);
  }

  /**
   * Method to retrieve a single tx from the mempool or unfinalized chain. The tx's proof is only loaded and returned
   * when `includeProof` is set.
   * @param txHash - The transaction hash to return.
   * @param options - Options for the returned tx (eg whether to include its proof).
   * @returns - The tx if it exists.
   */
  public getTxByHash(txHash: TxHash, options?: GetTxByHashOptions): Promise<Tx | undefined> {
    return this.txGateway.getTxByHash(txHash, options);
  }

  /**
   * Method to retrieve txs from the mempool or unfinalized chain. The txs' proofs are only loaded and returned when
   * `includeProof` is set.
   * @param txHash - The transaction hash to return.
   * @param options - Options for the returned txs (eg whether to include their proofs).
   * @returns - The txs if it exists.
   */
  public getTxsByHash(txHashes: TxHash[], options?: GetTxByHashOptions): Promise<Tx[]> {
    return this.txGateway.getTxsByHash(txHashes, options);
  }

  public findLeavesIndexes(
    referenceBlock: BlockParameter,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(DataInBlock<bigint> | undefined)[]> {
    return this.worldStateQueries.findLeavesIndexes(referenceBlock, treeId, leafValues);
  }

  public getBlockHashMembershipWitness(
    referenceBlock: BlockParameter,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    return this.worldStateQueries.getBlockHashMembershipWitness(referenceBlock, blockHash);
  }

  public getNoteHashMembershipWitness(
    referenceBlock: BlockParameter,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    return this.worldStateQueries.getNoteHashMembershipWitness(referenceBlock, noteHash);
  }

  public getL1ToL2MessageMembershipWitness(
    referenceBlock: BlockParameter,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    return this.worldStateQueries.getL1ToL2MessageMembershipWitness(referenceBlock, l1ToL2Message);
  }

  public getL1ToL2MessageCheckpoint(l1ToL2Message: Fr): Promise<CheckpointNumber | undefined> {
    return this.worldStateQueries.getL1ToL2MessageCheckpoint(l1ToL2Message);
  }

  public getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    return this.l1ToL2MessageSource.getL1ToL2Messages(checkpointNumber);
  }

  /**
   * Returns all the L2 to L1 messages in an epoch.
   *
   * @deprecated Use {@link getL2ToL1MembershipWitness} to get an L2-to-L1 message witness directly.
   *
   * @param epoch - The epoch at which to get the data.
   * @returns The L2 to L1 messages (empty array if the epoch is not found).
   */
  public getL2ToL1Messages(epoch: EpochNumber): Promise<Fr[][][][]> {
    return this.worldStateQueries.getL2ToL1Messages(epoch);
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
    return this.worldStateQueries.getL2ToL1MembershipWitness(txHash, message, messageIndexInTx);
  }

  public getNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.worldStateQueries.getNullifierMembershipWitness(referenceBlock, nullifier);
  }

  public getLowNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.worldStateQueries.getLowNullifierMembershipWitness(referenceBlock, nullifier);
  }

  public getPublicDataWitness(referenceBlock: BlockParameter, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return this.worldStateQueries.getPublicDataWitness(referenceBlock, leafSlot);
  }

  public getPublicStorageAt(referenceBlock: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr> {
    return this.worldStateQueries.getPublicStorageAt(referenceBlock, contract, slot);
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
    // A follower node runs this same validator, verifier included, before forwarding a tx upstream, unless it
    // was configured as a pure relay — in which case it has no verifier and this answer covers everything but
    // the proof.
    //
    // The anchor-block check runs against the local archive tree either way. On a follower that assumes the
    // client built its tx against this node's view (or a less-synced one), which holds for a client that reads
    // from the node it submits to: an anchor ahead of the local tip is rejected rather than retried upstream.
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
    await this.txGateway.updateConfig(config);
    const archiver = this.blockSource as Archiver;
    if ('updateConfig' in archiver) {
      archiver.updateConfig(config);
    }
    // Only nodes that run verifiers swap them: a follower has none, since it does not validate txs locally.
    if (newConfig.realProofs !== this.config.realProofs && (this.peerProofVerifier || this.rpcProofVerifier)) {
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

    // A follower node's replicating archiver never reads L1, so it cannot stamp the snapshot with the L1 block
    // it corresponds to. Reject up front: otherwise the metadata build fails asynchronously inside
    // uploadSnapshot (after the caller has already been told the upload started), and the snapshot would be
    // unusable by anyone restoring from it anyway.
    if (!('getL1BlockNumber' in archiver)) {
      this.metrics.recordSnapshotError();
      throw new BadRequestError('Archiver implementation does not sync from L1. Cannot generate snapshot.');
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
      throw new BadRequestError('Archiver implementation does not support rollbacks.');
    }

    const finalizedBlock = await archiver.getL2Tips().then(tips => tips.finalized.block.number);
    if (targetBlock < finalizedBlock) {
      if (force) {
        this.log.warn(`Clearing world state database to allow rolling back behind finalized block ${finalizedBlock}`);
        await this.worldStateSynchronizer.clear();
        await this.txGateway.clear();
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
    const archiver = this.assertArchiverSupportsPausing();
    this.log.info(`Pausing archiver and world state sync`);
    await archiver.stop();
    await this.worldStateSynchronizer.stopSync();
  }

  public resumeSync(): Promise<void> {
    const archiver = this.assertArchiverSupportsPausing();
    this.log.info(`Resuming world state and archiver sync.`);
    this.worldStateSynchronizer.resumeSync();
    archiver.resume();
    return Promise.resolve();
  }

  /**
   * Returns the block source as a pausable archiver. A follower node's replicating archiver cannot be resumed
   * once stopped, so pausing is rejected outright rather than leaving the node stuck with sync switched off.
   */
  private assertArchiverSupportsPausing(): Archiver {
    const archiver = this.blockSource as Archiver;
    if (!('resume' in archiver)) {
      throw new BadRequestError('Archiver implementation does not support pausing and resuming sync.');
    }
    return archiver;
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

  public async warpL2TimeAtLeastTo(targetTimestamp: number): Promise<void> {
    if (!this.automineSequencer) {
      throw new BadRequestError('Cannot warp L2 time: no automine sequencer is running');
    }
    await this.automineSequencer.warpTo(targetTimestamp);
  }

  public async warpL2TimeAtLeastBy(duration: number): Promise<void> {
    if (!this.automineSequencer) {
      throw new BadRequestError('Cannot warp L2 time: no automine sequencer is running');
    }
    await this.automineSequencer.warpBy(duration);
  }

  /**
   * Returns a committed world-state view at `block`, driving sync first. Delegates to
   * {@link NodeWorldStateQueries.getWorldState}; kept as a protected method so subclasses and tests can
   * exercise the node's block-resolution and reorg-aware sync behavior.
   */
  protected getWorldState(block: BlockParameter) {
    return this.worldStateQueries.getWorldState(block);
  }
}
