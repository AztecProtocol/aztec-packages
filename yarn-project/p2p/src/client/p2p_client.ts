import {
  type BlockAttestation,
  type BlockProposal,
  type L2Block,
  type L2BlockId,
  type L2BlockSource,
  type L2BlockStreamEvent,
  type L2Tips,
  type P2PApi,
  type P2PClientType,
  type PeerInfo,
  type ProverCoordination,
  type Tx,
  type TxHash,
} from '@aztec/circuit-types';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js/constants';
import { createLogger } from '@aztec/foundation/log';
import { type AztecAsyncKVStore, type AztecAsyncMap, type AztecAsyncSingleton } from '@aztec/kv-store';
import {
  Attributes,
  type TelemetryClient,
  TraceableL2BlockStream,
  WithTracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import { type ENR } from '@chainsafe/enr';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { type MemPools } from '../mem_pools/interface.js';
import { type TxPool } from '../mem_pools/tx_pool/index.js';
import { ReqRespSubProtocol } from '../services/reqresp/interface.js';
import type { P2PService } from '../services/service.js';

/**
 * Enum defining the possible states of the p2p client.
 */
export enum P2PClientState {
  IDLE,
  SYNCHING,
  RUNNING,
  STOPPED,
}

/**
 * The synchronization status of the P2P client.
 */
export interface P2PSyncState {
  /**
   * The current state of the p2p client.
   */
  state: P2PClientState;
  /**
   * The block number that the p2p client is synced to.
   */
  syncedToL2Block: L2BlockId;
}

/**
 * Interface of a P2P client.
 **/
export type P2P<T extends P2PClientType = P2PClientType.Full> = ProverCoordination &
  P2PApi<T> & {
    /**
     * Broadcasts a block proposal to other peers.
     *
     * @param proposal - the block proposal
     */
    broadcastProposal(proposal: BlockProposal): void;

    /**
     * Registers a callback from the validator client that determines how to behave when
     * foreign block proposals are received
     *
     * @param handler - A function taking a received block proposal and producing an attestation
     */
    // REVIEW: https://github.com/AztecProtocol/aztec-packages/issues/7963
    // ^ This pattern is not my favorite (md)
    registerBlockProposalHandler(handler: (block: BlockProposal) => Promise<BlockAttestation | undefined>): void;

    /**
     * Request a list of transactions from another peer by their tx hashes.
     * @param txHashes - Hashes of the txs to query.
     * @returns A list of transactions or undefined if the transactions are not found.
     */
    requestTxs(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;

    /**
     * Request a transaction from another peer by its tx hash.
     * @param txHash - Hash of the tx to query.
     */
    requestTxByHash(txHash: TxHash): Promise<Tx | undefined>;

    /**
     * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
     * @param tx - The transaction.
     **/
    sendTx(tx: Tx): Promise<void>;

    /**
     * Deletes 'txs' from the pool, given hashes.
     * NOT used if we use sendTx as reconcileTxPool will handle this.
     * @param txHashes - Hashes to check.
     **/
    deleteTxs(txHashes: TxHash[]): Promise<void>;

    /**
     * Returns a transaction in the transaction pool by its hash.
     * @param txHash  - Hash of tx to return.
     * @returns A single tx or undefined.
     */
    getTxByHashFromPool(txHash: TxHash): Promise<Tx | undefined>;

    /**
     * Returns a transaction in the transaction pool by its hash, requesting it from the network if it is not found.
     * @param txHash  - Hash of tx to return.
     * @returns A single tx or undefined.
     */
    getTxByHash(txHash: TxHash): Promise<Tx | undefined>;

    /**
     * Returns an archived transaction from the transaction pool by its hash.
     * @param txHash  - Hash of tx to return.
     * @returns A single tx or undefined.
     */
    getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined>;

    /**
     * Returns whether the given tx hash is flagged as pending or mined.
     * @param txHash - Hash of the tx to query.
     * @returns Pending or mined depending on its status, or undefined if not found.
     */
    getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | undefined>;

    /** Returns an iterator over pending txs on the mempool. */
    iteratePendingTxs(): AsyncIterableIterator<Tx>;

    /** Returns the number of pending txs in the mempool. */
    getPendingTxCount(): Promise<number>;

    /**
     * Starts the p2p client.
     * @returns A promise signalling the completion of the block sync.
     */
    start(): Promise<void>;

    /**
     * Stops the p2p client.
     * @returns A promise signalling the completion of the stop process.
     */
    stop(): Promise<void>;

    /**
     * Indicates if the p2p client is ready for transaction submission.
     * @returns A boolean flag indicating readiness.
     */
    isReady(): boolean;

    /**
     * Returns the current status of the p2p client.
     */
    getStatus(): Promise<P2PSyncState>;

    /**
     * Returns the ENR of this node, if any.
     */
    getEnr(): ENR | undefined;

    /** Identifies a p2p client. */
    isP2PClient(): true;
  };

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

  private synchedBlockHashes: AztecAsyncMap<number, string>;
  private synchedLatestBlockNumber: AztecAsyncSingleton<number>;
  private synchedProvenBlockNumber: AztecAsyncSingleton<number>;

  private txPool: TxPool;
  private attestationPool: T extends P2PClientType.Full ? AttestationPool : undefined;

  /** How many slots to keep attestations for. */
  private keepAttestationsInPoolFor: number;
  /** How many slots to keep proven txs for. */
  private keepProvenTxsFor: number;

  private blockStream;

  /**
   * In-memory P2P client constructor.
   * @param store - The client's instance of the KV store.
   * @param l2BlockSource - P2P client's source for fetching existing blocks.
   * @param txPool - The client's instance of a transaction pool. Defaults to in-memory implementation.
   * @param p2pService - The concrete instance of p2p networking to use.
   * @param keepProvenTxsFor - How many blocks have to pass after a block is proven before its txs are deleted (zero to delete immediately once proven).
   * @param log - A logger.
   */
  constructor(
    _clientType: T,
    store: AztecAsyncKVStore,
    private l2BlockSource: L2BlockSource,
    mempools: MemPools<T>,
    private p2pService: P2PService,
    config: Partial<P2PConfig> = {},
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p'),
  ) {
    super(telemetry, 'P2PClient');

    const { keepProvenTxsInPoolFor, blockCheckIntervalMS, blockRequestBatchSize, keepAttestationsInPoolFor } = {
      ...getP2PDefaultConfig(),
      ...config,
    };
    this.keepProvenTxsFor = keepProvenTxsInPoolFor;
    this.keepAttestationsInPoolFor = keepAttestationsInPoolFor;

    const tracer = telemetry.getTracer('P2PL2BlockStream');
    const logger = createLogger('p2p:l2-block-stream');
    this.blockStream = new TraceableL2BlockStream(l2BlockSource, this, this, tracer, 'P2PL2BlockStream', logger, {
      batchSize: blockRequestBatchSize,
      pollIntervalMS: blockCheckIntervalMS,
    });

    this.synchedBlockHashes = store.openMap('p2p_pool_block_hashes');
    this.synchedLatestBlockNumber = store.openSingleton('p2p_pool_last_l2_block');
    this.synchedProvenBlockNumber = store.openSingleton('p2p_pool_last_proven_l2_block');

    this.txPool = mempools.txPool;
    this.attestationPool = mempools.attestationPool!;
  }

  public isP2PClient(): true {
    return true;
  }

  public getPeers(includePending?: boolean): Promise<PeerInfo[]> {
    return Promise.resolve(this.p2pService.getPeers(includePending));
  }

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return this.synchedBlockHashes.getAsync(number);
  }

  public async getL2Tips(): Promise<L2Tips> {
    const latestBlockNumber = await this.getSyncedLatestBlockNum();
    let latestBlockHash: string | undefined;
    const provenBlockNumber = await this.getSyncedProvenBlockNum();
    let provenBlockHash: string | undefined;

    if (latestBlockNumber > 0) {
      latestBlockHash = await this.synchedBlockHashes.getAsync(latestBlockNumber);
      if (typeof latestBlockHash === 'undefined') {
        this.log.warn(`Block hash for latest block ${latestBlockNumber} not found`);
        throw new Error();
      }
    }

    if (provenBlockNumber > 0) {
      provenBlockHash = await this.synchedBlockHashes.getAsync(provenBlockNumber);
      if (typeof provenBlockHash === 'undefined') {
        this.log.warn(`Block hash for proven block ${provenBlockNumber} not found`);
        throw new Error();
      }
    }

    return Promise.resolve({
      latest: { hash: latestBlockHash!, number: latestBlockNumber },
      proven: { hash: provenBlockHash!, number: provenBlockNumber },
      finalized: { hash: provenBlockHash!, number: provenBlockNumber },
    });
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    this.log.debug(`Handling block stream event ${event.type}`);
    switch (event.type) {
      case 'blocks-added':
        await this.handleLatestL2Blocks(event.blocks);
        break;
      case 'chain-finalized':
        // TODO (alexg): I think we can prune the block hashes map here
        break;
      case 'chain-proven': {
        const from = (await this.getSyncedProvenBlockNum()) + 1;
        const limit = event.blockNumber - from + 1;
        await this.handleProvenL2Blocks(await this.l2BlockSource.getBlocks(from, limit));
        break;
      }
      case 'chain-pruned':
        await this.handlePruneL2Blocks(event.blockNumber);
        break;
      default: {
        const _: never = event;
        break;
      }
    }
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

    // get the current latest block numbers
    this.latestBlockNumberAtStart = await this.l2BlockSource.getBlockNumber();
    this.provenBlockNumberAtStart = await this.l2BlockSource.getProvenBlockNumber();

    const syncedLatestBlock = (await this.getSyncedLatestBlockNum()) + 1;
    const syncedProvenBlock = (await this.getSyncedProvenBlockNum()) + 1;

    // if there are blocks to be retrieved, go to a synching state
    if (syncedLatestBlock <= this.latestBlockNumberAtStart || syncedProvenBlock <= this.provenBlockNumberAtStart) {
      this.setCurrentState(P2PClientState.SYNCHING);
      this.syncPromise = new Promise(resolve => {
        this.syncResolve = resolve;
      });
      this.log.verbose(`Starting sync from ${syncedLatestBlock} (last proven ${syncedProvenBlock})`);
    } else {
      // if no blocks to be retrieved, go straight to running
      this.setCurrentState(P2PClientState.RUNNING);
      this.syncPromise = Promise.resolve();
      await this.p2pService.start();
      this.log.debug(`Block ${syncedLatestBlock} (proven ${syncedProvenBlock}) already beyond current block`);
    }

    this.blockStream.start();
    this.log.verbose(`Started block downloader from block ${syncedLatestBlock}`);

    return this.syncPromise;
  }

  /**
   * Allows consumers to stop the instance of the P2P client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.log.debug('Stopping p2p client...');
    await this.p2pService.stop();
    this.log.debug('Stopped p2p service');
    await this.blockStream.stop();
    this.log.debug('Stopped block downloader');
    await this.runningPromise;
    this.setCurrentState(P2PClientState.STOPPED);
    this.log.info('P2P client stopped.');
  }

  @trackSpan('p2pClient.broadcastProposal', async proposal => ({
    [Attributes.BLOCK_NUMBER]: proposal.payload.header.globalVariables.blockNumber.toNumber(),
    [Attributes.SLOT_NUMBER]: proposal.payload.header.globalVariables.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: proposal.archive.toString(),
    [Attributes.P2P_ID]: (await proposal.p2pMessageIdentifier()).toString(),
  }))
  public broadcastProposal(proposal: BlockProposal): void {
    this.log.verbose(`Broadcasting proposal ${proposal.p2pMessageIdentifier()} to peers`);
    return this.p2pService.propagate(proposal);
  }

  public async getAttestationsForSlot(slot: bigint, proposalId: string): Promise<BlockAttestation[]> {
    return (await this.attestationPool?.getAttestationsForSlot(slot, proposalId)) ?? [];
  }

  // REVIEW: https://github.com/AztecProtocol/aztec-packages/issues/7963
  // ^ This pattern is not my favorite (md)
  public registerBlockProposalHandler(handler: (block: BlockProposal) => Promise<BlockAttestation | undefined>): void {
    this.p2pService.registerBlockReceivedCallback(handler);
  }

  /**
   * Requests the transactions with the given hashes from the network.
   *
   * If a transaction can be retrieved, it will be returned, if not an undefined
   * will be returned. In place.
   *
   * @param txHashes - The hashes of the transactions to request.
   * @returns A promise that resolves to an array of transactions or undefined.
   */
  public async requestTxs(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    const res = await this.p2pService.sendBatchRequest(ReqRespSubProtocol.TX, txHashes);
    return Promise.resolve(res ?? []);
  }

  /**
   * Uses the Request Response protocol to request a transaction from the network.
   *
   * If the underlying request response protocol fails, then we return undefined.
   * If it succeeds then we add the transaction to our transaction pool and return.
   *
   * @param txHash - The hash of the transaction to request.
   * @returns A promise that resolves to a transaction or undefined.
   */
  public async requestTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const tx = await this.p2pService.sendRequest(ReqRespSubProtocol.TX, txHash);

    if (tx) {
      this.log.debug(`Received tx ${txHash.toString()} from peer`);
      await this.txPool.addTxs([tx]);
    } else {
      this.log.debug(`Failed to receive tx ${txHash.toString()} from peer`);
    }

    return tx;
  }

  /**
   * Uses the batched Request Response protocol to request a set of transactions from the network.
   */
  public async requestTxsByHash(txHashes: TxHash[]): Promise<Tx[]> {
    const txs = (await this.p2pService.sendBatchRequest(ReqRespSubProtocol.TX, txHashes)) ?? [];
    await this.txPool.addTxs(txs);
    const txHashesStr = txHashes.map(tx => tx.toString()).join(', ');
    this.log.debug(`Received batched txs ${txHashesStr} (${txs.length} / ${txHashes.length}}) from peers`);
    return txs as Tx[];
  }

  public getPendingTxs(): Promise<Tx[]> {
    return Promise.resolve(this.getTxs('pending'));
  }

  public async getPendingTxCount(): Promise<number> {
    const pendingTxs = await this.txPool.getPendingTxHashes();
    return pendingTxs.length;
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
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  public async getTxs(filter: 'all' | 'pending' | 'mined'): Promise<Tx[]> {
    if (filter === 'all') {
      return this.txPool.getAllTxs();
    } else if (filter === 'mined') {
      const minedHashes = await this.txPool.getMinedTxHashes();
      const minedTx = await Promise.all(minedHashes.map(([txHash]) => this.txPool.getTxByHash(txHash)));
      return minedTx.filter((tx): tx is Tx => !!tx);
    } else if (filter === 'pending') {
      const pendingHashses = await this.txPool.getPendingTxHashes();
      const pendingTxs = await Promise.all(pendingHashses.map(txHash => this.txPool.getTxByHash(txHash)));
      return pendingTxs.filter((tx): tx is Tx => !!tx);
    } else {
      const _: never = filter;
      throw new Error(`Unknown filter ${filter}`);
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
   * Returns a transaction in the transaction pool by its hash.
   * If the transaction is not in the pool, it will be requested from the network.
   * @param txHash - Hash of the transaction to look for in the pool.
   * @returns A single tx or undefined.
   */
  async getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const tx = await this.txPool.getTxByHash(txHash);
    if (tx) {
      return tx;
    }
    return this.requestTxByHash(txHash);
  }

  /**
   * Returns transactions in the transaction pool by hash.
   * If a transaction is not in the pool, it will be requested from the network.
   * @param txHashes - Hashes of the transactions to look for.
   * @returns The txs found, not necessarily on the same order as the hashes.
   */
  async getTxsByHash(txHashes: TxHash[]): Promise<Tx[]> {
    const txs = await Promise.all(txHashes.map(txHash => this.txPool.getTxByHash(txHash)));
    const missingTxHashes = txs
      .map((tx, index) => [tx, index] as const)
      .filter(([tx, _index]) => !tx)
      .map(([_tx, index]) => txHashes[index]);

    if (missingTxHashes.length === 0) {
      return txs as Tx[];
    }

    const missingTxs = await this.requestTxsByHash(missingTxHashes);
    return txs.filter((tx): tx is Tx => !!tx).concat(missingTxs);
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
    this.#assertIsReady();
    await this.txPool.addTxs([tx]);
    this.p2pService.propagate(tx);
  }

  /**
   * Returns whether the given tx hash is flagged as pending or mined.
   * @param txHash - Hash of the tx to query.
   * @returns Pending or mined depending on its status, or undefined if not found.
   */
  public getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | undefined> {
    return this.txPool.getTxStatus(txHash);
  }

  public getEnr(): ENR | undefined {
    return this.p2pService.getEnr();
  }

  public getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve(this.p2pService.getEnr()?.encodeTxt());
  }

  /**
   * Deletes the 'txs' from the pool.
   * NOT used if we use sendTx as reconcileTxPool will handle this.
   * @param txHashes - Hashes of the transactions to delete.
   * @returns Empty promise.
   **/
  public async deleteTxs(txHashes: TxHash[]): Promise<void> {
    this.#assertIsReady();
    await this.txPool.deleteTxs(txHashes);
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
  public async getSyncedLatestBlockNum(): Promise<number> {
    return (await this.synchedLatestBlockNumber.getAsync()) ?? INITIAL_L2_BLOCK_NUM - 1;
  }

  /**
   * Public function to check the latest proven block number that the P2P client is synced to.
   * @returns Block number of latest proven L2 Block we've synced with.
   */
  public async getSyncedProvenBlockNum(): Promise<number> {
    return (await this.synchedProvenBlockNumber.getAsync()) ?? INITIAL_L2_BLOCK_NUM - 1;
  }

  /**
   * Method to check the status the p2p client.
   * @returns Information about p2p client status: state & syncedToBlockNum.
   */
  public async getStatus(): Promise<P2PSyncState> {
    const blockNumber = await this.getSyncedLatestBlockNum();
    const blockHash =
      blockNumber === 0
        ? ''
        : await this.l2BlockSource
            .getBlockHeader(blockNumber)
            .then(header => header?.hash())
            .then(hash => hash?.toString());

    return {
      state: this.currentState,
      syncedToL2Block: { number: blockNumber, hash: blockHash },
    } as P2PSyncState;
  }

  /**
   * Mark all txs from these blocks as mined.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   * @returns Empty promise.
   */
  private async markTxsAsMinedFromBlocks(blocks: L2Block[]): Promise<void> {
    for (const block of blocks) {
      const txHashes = block.body.txEffects.map(txEffect => txEffect.txHash);
      await this.txPool.markAsMined(txHashes, block.number);
    }
  }

  /**
   * Deletes txs from these blocks.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   * @returns Empty promise.
   */
  private async deleteTxsFromBlocks(blocks: L2Block[]): Promise<void> {
    this.log.debug(`Deleting txs from blocks ${blocks[0].number} to ${blocks[blocks.length - 1].number}`);
    for (const block of blocks) {
      const txHashes = block.body.txEffects.map(txEffect => txEffect.txHash);
      await this.txPool.deleteTxs(txHashes);
    }
  }

  /**
   * Handles new mined blocks by marking the txs in them as mined.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   * @returns Empty promise.
   */
  private async handleLatestL2Blocks(blocks: L2Block[]): Promise<void> {
    if (!blocks.length) {
      return Promise.resolve();
    }

    await this.markTxsAsMinedFromBlocks(blocks);
    const lastBlockNum = blocks[blocks.length - 1].number;
    await Promise.all(
      blocks.map(async block => this.synchedBlockHashes.set(block.number, (await block.hash()).toString())),
    );
    await this.synchedLatestBlockNumber.set(lastBlockNum);
    this.log.verbose(`Synched to latest block ${lastBlockNum}`);
    await this.startServiceIfSynched();
  }

  /**
   * Handles new proven blocks by deleting the txs in them, or by deleting the txs in blocks `keepProvenTxsFor` ago.
   * @param blocks - A list of proven L2 blocks.
   * @returns Empty promise.
   */
  private async handleProvenL2Blocks(blocks: L2Block[]): Promise<void> {
    if (!blocks.length) {
      return Promise.resolve();
    }

    const firstBlockNum = blocks[0].number;
    const lastBlockNum = blocks[blocks.length - 1].number;
    const lastBlockSlot = blocks[blocks.length - 1].header.globalVariables.slotNumber.toBigInt();

    // If keepProvenTxsFor is 0, we delete all txs from all proven blocks.
    if (this.keepProvenTxsFor === 0) {
      await this.deleteTxsFromBlocks(blocks);
    } else if (lastBlockNum - this.keepProvenTxsFor >= INITIAL_L2_BLOCK_NUM) {
      const fromBlock = Math.max(INITIAL_L2_BLOCK_NUM, firstBlockNum - this.keepProvenTxsFor);
      const toBlock = lastBlockNum - this.keepProvenTxsFor;
      const limit = toBlock - fromBlock + 1;
      const blocksToDeleteTxsFrom = await this.l2BlockSource.getBlocks(fromBlock, limit, true);
      await this.deleteTxsFromBlocks(blocksToDeleteTxsFrom);
    }

    // We delete attestations older than the last block slot minus the number of slots we want to keep in the pool.
    const lastBlockSlotMinusKeepAttestationsInPoolFor = lastBlockSlot - BigInt(this.keepAttestationsInPoolFor);
    if (lastBlockSlotMinusKeepAttestationsInPoolFor >= BigInt(INITIAL_L2_BLOCK_NUM)) {
      await this.attestationPool?.deleteAttestationsOlderThan(lastBlockSlotMinusKeepAttestationsInPoolFor);
    }

    await this.synchedProvenBlockNumber.set(lastBlockNum);
    this.log.debug(`Synched to proven block ${lastBlockNum}`);

    await this.startServiceIfSynched();
  }

  /**
   * Updates the tx pool after a chain prune.
   * @param latestBlock - The block number the chain was pruned to.
   */
  private async handlePruneL2Blocks(latestBlock: number): Promise<void> {
    const txsToDelete: TxHash[] = [];
    for (const tx of await this.txPool.getAllTxs()) {
      // every tx that's been generated against a block that has now been pruned is no longer valid
      if (tx.data.constants.historicalHeader.globalVariables.blockNumber.toNumber() > latestBlock) {
        txsToDelete.push(await tx.getTxHash());
      }
    }

    this.log.info(
      `Detected chain prune. Removing invalid txs count=${
        txsToDelete.length
      } newLatestBlock=${latestBlock} previousLatestBlock=${this.getSyncedLatestBlockNum()}`,
    );

    // delete invalid txs (both pending and mined)
    await this.txPool.deleteTxs(txsToDelete);

    // everything left in the mined set was built against a block on the proven chain so its still valid
    // move back to pending the txs that were reorged out of the chain
    // NOTE: we can't move _all_ txs back to pending because the tx pool could keep hold of mined txs for longer
    // (see this.keepProvenTxsFor)
    const txsToMoveToPending: TxHash[] = [];
    for (const [txHash, blockNumber] of await this.txPool.getMinedTxHashes()) {
      if (blockNumber > latestBlock) {
        txsToMoveToPending.push(txHash);
      }
    }

    this.log.info(`Moving ${txsToMoveToPending.length} mined txs back to pending`);
    await this.txPool.markMinedAsPending(txsToMoveToPending);

    await this.synchedLatestBlockNumber.set(latestBlock);
    // no need to update block hashes, as they will be updated as new blocks are added
  }

  private async startServiceIfSynched() {
    if (
      this.currentState === P2PClientState.SYNCHING &&
      (await this.getSyncedLatestBlockNum()) >= this.latestBlockNumberAtStart &&
      (await this.getSyncedProvenBlockNum()) >= this.provenBlockNumberAtStart
    ) {
      this.log.debug(`Synched to blocks at start`);
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
}
