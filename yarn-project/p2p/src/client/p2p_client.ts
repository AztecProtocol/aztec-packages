import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import type {
  L2Block,
  L2BlockId,
  L2BlockSourceBlocksAddedEvent,
  L2BlockSourceChainProvenEvent,
  L2BlockSourceChainPrunedEvent,
  L2BlockSourceEventEmitter,
} from '@aztec/stdlib/block';
import { L2BlockSourceEvents } from '@aztec/stdlib/block';
import type { P2PApi, PeerInfo, ProverCoordination } from '@aztec/stdlib/interfaces/server';
import type { BlockAttestation, BlockProposal, P2PClientType } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';
import { Attributes, type TelemetryClient, WithTracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import type { ENR } from '@chainsafe/enr';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
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

  // This value get's updated in response to events from the L2BlockSourceEventEmitter
  // It's value is set in construction by requesting it from the L2BlockSource
  // It is important, as the sequencer must wait until this value has progressed to the same as other services
  // before it requests transactions to build blocks, else we will not have the correct transactions available
  private synchedLatestBlockNumber: number = -1;
  private synchedProvenBlockNumber: number = -1;

  private txPool: TxPool;
  private attestationPool: T extends P2PClientType.Full ? AttestationPool : undefined;

  /** How many slots to keep attestations for. */
  private keepAttestationsInPoolFor: number;
  /** How many slots to keep proven txs for. */
  private keepProvenTxsFor: number;

  // Store event handler references
  private eventHandlers: {
    handleChainPruned: (event: L2BlockSourceChainPrunedEvent) => void;
    handleBlocksAdded: (event: L2BlockSourceBlocksAddedEvent) => void;
    handleChainProven: (event: L2BlockSourceChainProvenEvent) => void;
  } | null = null;

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
    private l2BlockSource: L2BlockSourceEventEmitter,
    mempools: MemPools<T>,
    private p2pService: P2PService,
    config: Partial<P2PConfig> = {},
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p'),
  ) {
    super(telemetry, 'P2PClient');

    const { keepProvenTxsInPoolFor, keepAttestationsInPoolFor } = {
      ...getP2PDefaultConfig(),
      ...config,
    };
    this.keepProvenTxsFor = keepProvenTxsInPoolFor;
    this.keepAttestationsInPoolFor = keepAttestationsInPoolFor;

    this.txPool = mempools.txPool;
    this.attestationPool = mempools.attestationPool!;
  }

  public isP2PClient(): true {
    return true;
  }

  public getPeers(includePending?: boolean): Promise<PeerInfo[]> {
    return Promise.resolve(this.p2pService.getPeers(includePending));
  }

  #assertIsReady() {
    // this.log.info('Checking if p2p client is ready, current state: ', this.currentState);
    if (!this.isReady()) {
      throw new Error('P2P client not ready');
    }
  }

  public getSyncedLatestBlockNum(): number {
    return this.synchedLatestBlockNumber;
  }

  public getSyncedProvenBlockNum(): number {
    return this.synchedProvenBlockNumber;
  }

  /**
   * Method to check the status the p2p client.
   * @returns Information about p2p client status: state & syncedToBlockNum.
   */
  public async getStatus(): Promise<P2PSyncState> {
    const blockNumber = this.getSyncedLatestBlockNum();
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
   * Starts the P2P client.
   * @returns An empty promise signalling the synching process.
   */
  public async start() {
    if (this.currentState === P2PClientState.STOPPED) {
      throw new Error('P2P client already stopped');
    }

    // Store current tips in the L2BlockSource
    const [latestBlockNumber, provenBlockNumber] = await Promise.all([
      this.l2BlockSource.getBlockNumber(),
      this.l2BlockSource.getProvenBlockNumber(),
    ]);
    this.synchedLatestBlockNumber = latestBlockNumber;
    this.synchedProvenBlockNumber = provenBlockNumber;

    await this.p2pService.start();

    // Create wrapper functions that handle the promises
    const handleChainPruned = (event: L2BlockSourceChainPrunedEvent) => {
      this.setCurrentState(P2PClientState.SYNCHING);
      this.handlePruneL2Blocks(event)
        .catch(err => this.log.error(`Error handling chain pruned event: ${err}`))
        .finally(() => this.setCurrentState(P2PClientState.RUNNING));
    };

    const handleBlocksAdded = (event: L2BlockSourceBlocksAddedEvent) => {
      this.setCurrentState(P2PClientState.SYNCHING);
      this.handleLatestL2Blocks(event)
        .catch(err => this.log.error(`Error handling blocks added event: ${err}`))
        .finally(() => this.setCurrentState(P2PClientState.RUNNING));
    };

    const handleChainProven = (event: L2BlockSourceChainProvenEvent) => {
      this.setCurrentState(P2PClientState.SYNCHING);
      this.handleProvenL2Blocks(event)
        .catch(err => this.log.error(`Error handling chain proven event: ${err}`))
        .finally(() => this.setCurrentState(P2PClientState.RUNNING));
    };

    // Store references to the wrapper functions for later removal
    this.eventHandlers = {
      handleChainPruned,
      handleBlocksAdded,
      handleChainProven,
    };

    this.l2BlockSource.on(L2BlockSourceEvents.ChainPruned, handleChainPruned);
    this.l2BlockSource.on(L2BlockSourceEvents.BlocksAdded, handleBlocksAdded);
    this.l2BlockSource.on(L2BlockSourceEvents.ChainProven, handleChainProven);

    this.setCurrentState(P2PClientState.RUNNING);
    this.log.verbose(`Started p2p service`);
  }

  /**
   * Allows consumers to stop the instance of the P2P client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.log.debug('Stopping p2p client...');
    await this.p2pService.stop();

    // Remove event listeners using the stored references
    if (this.eventHandlers) {
      this.l2BlockSource.removeListener(L2BlockSourceEvents.ChainPruned, this.eventHandlers.handleChainPruned);
      this.l2BlockSource.removeListener(L2BlockSourceEvents.BlocksAdded, this.eventHandlers.handleBlocksAdded);
      this.l2BlockSource.removeListener(L2BlockSourceEvents.ChainProven, this.eventHandlers.handleChainProven);
      this.eventHandlers = null;
    }

    this.log.debug('Stopped p2p service');
    await this.runningPromise;
    this.setCurrentState(P2PClientState.STOPPED);
    this.log.info('P2P client stopped.');
  }

  @trackSpan('p2pClient.broadcastProposal', async proposal => ({
    [Attributes.BLOCK_NUMBER]: proposal.blockNumber.toNumber(),
    [Attributes.SLOT_NUMBER]: proposal.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: proposal.archive.toString(),
    [Attributes.P2P_ID]: (await proposal.p2pMessageIdentifier()).toString(),
  }))
  public broadcastProposal(proposal: BlockProposal): void {
    this.log.verbose(`Broadcasting proposal for slot ${proposal.slotNumber.toNumber()} to peers`);
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
  private async handleLatestL2Blocks(event: L2BlockSourceBlocksAddedEvent): Promise<void> {
    this.log.info(`Handling LATEST BLOCKS: ${event.blocks.length}`);
    if (!event.blocks.length) {
      return Promise.resolve();
    }

    await this.markTxsAsMinedFromBlocks(event.blocks);
    this.synchedLatestBlockNumber = event.blocks[event.blocks.length - 1].number;
    this.log.verbose(`Synched to latest block ${this.synchedLatestBlockNumber}`);
  }

  /**
   * Handles new proven blocks by deleting the txs in them, or by deleting the txs in blocks `keepProvenTxsFor` ago.
   * @param blocks - A list of proven L2 blocks.
   * @returns Empty promise.
   */
  private async handleProvenL2Blocks(event: L2BlockSourceChainProvenEvent): Promise<void> {
    this.log.info(`Handling chain proven event: ${jsonStringify(event)}`);
    const from = Number(event.previousProvenBlockNumber) + 1;
    const limit = Number(event.provenBlockNumber) - from + 1;
    const blocks = await this.l2BlockSource.getBlocks(from, limit, true);

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

    this.synchedProvenBlockNumber = lastBlockNum;
    this.log.verbose(`Synched to proven block ${this.synchedProvenBlockNumber}`, {
      latestBlockNumber: this.synchedLatestBlockNumber,
      provenBlockNumber: this.synchedProvenBlockNumber,
    });
  }

  /**
   * Updates the tx pool after a chain prune.
   * @param latestBlock - The block number the chain was pruned to.
   */
  private async handlePruneL2Blocks(event: L2BlockSourceChainPrunedEvent): Promise<void> {
    const latestBlock = event.blockNumber;

    const txsToDelete: TxHash[] = [];
    for (const tx of await this.txPool.getAllTxs()) {
      // every tx that's been generated against a block that has now been pruned is no longer valid
      if (tx.data.constants.historicalHeader.globalVariables.blockNumber.toBigInt() > latestBlock) {
        txsToDelete.push(await tx.getTxHash());
      }
    }

    this.log.info(
      `Detected chain prune. Removing invalid txs count=${
        txsToDelete.length
      } newLatestBlock=${latestBlock} previousLatestBlock=${this.l2BlockSource.getBlockNumber()}`,
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

    this.synchedLatestBlockNumber = Number(latestBlock);
    this.synchedProvenBlockNumber = Number(latestBlock);
    this.log.verbose(
      `Handled chain prune. Latest block ${this.synchedLatestBlockNumber} and proven block ${this.synchedProvenBlockNumber}`,
      {
        latestBlockNumber: this.synchedLatestBlockNumber,
        provenBlockNumber: this.synchedProvenBlockNumber,
      },
    );
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
