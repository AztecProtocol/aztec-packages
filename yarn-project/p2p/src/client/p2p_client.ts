import {
  type BlockAttestation,
  type BlockProposal,
  type EpochProofQuote,
  type L2Block,
  L2BlockDownloader,
  type L2BlockSource,
  L2BlockStream,
  L2BlockStreamEvent,
  L2BlockStreamEventHandler,
  L2TipsStore,
  type Tx,
  type TxHash,
} from '@aztec/circuit-types';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js/constants';
import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecSingleton } from '@aztec/kv-store';
import { Attributes, type TelemetryClient, WithTracer, trackSpan } from '@aztec/telemetry-client';

import { type ENR } from '@chainsafe/enr';

import { getP2PConfigEnvVars } from '../config.js';
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
  syncedToL2Block: number;
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
   * Broadcasts an EpochProofQuote to other peers.
   *
   * @param quote - the quote to broadcast
   */
  broadcastEpochProofQuote(quote: EpochProofQuote): void;

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
   * Deletes pending txs from the pool, given their ids.
   * @param txHashes - Pending tx hashes to delete.
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
  getTxByHash(txHash: TxHash): Tx | undefined;

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
export class P2PClient extends WithTracer implements P2P, L2BlockStreamEventHandler {
  /** Stores the view of the chain for this p2p client. */
  private tipsStore: L2TipsStore;

  /** L2 block stream from the archiver. */
  private blockStream: L2BlockStream;

  /** Whether the client is running. */
  private stopping = false;

  /** Current state of the client */
  private currentState = P2PClientState.IDLE;

  /** Resolves after the initial sync. */
  private syncPromise = Promise.resolve();

  private txPool: TxPool;
  private attestationPool: AttestationPool;
  private epochProofQuotePool: EpochProofQuotePool;

  /**
   * In-memory P2P client constructor.
   * @param store - The client's instance of the KV store.
   * @param l2BlockSource - P2P client's source for fetching existing blocks.
   * @param txPool - The client's instance of a transaction pool. Defaults to in-memory implementation.
   * @param p2pService - The concrete instance of p2p networking to use.
   * @param keepFinalizedTxsFor - How many blocks have to pass after a block is finalized before its txs are deleted (zero to delete immediately once finalized).
   * @param log - A logger.
   */
  constructor(
    store: AztecKVStore,
    private l2BlockSource: L2BlockSource,
    mempools: MemPools,
    private p2pService: P2PService,
    private keepFinalizedTxsFor: number,
    telemetryClient: TelemetryClient,
    private log = createDebugLogger('aztec:p2p'),
  ) {
    super(telemetryClient, 'P2PClient');
    const { blockCheckIntervalMS: pollIntervalMS } = getP2PConfigEnvVars();

    this.tipsStore = new L2TipsStore(store);
    this.blockStream = new L2BlockStream(l2BlockSource, this.tipsStore, this, { pollIntervalMS });

    this.txPool = mempools.txPool;
    this.attestationPool = mempools.attestationPool;
    this.epochProofQuotePool = mempools.epochProofQuotePool;
  }

  #assertIsReady() {
    if (!this.isReady()) {
      throw new Error('P2P client not ready');
    }
  }

  getEpochProofQuotes(epoch: bigint): Promise<EpochProofQuote[]> {
    return Promise.resolve(this.epochProofQuotePool.getQuotes(epoch));
  }

  broadcastEpochProofQuote(quote: EpochProofQuote): void {
    this.#assertIsReady();
    this.epochProofQuotePool.addQuote(quote);
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

    const { isSynced, localLatestBlockNumber } = await this.blockStream.isSynced();

    if (!isSynced) {
      // if there are blocks to be retrieved, go to a synching state
      this.setCurrentState(P2PClientState.SYNCHING);
      this.log.verbose(`Starting sync from ${localLatestBlockNumber}`);
      this.syncPromise = this.blockStream.sync();
    } else {
      // if no blocks to be retrieved, go straight to running
      this.setCurrentState(P2PClientState.RUNNING);
      this.log.verbose(`Already synced to block ${localLatestBlockNumber}`);
      this.syncPromise = Promise.resolve();
    }

    // start p2p service after initial sync
    this.syncPromise = this.syncPromise.then(() => this.p2pService.start());

    // publish any txs in TxPool after its doing initial sync
    this.syncPromise = this.syncPromise.then(() => this.publishStoredTxs());

    // and announce to the world we've started
    this.syncPromise = this.syncPromise.then(() => this.log.info(`Started p2p client`));

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
    this.log.debug('Stopped block stream');
    this.setCurrentState(P2PClientState.STOPPED);
    this.log.info('P2P client stopped.');
  }

  /** Handles an event from the L2 block stream. */
  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added':
        await this.markTxsAsMinedFromBlocks(event.blocks);
        this.log.verbose(`Marked txs as mined up to block ${event.blocks.at(-1)?.number}`);
        break;
      case 'chain-finalized':
        // delete all mined txs from blocks that are finalized
        await this.handleProvenL2Blocks(event.blocks);
        break;
      case 'chain-proven':
        // do nothing
        await this.handleProvenL2Blocks(event.blocks);
        break;
      case 'chain-pruned':
        // move all mined txs to pending
        break;
    }

    // Forward the event to the tips store to keep it up to date
    await this.tipsStore.handleBlockStreamEvent(event);
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
        .map(txHash => this.txPool.getTxByHash(txHash))
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
  getTxByHash(txHash: TxHash): Tx | undefined {
    return this.txPool.getTxByHash(txHash);
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
   * Method to check the status the p2p client.
   * @returns Information about p2p client status: state & syncedToBlockNum.
   */
  public async getStatus(): Promise<P2PSyncState> {
    return {
      state: this.currentState,
      syncedToL2Block: (await this.tipsStore.getL2Tips()).latest,
    };
  }

  /**
   * Mark all txs from these blocks as mined.
   * @param blocks - A list of existing blocks with txs that the P2P client needs to ensure the tx pool is reconciled with.
   * @returns Empty promise.
   */
  private async markTxsAsMinedFromBlocks(blocks: L2Block[]): Promise<void> {
    for (const block of blocks) {
      const txHashes = block.body.txEffects.map(txEffect => txEffect.txHash);
      await this.txPool.markAsMined(txHashes);
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

    if (this.keepFinalizedTxsFor === 0) {
      await this.deleteTxsFromBlocks(blocks);
    } else if (lastBlockNum - this.keepFinalizedTxsFor >= INITIAL_L2_BLOCK_NUM) {
      const fromBlock = Math.max(INITIAL_L2_BLOCK_NUM, firstBlockNum - this.keepFinalizedTxsFor);
      const toBlock = lastBlockNum - this.keepFinalizedTxsFor;
      const limit = toBlock - fromBlock + 1;
      const blocksToDeleteTxsFrom = await this.l2BlockSource.getBlocks(fromBlock, limit, true);
      await this.deleteTxsFromBlocks(blocksToDeleteTxsFrom);
    }

    await this.synchedFinalizedBlockNumber.set(lastBlockNum);
    this.log.debug(`Synched to proven block ${lastBlockNum}`);
    const provenEpochNumber = await this.l2BlockSource.getProvenL2EpochNumber();
    if (provenEpochNumber !== undefined) {
      this.epochProofQuotePool.deleteQuotesToEpoch(BigInt(provenEpochNumber));
    }
    await this.startServiceIfSynched();
  }

  /**
   * Sets the value of the current state.
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
