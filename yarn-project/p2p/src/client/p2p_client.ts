import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import {
  type EthAddress,
  type L2Block,
  type L2BlockId,
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2Tips,
  type L2TipsStore,
} from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { type PeerInfo, tryStop } from '@aztec/stdlib/interfaces/server';
import {
  type BlockProposal,
  CheckpointAttestation,
  type CheckpointProposal,
  type P2PClientType,
} from '@aztec/stdlib/p2p';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import { Attributes, type TelemetryClient, WithTracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';
import type { ENR } from '@nethermindeth/enr';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import type { AttestationPoolApi } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPoolV2 } from '../mem_pools/tx_pool_v2/interfaces.js';
import type { AuthRequest, StatusMessage } from '../services/index.js';
import {
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandler,
  type ReqRespSubProtocolValidators,
} from '../services/reqresp/interface.js';
import { chunkTxHashesRequest } from '../services/reqresp/protocols/tx.js';
import type {
  DuplicateProposalInfo,
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
export class P2PClient<T extends P2PClientType = P2PClientType.Full>
  extends WithTracer
  implements P2P, P2P<P2PClientType.Prover>
{
  /** The JS promise that will be running to keep the client's data in sync. Can be interrupted if the client is stopped. */
  private runningPromise!: Promise<void>;

  private currentState = P2PClientState.IDLE;
  private syncPromise = Promise.resolve();
  private syncResolve?: () => void = undefined;
  private latestBlockNumberAtStart = -1;
  private provenBlockNumberAtStart = -1;
  private finalizedBlockNumberAtStart = -1;

  private l2Tips: L2TipsStore;
  private synchedLatestSlot: AztecAsyncSingleton<bigint>;

  private txPool: TxPoolV2;
  private attestationPool: AttestationPoolApi;

  private config: P2PConfig;

  private blockStream: L2BlockStream | undefined;

  private txProvider: TxProvider;

  private validatorAddresses: EthAddress[] = [];

  /** Tracks the last slot for which we called prepareForSlot */
  private lastSlotProcessed: SlotNumber = SlotNumber(0);

  /**
   * In-memory P2P client constructor.
   * @param store - The client's instance of the KV store.
   * @param l2BlockSource - P2P client's source for fetching existing blocks.
   * @param txPool - The client's instance of a transaction pool. Defaults to in-memory implementation.
   * @param p2pService - The concrete instance of p2p networking to use.
   * @param log - A logger.
   */
  constructor(
    _clientType: T,
    private store: AztecAsyncKVStore,
    private l2BlockSource: L2BlockSource & ContractDataSource,
    mempools: MemPools,
    private p2pService: P2PService,
    private txCollection: TxCollection,
    private txFileStore: TxFileStore | undefined,
    private epochCache: EpochCacheInterface | undefined,
    config: Partial<P2PConfig> = {},
    private _dateProvider: DateProvider = new DateProvider(),
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p'),
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

    // Default to collecting all txs when we see a valid proposal
    // This can be overridden by the validator client to validate, and it will call getTxsForBlockProposal on its own
    // Note: Validators do NOT attest to individual blocks - attestations are only for checkpoint proposals.
    // TODO(palla/txs): We should not trigger a request for txs on a proposal before fully validating it. We need to bring
    // validator-client code into here so we can validate a proposal is reasonable.
    this.registerBlockProposalHandler(async (block, sender) => {
      this.log.debug(`Received block proposal from ${sender.toString()}`);
      // TODO(palla/txs): Need to subtract validatorReexecuteDeadlineMs from this deadline (see ValidatorClient.getReexecutionDeadline)
      const constants = this.txCollection.getConstants();
      const nextSlotTimestampSeconds = Number(getTimestampForSlot(SlotNumber(block.slotNumber + 1), constants));
      const deadline = new Date(nextSlotTimestampSeconds * 1000);
      const parentBlock = await this.l2BlockSource.getBlockHeaderByArchive(block.blockHeader.lastArchive.root);
      if (!parentBlock) {
        this.log.debug(`Cannot collect txs for proposal as parent block not found`);
        return false;
      }
      const blockNumber = BlockNumber(parentBlock.getBlockNumber() + 1);
      await this.txProvider.getTxsForBlockProposal(block, blockNumber, { pinnedPeer: sender, deadline });
      return true;
    });

    this.l2Tips = new L2TipsKVStore(store, 'p2p_client');
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

  public getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    return this.l2Tips.getL2BlockHash(number);
  }

  public async updateP2PConfig(config: Partial<P2PConfig>): Promise<void> {
    await this.txPool.updateConfig(config);
    this.p2pService.updateConfig(config);
  }

  public getL2Tips(): Promise<L2Tips> {
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
          const oldBlocks = await this.l2BlockSource.getBlocks(from, limit);
          await this.handleFinalizedL2Blocks(oldBlocks);
        }
        break;
      }
      case 'chain-proven':
        this.txCollection.stopCollectingForBlocksUpTo(event.block.number);
        break;
      case 'chain-pruned':
        this.txCollection.stopCollectingForBlocksAfter(event.block.number);
        await this.handlePruneL2Blocks(event.block);
        break;
      case 'chain-checkpointed':
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
    // this.log.info('Checking if p2p client is ready, current state: ', this.currentState);
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
      this.syncPromise = new Promise(resolve => {
        this.syncResolve = resolve;
      });
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

    this.blockStream!.start();
    await this.txCollection.start();
    this.txFileStore?.start();
    return this.syncPromise;
  }

  addReqRespSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void> {
    return this.p2pService.addReqRespSubProtocol(subProtocol, handler, validator);
  }

  private initBlockStream(startingBlock?: BlockNumber) {
    if (!this.blockStream) {
      const { blockRequestBatchSize: batchSize, blockCheckIntervalMS: pollIntervalMS } = this.config;
      this.blockStream = new L2BlockStream(
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
    await this.blockStream!.sync();
  }

  @trackSpan('p2pClient.broadcastProposal', async proposal => ({
    [Attributes.SLOT_NUMBER]: proposal.slotNumber,
    [Attributes.BLOCK_ARCHIVE]: proposal.archive.toString(),
    [Attributes.P2P_ID]: (await proposal.p2pMessageLoggingIdentifier()).toString(),
  }))
  public async broadcastProposal(proposal: BlockProposal): Promise<void> {
    this.log.verbose(`Broadcasting proposal for slot ${proposal.slotNumber} to peers`);
    // Store our own proposal so we can respond to req/resp requests for it
    const { totalForPosition } = await this.attestationPool.tryAddBlockProposal(proposal);
    if (totalForPosition > 1) {
      throw new Error(`Attempted to broadcast a duplicate block proposal for slot ${proposal.slotNumber}`);
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
    return this.p2pService.propagate(proposal);
  }

  public async broadcastCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    this.log.verbose(`Broadcasting ${attestations.length} checkpoint attestations to peers`);
    await Promise.all(attestations.map(att => this.p2pService.propagate(att)));
  }

  public async getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalId?: string,
  ): Promise<CheckpointAttestation[]> {
    return await (proposalId
      ? this.attestationPool.getCheckpointAttestationsForSlotAndProposal(slot, proposalId)
      : this.attestationPool.getCheckpointAttestationsForSlot(slot));
  }

  public addOwnCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    return this.attestationPool.addOwnCheckpointAttestations(attestations);
  }

  // REVIEW: https://github.com/AztecProtocol/aztec-packages/issues/7963
  // ^ This pattern is not my favorite (md)
  public registerBlockProposalHandler(handler: P2PBlockReceivedCallback): void {
    this.p2pService.registerBlockReceivedCallback(handler);
  }

  public registerCheckpointProposalHandler(handler: P2PCheckpointReceivedCallback): void {
    this.p2pService.registerCheckpointReceivedCallback(handler);
  }

  public registerDuplicateProposalCallback(callback: (info: DuplicateProposalInfo) => void): void {
    this.p2pService.registerDuplicateProposalCallback(callback);
  }

  /**
   * Uses the batched Request Response protocol to request a set of transactions from the network.
   */
  private async requestTxsByHash(txHashes: TxHash[], pinnedPeerId: PeerId | undefined): Promise<Tx[]> {
    const timeoutMs = 8000; // Longer timeout for now
    const maxRetryAttempts = 10; // Keep retrying within the timeout
    const requests = chunkTxHashesRequest(txHashes);
    const maxPeers = Math.min(Math.ceil(requests.length / 3), 10);

    const txBatches = await this.p2pService.sendBatchRequest(
      ReqRespSubProtocol.TX,
      requests,
      pinnedPeerId,
      timeoutMs,
      maxPeers,
      maxRetryAttempts,
    );

    const txs = txBatches.flat();
    if (txs.length > 0) {
      await this.txPool.addPendingTxs(txs);
    }

    const txHashesStr = txHashes.map(tx => tx.toString()).join(', ');
    this.log.debug(`Requested txs ${txHashesStr} (${txs.length} / ${txHashes.length}) from peers`);

    // We return all transactions, even the not found ones to the caller, such they can handle missing items themselves.
    return txs;
  }

  public async getPendingTxs(limit?: number, after?: TxHash): Promise<Tx[]> {
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

    const maybeTxs = await Promise.all(txHashes.map(txHash => this.txPool.getTxByHash(txHash)));
    return maybeTxs.filter((tx): tx is Tx => !!tx);
  }

  public getPendingTxCount(): Promise<number> {
    return this.txPool.getPendingTxCount();
  }

  public async *iteratePendingTxs(): AsyncIterableIterator<Tx> {
    for (const txHash of await this.txPool.getPendingTxHashes()) {
      const tx = await this.txPool.getTxByHash(txHash);
      if (tx) {
        yield tx;
      }
    }
  }

  /**
   * Returns a transaction in the transaction pool by its hash.
   * @param txHash - Hash of the transaction to look for in the pool.
   * @returns A single tx or undefined.
   */
  getTxByHashFromPool(txHash: TxHash): Promise<Tx | undefined> {
    return this.txPool.getTxByHash(txHash);
  }

  /**
   * Returns transactions in the transaction pool by hash.
   * @param txHashes - Hashes of the transactions to look for.
   * @returns The txs found, in the same order as the requested hashes. If a tx is not found, it will be undefined.
   */
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.txPool.getTxsByHash(txHashes);
  }

  hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]> {
    return this.txPool.hasTxs(txHashes);
  }

  /**
   * Returns transactions in the transaction pool by hash.
   * If a transaction is not in the pool, it will be requested from the network.
   * @param txHashes - Hashes of the transactions to look for.
   * @returns The txs found, or undefined if not found in the order requested.
   */
  async getTxsByHash(txHashes: TxHash[], pinnedPeerId: PeerId | undefined): Promise<(Tx | undefined)[]> {
    const txs = await Promise.all(txHashes.map(txHash => this.txPool.getTxByHash(txHash)));
    const missingTxHashes = txs
      .map((tx, index) => [tx, index] as const)
      .filter(([tx, _index]) => !tx)
      .map(([_tx, index]) => txHashes[index]);

    if (missingTxHashes.length === 0) {
      return txs as Tx[];
    }

    const missingTxs = await this.requestTxsByHash(missingTxHashes, pinnedPeerId);
    // TODO: optimize
    // Merge the found txs in order
    const mergingTxs = txHashes.map(txHash => {
      // Is it in the txs list from the mempool?
      for (const tx of txs) {
        if (tx !== undefined && tx.getTxHash().equals(txHash)) {
          return tx;
        }
      }

      // Is it in the fetched missing txs?
      // Note: this is an O(n^2) operation, but we expect the number of missing txs to be small.
      for (const tx of missingTxs) {
        if (tx.getTxHash().equals(txHash)) {
          return tx;
        }
      }

      // Otherwise return undefined
      return undefined;
    });

    return mergingTxs;
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
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   * @param tx - The tx to verify.
   * @returns Empty promise.
   **/
  public async sendTx(tx: Tx): Promise<void> {
    const addedCount = await this.addTxsToPool([tx]);
    const txAddedSuccessfully = addedCount === 1;
    if (txAddedSuccessfully) {
      await this.p2pService.propagate(tx);
    }
  }

  /**
   * Adds transactions to the pool. Does not send to peers or validate the txs.
   * @param txs - The transactions.
   **/
  public async addTxsToPool(txs: Tx[]): Promise<number> {
    this.#assertIsReady();
    return (await this.txPool.addPendingTxs(txs)).accepted.length;
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
    const blockHash =
      blockNumber === 0
        ? GENESIS_BLOCK_HEADER_HASH.toString()
        : await this.l2BlockSource
            .getBlockHeader(blockNumber)
            .then(header => header?.hash())
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

    await this.handleMinedBlocks(blocks);
    await this.maybeCallPrepareForSlot();
    await this.startCollectingMissingTxs(blocks);
    const lastBlock = blocks.at(-1)!;
    await this.synchedLatestSlot.set(BigInt(lastBlock.header.getSlot()));
  }

  /** Request txs for unproven blocks so the prover node has more chances to get them. */
  private async startCollectingMissingTxs(blocks: L2Block[]): Promise<void> {
    try {
      // TODO(#15435): If the archiver has lagged behind L1, the reported proven block number may
      // be much lower than the actual one, and it does not update until the pending chain is
      // fully synced. This could lead to a ton of tx collection requests for blocks that
      // are already proven, but the archiver has not yet updated its state. Until this is properly
      // fixed, it is mitigated by the expiration date of collection requests, which depends on
      // the slot number of the block.
      const provenBlockNumber = await this.l2BlockSource.getProvenBlockNumber();
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
          this.txCollection.startCollecting(block, missingTxHashes);
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
  private async handleFinalizedL2Blocks(blocks: L2Block[]): Promise<void> {
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
   * @param latestBlock - The block ID the chain was pruned to.
   */
  private async handlePruneL2Blocks(latestBlock: L2BlockId): Promise<void> {
    await this.txPool.handlePrunedBlocks(latestBlock);
  }

  /** Checks if the slot has changed and calls prepareForSlot if so. */
  private async maybeCallPrepareForSlot(): Promise<void> {
    if (!this.epochCache) {
      return;
    }
    const { currentSlot } = this.epochCache.getCurrentAndNextSlot();
    if (currentSlot > this.lastSlotProcessed) {
      this.lastSlotProcessed = currentSlot;
      await this.txPool.prepareForSlot(currentSlot);
    }
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
      if (this.syncResolve !== undefined) {
        this.syncResolve();
        await this.p2pService.start();
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

  public validate(txs: Tx[]): Promise<void> {
    return this.p2pService.validate(txs);
  }

  /**
   * Protects existing transactions by hash for a given slot.
   * Returns hashes of transactions that weren't found in the pool.
   * @param txHashes - Hashes of the transactions to protect.
   * @param blockHeader - The block header providing slot context.
   * @returns Hashes of transactions not found in the pool.
   */
  public async protectTxs(txHashes: TxHash[], blockHeader: BlockHeader): Promise<TxHash[]> {
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
