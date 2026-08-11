import type { EpochCacheInterface } from '@aztec/epoch-cache';
import {
  BlockNumber,
  CheckpointNumber,
  type CheckpointProposalHash,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import {
  type BlockData,
  type BlockHash,
  type CheckpointId,
  type EthAddress,
  EventDrivenL2BlockStream,
  type L2Block,
  type L2BlockId,
  type L2BlockSource,
  type L2BlockStreamEvent,
  type L2TipsStore,
  type LocalL2Tips,
} from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { type GetTxByHashOptions, type PeerInfo, tryStop } from '@aztec/stdlib/interfaces/server';
import { type BlockProposal, CheckpointAttestation, type CheckpointProposal, type TopicType } from '@aztec/stdlib/p2p';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import { Attributes, type TelemetryClient, WithTracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';
import type { ENR } from '@nethermindeth/enr';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { TxPoolError } from '../errors/tx-pool.error.js';
import type { AttestationPoolApi, ProposalsForSlot } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPoolV2 } from '../mem_pools/tx_pool_v2/interfaces.js';
import type { AuthRequest, StatusMessage } from '../services/index.js';
import { ReqRespSubProtocol, type ReqRespSubProtocolHandler } from '../services/reqresp/interface.js';
import type {
  DuplicateAttestationInfo,
  DuplicateProposalInfo,
  OversizedProposalInfo,
  P2PBlockReceivedCallback,
  P2PCheckpointReceivedCallback,
  P2PService,
} from '../services/service.js';
import { TxCollection } from '../services/tx_collection/tx_collection.js';
import type { TxFileStore } from '../services/tx_file_store/tx_file_store.js';
import { TxProvider } from '../services/tx_provider.js';
import { type P2P, P2PClientState, type P2PSyncState } from './interface.js';

/**
 * The P2P client implementation.
 */
export class P2PClient extends WithTracer implements P2P {
  /** The JS promise that will be running to keep the client's data in sync. Can be interrupted if the client is stopped. */
  private runningPromise!: Promise<void>;

  private currentState = P2PClientState.IDLE;
  private syncPromise = Promise.resolve();
  private syncResolvers?: PromiseWithResolvers<void> = undefined;
  private latestBlockNumberAtStart = -1;
  private provenBlockNumberAtStart = -1;
  private finalizedBlockNumberAtStart = -1;

  private l2Tips: L2TipsStore;
  private synchedLatestSlot: AztecAsyncSingleton<bigint>;

  private txPool: TxPoolV2;
  private attestationPool: AttestationPoolApi;

  private config: P2PConfig;

  private blockStream: EventDrivenL2BlockStream | undefined;

  private txProvider: TxProvider;

  private validatorAddresses: EthAddress[] = [];

  /** Tracks the last slot for which we called prepareForSlot */
  private lastSlotProcessed: SlotNumber = SlotNumber.ZERO;

  constructor(
    private store: AztecAsyncKVStore,
    private l2BlockSource: L2BlockSource & ContractDataSource,
    mempools: MemPools,
    private p2pService: P2PService,
    private txCollection: TxCollection,
    private txFileStore: TxFileStore | undefined,
    private epochCache: EpochCacheInterface,
    config: Partial<P2PConfig> = {},
    private _dateProvider: DateProvider = new DateProvider(),
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p'),
    initialBlockHash: BlockHash,
  ) {
    super(telemetry, 'P2PClient');

    this.config = { ...getP2PDefaultConfig(), ...config };
    this.txPool = mempools.txPool;
    this.attestationPool = mempools.attestationPool;

    this.txProvider = new TxProvider(
      this.txCollection,
      this.txPool,
      this,
      this.log.createChild('tx-provider'),
      this.telemetry,
    );

    this.l2Tips = new L2TipsKVStore(store, 'p2p_client', initialBlockHash);
    this.synchedLatestSlot = store.openSingleton('p2p_pool_last_l2_slot');
  }

  public registerThisValidatorAddresses(addresses: EthAddress[]): void {
    this.validatorAddresses = [...addresses];
    this.p2pService.registerThisValidatorAddresses(this.validatorAddresses);
  }

  public clear(): Promise<void> {
    return this.store.clear();
  }

  public isP2PClient(): true {
    return true;
  }

  public getTxProvider(): TxProvider {
    return this.txProvider;
  }

  public getPeers(includePending?: boolean): Promise<PeerInfo[]> {
    return Promise.resolve(this.p2pService.getPeers(includePending));
  }

  public getGossipMeshPeerCount(topicType: TopicType): Promise<number> {
    return Promise.resolve(this.p2pService.getGossipMeshPeerCount(topicType));
  }

  public getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    return this.l2Tips.getL2BlockHash(number);
  }

  public async updateP2PConfig(config: Partial<P2PConfig>): Promise<void> {
    await this.txPool.updateConfig(config);
    this.p2pService.updateConfig(config);
  }

  public getL2Tips(): Promise<LocalL2Tips> {
    return this.l2Tips.getL2Tips();
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    this.log.debug(`Handling block stream event ${event.type}`);

    switch (event.type) {
      case 'blocks-added':
        await this.handleLatestL2Blocks(event.blocks);
        break;
      case 'chain-finalized': {
        const oldFinalizedBlockNum = await this.getSyncedFinalizedBlockNum();
        const from = BlockNumber(oldFinalizedBlockNum + 1);
        const limit = event.block.number - from + 1;
        if (limit > 0) {
          const oldBlocks = await this.l2BlockSource.getBlocksData({ from, limit });
          await this.handleFinalizedL2Blocks(oldBlocks);
        }
        break;
      }
      case 'chain-proven':
        this.txCollection.stopCollectingForBlocksUpTo(event.block.number);
        break;
      case 'chain-pruned':
        this.txCollection.stopCollectingForBlocksAfter(event.block.number);
        await this.handlePruneL2Blocks(event.block, event.checkpointed.checkpoint);
        break;
      case 'chain-checkpointed':
        break;
      case 'chain-proposed':
        break;
      default: {
        const _: never = event;
        break;
      }
    }

    // Pass the event through to our l2 tips store
    await this.l2Tips.handleBlockStreamEvent(event);
    await this.startServiceIfSynched();
  }

  #assertIsReady() {
    if (!this.isReady()) {
      throw new Error('P2P client not ready');
    }
  }

  /**
   * Starts the P2P client.
   * @returns An empty promise signalling the synching process.
   */
  public async start() {
    if (this.currentState === P2PClientState.STOPPED) {
      throw new Error('P2P client already stopped');
    }
    if (this.currentState !== P2PClientState.IDLE) {
      return this.syncPromise;
    }

    // Start the tx pool first, as it needs to hydrate state from persistence
    await this.txPool.start();

    // get the current latest block numbers
    const latestBlockNumbers = await this.l2BlockSource.getL2Tips();
    this.latestBlockNumberAtStart = latestBlockNumbers.proposed.number;
    this.provenBlockNumberAtStart = latestBlockNumbers.proven.block.number;
    this.finalizedBlockNumberAtStart = latestBlockNumbers.finalized.block.number;

    const syncedLatestBlock = (await this.getSyncedLatestBlockNum()) + 1;
    const syncedProvenBlock = (await this.getSyncedProvenBlockNum()) + 1;
    const syncedFinalizedBlock = (await this.getSyncedFinalizedBlockNum()) + 1;

    if ((await this.txPool.isEmpty()) && (await this.attestationPool.isEmpty())) {
      // if mempools are empty, we don't care about syncing prior blocks
      this.initBlockStream(BlockNumber(this.latestBlockNumberAtStart));
      this.setCurrentState(P2PClientState.RUNNING);
      this.syncPromise = Promise.resolve();
      await this.p2pService.start();
      this.log.info(`Starting p2p client from block ${this.latestBlockNumberAtStart} with empty mempools`);
    } else if (
      syncedLatestBlock <= this.latestBlockNumberAtStart ||
      syncedProvenBlock <= this.provenBlockNumberAtStart ||
      syncedFinalizedBlock <= this.finalizedBlockNumberAtStart
    ) {
      // if there are blocks to be retrieved, go to a synching state
      // this gets resolved on `startServiceIfSynched`
      this.initBlockStream();
      this.setCurrentState(P2PClientState.SYNCHING);
      this.syncResolvers = promiseWithResolvers<void>();
      this.syncPromise = this.syncResolvers.promise;
      this.log.info(`Initiating p2p sync from ${syncedLatestBlock}`, {
        syncedLatestBlock,
        syncedProvenBlock,
        syncedFinalizedBlock,
      });
    } else {
      // if no blocks to be retrieved, go straight to running
      this.initBlockStream();
      this.setCurrentState(P2PClientState.RUNNING);
      this.syncPromise = Promise.resolve();
      await this.p2pService.start();
      this.log.info(`Starting P2P client synced to ${syncedLatestBlock}`, {
        syncedLatestBlock,
        syncedProvenBlock,
        syncedFinalizedBlock,
      });
    }

    // Should never happen: all branches above call initBlockStream()
    if (!this.blockStream) {
      throw new Error('Block stream not initialized');
    }
    this.blockStream.start();
    this.txFileStore?.start();

    return this.syncPromise;
  }

  addReqRespSubProtocol(subProtocol: ReqRespSubProtocol, handler: ReqRespSubProtocolHandler): Promise<void> {
    return this.p2pService.addReqRespSubProtocol(subProtocol, handler);
  }

  private initBlockStream(startingBlock?: BlockNumber) {
    if (!this.blockStream) {
      const { blockRequestBatchSize: batchSize, blockCheckIntervalMS: pollIntervalMS } = this.config;
      this.blockStream = new EventDrivenL2BlockStream(
        this.l2BlockSource,
        this,
        this,
        createLogger(`${this.log.module}:l2-block-stream`),
        { batchSize, pollIntervalMS, startingBlock },
      );
    }
  }

  /**
   * Allows consumers to stop the instance of the P2P client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.log.debug('Stopping p2p client...');
    await tryStop(this.txCollection);
    this.log.debug('Stopped tx collection service');
    await this.txFileStore?.stop();
    this.log.debug('Stopped tx file store');
    await this.p2pService.stop();
    this.log.debug('Stopped p2p service');
    await this.blockStream?.stop();
    this.log.debug('Stopped block downloader');
    await this.txPool.stop();
    this.log.debug('Stopped tx pool');
    await this.runningPromise;
    this.setCurrentState(P2PClientState.STOPPED);
    this.log.info('P2P client stopped');
  }

  /** Triggers a sync to the archiver. Used for testing. */
  public async sync() {
    this.initBlockStream();
    // Should never happen: initBlockStream() creates blockStream if absent
    if (!this.blockStream) {
      throw new Error('Block stream not initialized');
    }
    await this.blockStream.sync();
  }

  @trackSpan('p2pClient.broadcastProposal', async proposal => ({
    [Attributes.SLOT_NUMBER]: proposal.slotNumber,
    [Attributes.BLOCK_ARCHIVE]: proposal.archive.toString(),
    [Attributes.P2P_ID]: (await proposal.p2pMessageLoggingIdentifier()).toString(),
  }))
  public async broadcastProposal(proposal: BlockProposal): Promise<void> {
    this.log.verbose(`Broadcasting proposal for slot ${proposal.slotNumber} to peers`);
    // Store our own proposal so we can respond to req/resp requests for it
    const { count } = await this.attestationPool.tryAddBlockProposal(proposal);
    if (count > 1) {
      if (this.config.broadcastEquivocatedProposals) {
        this.log.warn(`Broadcasting equivocated block proposal for slot ${proposal.slotNumber}`, {
          slot: proposal.slotNumber,
          archive: proposal.archive.toString(),
          count,
        });
      } else {
        throw new Error(`Attempted to broadcast a duplicate block proposal for slot ${proposal.slotNumber}`);
      }
    }
    return this.p2pService.propagate(proposal);
  }

  @trackSpan('p2pClient.broadcastCheckpointProposal', async proposal => ({
    [Attributes.SLOT_NUMBER]: proposal.slotNumber,
    [Attributes.BLOCK_ARCHIVE]: proposal.archive.toString(),
    [Attributes.P2P_ID]: (await proposal.p2pMessageLoggingIdentifier()).toString(),
  }))
  public async broadcastCheckpointProposal(proposal: CheckpointProposal): Promise<void> {
    this.log.verbose(`Broadcasting checkpoint proposal for slot ${proposal.slotNumber} to peers`);
    const blockProposal = proposal.getBlockProposal();
    if (blockProposal) {
      // Store our own last-block proposal so we can respond to req/resp requests for it.
      await this.attestationPool.tryAddBlockProposal(blockProposal);
    }
    const checkpointCore = proposal.toCore();
    const { count } = await this.attestationPool.tryAddCheckpointProposal(checkpointCore);
    if (count > 1) {
      if (this.config.broadcastEquivocatedProposals) {
        this.log.warn(`Broadcasting equivocated checkpoint proposal for slot ${proposal.slotNumber}`, {
          slot: proposal.slotNumber,
          archive: proposal.archive.toString(),
          count,
        });
      } else {
        throw new Error(`Attempted to broadcast a duplicate checkpoint proposal for slot ${proposal.slotNumber}`);
      }
    }
    return this.p2pService.propagate(proposal);
  }

  public async broadcastCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    this.log.verbose(`Broadcasting ${attestations.length} checkpoint attestations to peers`);
    await Promise.all(attestations.map(att => this.p2pService.propagate(att)));
  }

  public async getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    return await (proposalPayloadHash
      ? this.attestationPool.getCheckpointAttestationsForSlotAndProposal(slot, proposalPayloadHash)
      : this.attestationPool.getCheckpointAttestationsForSlot(slot));
  }

  public addOwnCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    return this.attestationPool.addOwnCheckpointAttestations(attestations);
  }

  public getProposalsForSlot(slot: SlotNumber): Promise<ProposalsForSlot> {
    return this.attestationPool.getProposalsForSlot(slot);
  }

  public hasBlockProposalsForSlot(slot: SlotNumber): Promise<boolean> {
    return this.attestationPool.hasBlockProposalsForSlot(slot);
  }

  public hasCheckpointProposalForSlot(slot: SlotNumber): Promise<boolean> {
    return this.attestationPool.hasCheckpointProposalForSlot(slot);
  }

  // REVIEW: https://github.com/AztecProtocol/aztec-packages/issues/7963
  // ^ This pattern is not my favorite (md)
  public registerBlockProposalHandler(handler: P2PBlockReceivedCallback): void {
    this.p2pService.registerBlockReceivedCallback(handler);
  }

  public registerValidatorCheckpointProposalHandler(handler: P2PCheckpointReceivedCallback): void {
    this.p2pService.registerValidatorCheckpointReceivedCallback(handler);
  }

  public registerAllNodesCheckpointProposalHandler(handler: P2PCheckpointReceivedCallback): void {
    this.p2pService.registerAllNodesCheckpointReceivedCallback(handler);
  }

  public registerDuplicateProposalCallback(callback: (info: DuplicateProposalInfo) => void): void {
    this.p2pService.registerDuplicateProposalCallback(callback);
  }

  public registerOversizedProposalCallback(callback: (info: OversizedProposalInfo) => void): void {
    this.p2pService.registerOversizedProposalCallback(callback);
  }

  public registerDuplicateAttestationCallback(callback: (info: DuplicateAttestationInfo) => void): void {
    this.p2pService.registerDuplicateAttestationCallback(callback);
  }

  public registerCheckpointAttestationCallback(callback: (attestation: CheckpointAttestation) => void): void {
    this.p2pService.registerCheckpointAttestationCallback(callback);
  }

  public async getPendingTxs(limit?: number, after?: TxHash, options?: GetTxByHashOptions): Promise<Tx[]> {
    if (limit !== undefined && limit <= 0) {
      throw new TypeError('limit must be greater than 0');
    }

    let txHashes = await this.txPool.getPendingTxHashes();

    let startIndex = 0;
    if (after) {
      startIndex = txHashes.findIndex(txHash => after.equals(txHash));
      if (startIndex === -1) {
        return [];
      }
      startIndex++;
    }

    const endIndex = limit !== undefined ? startIndex + limit : undefined;
    txHashes = txHashes.slice(startIndex, endIndex);

    // This is a public-facing API (exposed via both the node and the p2p RPC), so proofs are opt-in.
    const includeProof = !!options?.includeProof;
    const maybeTxs = await Promise.all(txHashes.map(txHash => this.txPool.getTxByHash(txHash, { includeProof })));
    return maybeTxs.filter((tx): tx is Tx => !!tx);
  }

  public getPendingTxCount(): Promise<number> {
    return this.txPool.getPendingTxCount();
  }

  public hasEligiblePendingTxs(minCount: number): Promise<boolean> {
    return this.txPool.hasEligiblePendingTxs(minCount);
  }

  public async *iteratePendingTxs(opts?: { includeProof?: boolean }): AsyncIterableIterator<Tx> {
    for (const txHash of await this.txPool.getPendingTxHashes()) {
      const tx = await this.txPool.getTxByHash(txHash, opts);
      if (tx) {
        yield tx;
      }
    }
  }

  public async *iterateEligiblePendingTxs(opts?: { includeProof?: boolean }): AsyncIterableIterator<Tx> {
    for (const txHash of await this.txPool.getEligiblePendingTxHashes()) {
      const tx = await this.txPool.getTxByHash(txHash, opts);
      if (tx) {
        yield tx;
      }
    }
  }

  /**
   * Returns a transaction in the transaction pool by its hash.
   * @param txHash - Hash of the transaction to look for in the pool.
   * @param opts - Set `includeProof: false` to skip loading the tx proof from the DB.
   * @returns A single tx or undefined.
   */
  getTxByHashFromPool(txHash: TxHash, opts?: { includeProof?: boolean }): Promise<Tx | undefined> {
    return this.txPool.getTxByHash(txHash, opts);
  }

  /**
   * Returns transactions in the transaction pool by hash.
   * @param txHashes - Hashes of the transactions to look for.
   * @param opts - Set `includeProof: false` to skip loading tx proofs from the DB.
   * @returns The txs found, in the same order as the requested hashes. If a tx is not found, it will be undefined.
   */
  getTxsByHashFromPool(txHashes: TxHash[], opts?: { includeProof?: boolean }): Promise<(Tx | undefined)[]> {
    return this.txPool.getTxsByHash(txHashes, opts);
  }

  hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]> {
    return this.txPool.hasTxs(txHashes);
  }

  /**
   * Returns an archived transaction in the transaction pool by its hash.
   * @param txHash - Hash of the archived transaction to look for.
   * @returns A single tx or undefined.
   */
  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.txPool.getArchivedTxByHash(txHash);
  }

  /**
   * Accepts a transaction, adds it to local tx pool and forwards it to other peers.
   * @param tx - The tx to send.
   * @returns Empty promise.
   **/
  public async sendTx(tx: Tx): Promise<void> {
    this.#assertIsReady();
    const result = await this.txPool.addPendingTxs([tx], { feeComparisonOnly: true });
    if (result.accepted.length === 1) {
      await this.p2pService.propagate(tx);
      return;
    }

    const txHashStr = tx.getTxHash().toString();
    const reason = result.errors?.get(txHashStr);
    if (reason) {
      this.log.warn(`Tx ${txHashStr} not added to pool: ${reason.message}`);
      throw new TxPoolError(reason);
    }

    this.log.warn(
      `Tx ${txHashStr} not propagated: accepted=${result.accepted.length} ignored=${result.ignored.length} rejected=${result.rejected.length}`,
    );
  }

  /**
   * Returns whether the given tx hash is flagged as pending or mined.
   * @param txHash - Hash of the tx to query.
   * @returns Pending or mined depending on its status, or undefined if not found.
   */
  public async getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | 'deleted' | undefined> {
    const status = await this.txPool.getTxStatus(txHash);
    return status === 'protected' ? 'pending' : status;
  }

  public getEnr(): ENR | undefined {
    return this.p2pService.getEnr();
  }

  public getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve(this.p2pService.getEnr()?.encodeTxt());
  }

  /**
   * Handles failed transaction execution by removing txs from the pool.
   * @param txHashes - Hashes of the transactions that failed execution.
   **/
  public async handleFailedExecution(txHashes: TxHash[]): Promise<void> {
    this.#assertIsReady();
    await this.txPool.handleFailedExecution(txHashes);
  }

  /**
   * Public function to check if the p2p client is fully synced and ready to receive txs.
   * @returns True if the P2P client is ready to receive txs.
   */
  public isReady() {
    return this.currentState === P2PClientState.RUNNING;
  }

  /**
   * Public function to check the latest block number that the P2P client is synced to.
   * @returns Block number of latest L2 Block we've synced with.
   */
  public async getSyncedLatestBlockNum(): Promise<BlockNumber> {
    const tips = await this.l2Tips.getL2Tips();
    return tips.proposed.number;
  }

  /**
   * Public function to check the latest proven block number that the P2P client is synced to.
   * @returns Block number of latest proven L2 Block we've synced with.
   */
  public async getSyncedProvenBlockNum(): Promise<BlockNumber> {
    const tips = await this.l2Tips.getL2Tips();
    return tips.proven.block.number;
  }

  public async getSyncedFinalizedBlockNum(): Promise<BlockNumber> {
    const tips = await this.l2Tips.getL2Tips();
    return tips.finalized.block.number;
  }

  /** Returns latest L2 slot for which we have seen an L2 block. */
  public async getSyncedLatestSlot(): Promise<bigint> {
    return (await this.synchedLatestSlot.getAsync()) ?? BigInt(0);
  }

  /**
   * Method to check the status the p2p client.
   * @returns Information about p2p client status: state & syncedToBlockNum.
   */
  public async getStatus(): Promise<P2PSyncState> {
    const blockNumber = await this.getSyncedLatestBlockNum();
    const blockHash = await this.l2BlockSource
      .getBlockData({ number: blockNumber })
      .then(data => data?.header.hash())
      .then(hash => hash?.toString());

    return {
      state: this.currentState,
      syncedToL2Block: { number: blockNumber, hash: blockHash! },
    };
  }

  /**
   * Handles mined blocks by marking the txs in them as mined.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   * @returns Empty promise.
   */
  private async handleMinedBlocks(blocks: L2Block[]): Promise<void> {
    for (const block of blocks) {
      await this.txPool.handleMinedBlock(block);
    }
  }

  /**
   * Handles new mined blocks by marking the txs in them as mined.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   * @returns Empty promise.
   */
  private async handleLatestL2Blocks(blocks: L2Block[]): Promise<void> {
    if (!blocks.length) {
      return;
    }

    const lastBlock = blocks.at(-1)!;
    const lastSlot = lastBlock.header.getSlot();

    // Mark txs mined before releasing protections: a block landing at this slot supersedes any
    // protection for txs it includes, so mined-marking must run first to keep just-landed txs from
    // being unprotected into pending where they could be evicted before they are recorded as mined.
    await this.handleMinedBlocks(blocks);
    await this.maybeCallPrepareForSlot(lastSlot);
    await this.collectingMissingTxs(blocks);
    await this.synchedLatestSlot.set(BigInt(lastSlot));
  }

  /** Request txs for unproven blocks so the prover node can prove. */
  private async collectingMissingTxs(blocks: L2Block[]): Promise<void> {
    try {
      // TODO(#15435): If the archiver has lagged behind L1, the reported proven block number may
      // be much lower than the actual one, and it does not update until the pending chain is
      // fully synced. This could lead to a ton of tx collection requests for blocks that
      // are already proven, but the archiver has not yet updated its state. Until this is properly
      // fixed, it is mitigated by the expiration date of collection requests, which depends on
      // the slot number of the block.
      const provenBlockNumber = (await this.l2BlockSource.getBlockNumber({ tag: 'proven' })) ?? BlockNumber.ZERO;
      const unprovenBlocks = blocks.filter(block => block.number > provenBlockNumber);
      for (const block of unprovenBlocks) {
        const txHashes = block.body.txEffects.map(txEffect => txEffect.txHash);
        const missingTxHashes = await this.txPool
          .hasTxs(txHashes)
          .then(availability => txHashes.filter((_, index) => !availability[index]));
        if (missingTxHashes.length > 0) {
          this.log.verbose(
            `Starting collection of ${missingTxHashes.length} missing txs for unproven mined block ${block.number}`,
            { missingTxHashes, blockNumber: block.number, blockHash: await block.hash().then(h => h.toString()) },
          );
          // Both `slashDataWithholdingToleranceSlots` and `p2pMissingTxCollectionDeadlineSlots`
          // count *full slots after the block slot* — value N means collection runs until
          // `slotStart(block.slot + N + 1)`. Take the larger of the two so collection never
          // gives up before the data-withholding slash verdict is rendered.
          const blockSlot = block.header.getSlot();
          const toleranceSlots = this.config.slashDataWithholdingToleranceSlots;
          const configuredSlots = this.config.p2pMissingTxCollectionDeadlineSlots ?? 0;
          const deadlineSlot = SlotNumber(blockSlot + Math.max(toleranceSlots, configuredSlots) + 1);
          const deadlineSeconds = getTimestampForSlot(deadlineSlot, this.epochCache.getL1Constants());
          const deadline = new Date(Number(deadlineSeconds) * 1000);
          await this.txCollection.collectFastForBlock(block, missingTxHashes, { deadline });
        }
      }
    } catch (err) {
      this.log.error(`Error while starting collection of missing txs for unproven blocks`, err);
    }
  }

  /**
   * Handles new finalized blocks by deleting the txs and attestations in them.
   * @param blocks - A list of finalized L2 blocks.
   * @returns Empty promise.
   */
  private async handleFinalizedL2Blocks(blocks: BlockData[]): Promise<void> {
    if (!blocks.length) {
      return;
    }

    // Finalization is monotonic, so we only need to call with the last block
    const lastBlock = blocks.at(-1)!;
    await this.txPool.handleFinalizedBlock(lastBlock.header);
    await this.attestationPool.deleteOlderThan(lastBlock.header.getSlot());
  }

  /**
   * Updates the tx pool after a chain prune.
   * Detects epoch prunes (checkpoint number changed) and deletes all txs in that case.
   * @param latestBlock - The block ID the chain was pruned to.
   * @param newCheckpoint - The checkpoint ID after the prune.
   */
  private async handlePruneL2Blocks(latestBlock: L2BlockId, newCheckpoint: CheckpointId): Promise<void> {
    const deleteAllTxs = this.config.txPoolDeleteTxsAfterReorg && (await this.isEpochPrune(newCheckpoint));
    await this.txPool.handlePrunedBlocks(latestBlock, { deleteAllTxs });
  }

  /**
   * Returns true if the prune is an epoch prune (new checkpoint number is less than old).
   * If the checkpoint number stays the same or increases, the prune is within a checkpoint.
   */
  private async isEpochPrune(newCheckpoint: CheckpointId): Promise<boolean> {
    const tips = await this.l2Tips.getL2Tips();
    const oldCheckpointNumber = tips.checkpointed.checkpoint.number;
    if (oldCheckpointNumber <= CheckpointNumber.INITIAL) {
      return false;
    }
    const newCheckpointNumber = newCheckpoint.number;
    // We check that the new checkpoint number is less than the old checkpoint number in order to consider it an epoch prune.
    // To be more certain that it is an epoch prune, we will check that at least 2 checkpoints were removed.
    // This means we should avoid thinking checkpoints removed by L1 re-orgs are epoch prunes
    const thresholdForEpochPrune = CheckpointNumber(oldCheckpointNumber - 2);
    const isEpochPrune = newCheckpointNumber <= thresholdForEpochPrune;
    if (isEpochPrune) {
      this.log.info(`Detected epoch prune to ${newCheckpointNumber}`, {
        oldCheckpointNumber,
        newCheckpointNumber,
        thresholdForEpochPrune,
      });
    }
    return isEpochPrune;
  }

  /** Calls prepareForSlot for the given slot if it advances past the last slot we prepared for. */
  private async maybeCallPrepareForSlot(slot: SlotNumber): Promise<void> {
    if (slot <= this.lastSlotProcessed) {
      return;
    }
    this.lastSlotProcessed = slot;
    await this.txPool.prepareForSlot(slot);
  }

  private async startServiceIfSynched() {
    if (this.currentState !== P2PClientState.SYNCHING) {
      return;
    }
    const tips = await this.l2Tips.getL2Tips();
    const syncedFinalizedBlock = tips.finalized.block.number;
    const syncedProvenBlock = tips.proven.block.number;
    const syncedLatestBlock = tips.proposed.number;

    if (
      syncedLatestBlock >= this.latestBlockNumberAtStart &&
      syncedProvenBlock >= this.provenBlockNumberAtStart &&
      syncedFinalizedBlock >= this.finalizedBlockNumberAtStart
    ) {
      this.log.info(`Completed P2P client sync to block ${syncedLatestBlock}. Starting service.`, {
        syncedLatestBlock,
        syncedProvenBlock,
        syncedFinalizedBlock,
      });
      this.setCurrentState(P2PClientState.RUNNING);
      if (this.syncResolvers !== undefined) {
        // A throw here would be swallowed by the block stream event handler, so we reject the promise returned by
        // start instead, which makes node startup fail rather than run on with a dead p2p stack.
        try {
          await this.p2pService.start();
        } catch (err) {
          this.log.fatal(`Failed to start p2p service`, { err, syncedLatestBlock });
          this.syncResolvers.reject(err);
          return;
        }
        this.syncResolvers.resolve();
      }
    }
  }

  /**
   * Method to set the value of the current state.
   * @param newState - New state value.
   */
  private setCurrentState(newState: P2PClientState) {
    const oldState = this.currentState;
    this.currentState = newState;
    this.log.debug(`Moved from state ${P2PClientState[oldState]} to ${P2PClientState[this.currentState]}`);
  }

  public validateTxsReceivedInBlockProposal(txs: Tx[]): Promise<void> {
    return this.p2pService.validateTxsReceivedInBlockProposal(txs);
  }

  /**
   * Protects existing transactions by hash for a given slot.
   * Returns hashes of transactions that weren't found in the pool.
   * @param txHashes - Hashes of the transactions to protect.
   * @param blockHeader - The block header providing slot context.
   * @returns Hashes of transactions not found in the pool.
   */
  public protectTxs(txHashes: TxHash[], blockHeader: BlockHeader): Promise<TxHash[]> {
    return this.txPool.protectTxs(txHashes, blockHeader);
  }

  /**
   * Prepares the pool for a new slot.
   * Unprotects transactions from earlier slots and validates them.
   * @param slotNumber - The slot number to prepare for
   */
  public async prepareForSlot(slotNumber: SlotNumber): Promise<void> {
    await this.txPool.prepareForSlot(slotNumber);
  }

  public handleAuthRequestFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage> {
    return this.p2pService.handleAuthRequestFromPeer(authRequest, peerId);
  }
}
