import {
  type BlockAttestation,
  type BlockProposal,
  type EpochProofQuote,
  type L2Block,
  type L2BlockId,
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2Tips,
  type Tx,
  type TxHash,
} from '@aztec/circuit-types';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js/constants';
import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap, type AztecSingleton } from '@aztec/kv-store';
import { Attributes, type TelemetryClient, WithTracer, trackSpan } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type ENR } from '@chainsafe/enr';

import { getP2PConfigFromEnv } from '../config.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { type EpochProofQuotePool } from '../mem_pools/epoch_proof_quote_pool/epoch_proof_quote_pool.js';
import { type MemPools } from '../mem_pools/interface.js';
import { type TxPool } from '../mem_pools/tx_pool/index.js';
import { TX_REQ_PROTOCOL } from '../service/reqresp/interface.js';
import type { P2PService } from '../service/service.js';

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
export interface P2P {
  /**
   * Broadcasts a block proposal to other peers.
   *
   * @param proposal - the block proposal
   */
  broadcastProposal(proposal: BlockProposal): void;

  /**
   * Queries the Attestation pool for attestations for the given slot
   *
   * @param slot - the slot to query
   * @param proposalId - the proposal id to query
   * @returns BlockAttestations
   */
  getAttestationsForSlot(slot: bigint, proposalId: string): Promise<BlockAttestation[]>;

  /**
   * Queries the EpochProofQuote pool for quotes for the given epoch
   *
   * @param epoch  - the epoch to query
   * @returns EpochProofQuotes
   */
  getEpochProofQuotes(epoch: bigint): Promise<EpochProofQuote[]>;

  /**
   * Adds an EpochProofQuote to the pool and broadcasts an EpochProofQuote to other peers.
   *
   * @param quote - the quote to broadcast
   */
  addEpochProofQuote(quote: EpochProofQuote): Promise<void>;

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
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  getTxs(filter: 'all' | 'pending' | 'mined'): Tx[];

  /**
   * Returns a transaction in the transaction pool by its hash.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getTxByHashFromPool(txHash: TxHash): Tx | undefined;

  /**
   * Returns a transaction in the transaction pool by its hash, requesting it from the network if it is not found.
   * @param txHash  - Hash of tx to return.
   * @returns A single tx or undefined.
   */
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Returns whether the given tx hash is flagged as pending or mined.
   * @param txHash - Hash of the tx to query.
   * @returns Pending or mined depending on its status, or undefined if not found.
   */
  getTxStatus(txHash: TxHash): 'pending' | 'mined' | undefined;

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
   * Returns the ENR for this node, if any.
   */
  getEnr(): ENR | undefined;
}

/**
 * The P2P client implementation.
 */
export class P2PClient extends WithTracer implements P2P {
  /** Property that indicates whether the client is running. */
  private stopping = false;

  /** The JS promise that will be running to keep the client's data in sync. Can be interrupted if the client is stopped. */
  private runningPromise!: Promise<void>;

  private currentState = P2PClientState.IDLE;
  private syncPromise = Promise.resolve();
  private syncResolve?: () => void = undefined;
  private latestBlockNumberAtStart = -1;
  private provenBlockNumberAtStart = -1;

  private synchedBlockHashes: AztecMap<number, string>;
  private synchedLatestBlockNumber: AztecSingleton<number>;
  private synchedProvenBlockNumber: AztecSingleton<number>;

  private txPool: TxPool;
  private attestationPool: AttestationPool;
  private epochProofQuotePool: EpochProofQuotePool;

  /** How many slots to keep attestations for. */
  private keepAttestationsInPoolFor: number;

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
    store: AztecKVStore,
    private l2BlockSource: L2BlockSource,
    mempools: MemPools,
    private p2pService: P2PService,
    private keepProvenTxsFor: number,
    telemetry: TelemetryClient = new NoopTelemetryClient(),
    private log = createDebugLogger('aztec:p2p'),
  ) {
    super(telemetry, 'P2PClient');

    const { blockCheckIntervalMS, blockRequestBatchSize, keepAttestationsInPoolFor } = getP2PConfigFromEnv();

    this.keepAttestationsInPoolFor = keepAttestationsInPoolFor;

    this.blockStream = new L2BlockStream(l2BlockSource, this, this, {
      batchSize: blockRequestBatchSize,
      pollIntervalMS: blockCheckIntervalMS,
    });

    this.synchedBlockHashes = store.openMap('p2p_pool_block_hashes');
    this.synchedLatestBlockNumber = store.openSingleton('p2p_pool_last_l2_block');
    this.synchedProvenBlockNumber = store.openSingleton('p2p_pool_last_proven_l2_block');

    this.txPool = mempools.txPool;
    this.attestationPool = mempools.attestationPool;
    this.epochProofQuotePool = mempools.epochProofQuotePool;
  }

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(this.synchedBlockHashes.get(number));
  }

  public getL2Tips(): Promise<L2Tips> {
    const latestBlockNumber = this.getSyncedLatestBlockNum();
    let latestBlockHash: string | undefined;
    const provenBlockNumber = this.getSyncedProvenBlockNum();
    let provenBlockHash: string | undefined;

    if (latestBlockNumber > 0) {
      latestBlockHash = this.synchedBlockHashes.get(latestBlockNumber);
      if (typeof latestBlockHash === 'undefined') {
        this.log.warn(`Block hash for latest block ${latestBlockNumber} not found`);
        throw new Error();
      }
    }

    if (provenBlockNumber > 0) {
      provenBlockHash = this.synchedBlockHashes.get(provenBlockNumber);
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
        const from = this.getSyncedProvenBlockNum() + 1;
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
   * Adds an EpochProofQuote to the pool and broadcasts an EpochProofQuote to other peers.
   * @param quote - the quote to broadcast
   */
  addEpochProofQuote(quote: EpochProofQuote): Promise<void> {
    this.epochProofQuotePool.addQuote(quote);
    this.broadcastEpochProofQuote(quote);
    return Promise.resolve();
  }

  getEpochProofQuotes(epoch: bigint): Promise<EpochProofQuote[]> {
    return Promise.resolve(this.epochProofQuotePool.getQuotes(epoch));
  }

  broadcastEpochProofQuote(quote: EpochProofQuote): void {
    this.#assertIsReady();
    this.log.info('Broadcasting epoch proof quote', quote.toViemArgs());
    return this.p2pService.propagate(quote);
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

    const syncedLatestBlock = this.getSyncedLatestBlockNum() + 1;
    const syncedProvenBlock = this.getSyncedProvenBlockNum() + 1;

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
      this.log.verbose(`Block ${syncedLatestBlock} (proven ${syncedProvenBlock}) already beyond current block`);
    }

    // publish any txs in TxPool after its doing initial sync
    this.syncPromise = this.syncPromise.then(() => this.publishStoredTxs());

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
    this.stopping = true;
    await this.p2pService.stop();
    this.log.debug('Stopped p2p service');
    await this.blockStream.stop();
    this.log.debug('Stopped block downloader');
    await this.runningPromise;
    this.setCurrentState(P2PClientState.STOPPED);
    this.log.info('P2P client stopped.');
  }

  @trackSpan('p2pClient.broadcastProposal', proposal => ({
    [Attributes.BLOCK_NUMBER]: proposal.payload.header.globalVariables.blockNumber.toNumber(),
    [Attributes.SLOT_NUMBER]: proposal.payload.header.globalVariables.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: proposal.archive.toString(),
    [Attributes.P2P_ID]: proposal.p2pMessageIdentifier().toString(),
  }))
  public broadcastProposal(proposal: BlockProposal): void {
    this.log.verbose(`Broadcasting proposal ${proposal.p2pMessageIdentifier()} to peers`);
    return this.p2pService.propagate(proposal);
  }

  public getAttestationsForSlot(slot: bigint, proposalId: string): Promise<BlockAttestation[]> {
    return Promise.resolve(this.attestationPool.getAttestationsForSlot(slot, proposalId));
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
  public requestTxs(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    const requestPromises = txHashes.map(txHash => this.requestTxByHash(txHash));
    return Promise.all(requestPromises);
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
    const tx = await this.p2pService.sendRequest(TX_REQ_PROTOCOL, txHash);

    this.log.debug(`Requested ${txHash.toString()} from peer | success = ${!!tx}`);
    if (tx) {
      await this.txPool.addTxs([tx]);
    }

    return tx;
  }

  /**
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  public getTxs(filter: 'all' | 'pending' | 'mined'): Tx[] {
    if (filter === 'all') {
      return this.txPool.getAllTxs();
    } else if (filter === 'mined') {
      return this.txPool
        .getMinedTxHashes()
        .map(([txHash]) => this.txPool.getTxByHash(txHash))
        .filter((tx): tx is Tx => !!tx);
    } else if (filter === 'pending') {
      return this.txPool
        .getPendingTxHashes()
        .map(txHash => this.txPool.getTxByHash(txHash))
        .filter((tx): tx is Tx => !!tx);
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
  getTxByHashFromPool(txHash: TxHash): Tx | undefined {
    return this.txPool.getTxByHash(txHash);
  }

  /**
   * Returns a transaction in the transaction pool by its hash.
   * If the transaction is not in the pool, it will be requested from the network.
   * @param txHash - Hash of the transaction to look for in the pool.
   * @returns A single tx or undefined.
   */
  getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const tx = this.txPool.getTxByHash(txHash);
    if (tx) {
      return Promise.resolve(tx);
    }
    return this.requestTxByHash(txHash);
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
  public getTxStatus(txHash: TxHash): 'pending' | 'mined' | undefined {
    return this.txPool.getTxStatus(txHash);
  }

  public getEnr(): ENR | undefined {
    return this.p2pService.getEnr();
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
  public getSyncedLatestBlockNum() {
    return this.synchedLatestBlockNumber.get() ?? INITIAL_L2_BLOCK_NUM - 1;
  }

  /**
   * Public function to check the latest proven block number that the P2P client is synced to.
   * @returns Block number of latest proven L2 Block we've synced with.
   */
  public getSyncedProvenBlockNum() {
    return this.synchedProvenBlockNumber.get() ?? INITIAL_L2_BLOCK_NUM - 1;
  }

  /**
   * Method to check the status the p2p client.
   * @returns Information about p2p client status: state & syncedToBlockNum.
   */
  public async getStatus(): Promise<P2PSyncState> {
    const blockNumber = this.getSyncedLatestBlockNum();
    const blockHash =
      blockNumber == 0
        ? ''
        : await this.l2BlockSource.getBlockHeader(blockNumber).then(header => header?.hash().toString());
    return Promise.resolve({
      state: this.currentState,
      syncedToL2Block: { number: blockNumber, hash: blockHash },
    } as P2PSyncState);
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
    await Promise.all(blocks.map(block => this.synchedBlockHashes.set(block.number, block.hash().toString())));
    await this.synchedLatestBlockNumber.set(lastBlockNum);
    this.log.debug(`Synched to latest block ${lastBlockNum}`);
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
      await this.attestationPool.deleteAttestationsOlderThan(lastBlockSlotMinusKeepAttestationsInPoolFor);
    }

    await this.synchedProvenBlockNumber.set(lastBlockNum);
    this.log.debug(`Synched to proven block ${lastBlockNum}`);
    const provenEpochNumber = await this.l2BlockSource.getProvenL2EpochNumber();
    if (provenEpochNumber !== undefined) {
      this.epochProofQuotePool.deleteQuotesToEpoch(BigInt(provenEpochNumber));
    }

    await this.startServiceIfSynched();
  }

  /**
   * Updates the tx pool after a chain prune.
   * @param latestBlock - The block number the chain was pruned to.
   */
  private async handlePruneL2Blocks(latestBlock: number): Promise<void> {
    const txsToDelete: TxHash[] = [];
    for (const tx of this.txPool.getAllTxs()) {
      // every tx that's been generated against a block that has now been pruned is no longer valid
      if (tx.data.constants.historicalHeader.globalVariables.blockNumber.toNumber() > latestBlock) {
        txsToDelete.push(tx.getTxHash());
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
    for (const [txHash, blockNumber] of this.txPool.getMinedTxHashes()) {
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
      this.getSyncedLatestBlockNum() >= this.latestBlockNumberAtStart &&
      this.getSyncedProvenBlockNum() >= this.provenBlockNumberAtStart
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
    this.currentState = newState;
    this.log.debug(`Moved to state ${P2PClientState[this.currentState]}`);
  }

  private async publishStoredTxs() {
    if (!this.isReady()) {
      return;
    }

    const txs = this.txPool.getAllTxs();
    if (txs.length > 0) {
      this.log.debug(`Publishing ${txs.length} previously stored txs`);
      await Promise.all(txs.map(tx => this.p2pService.propagate(tx)));
    }
  }
}
