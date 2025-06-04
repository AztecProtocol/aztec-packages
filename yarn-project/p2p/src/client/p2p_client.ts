import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton } from '@aztec/kv-store';
import type {
  L2Block,
  L2BlockId,
  L2BlockSource,
  L2BlockStream,
  L2BlockStreamEvent,
  L2Tips,
  PublishedL2Block,
} from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import { BlockAttestation, type BlockProposal, type P2PClientType } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';
import {
  Attributes,
  type TelemetryClient,
  TraceableL2BlockStream,
  WithTracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import type { ENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';

import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import { ReqRespSubProtocol } from '../services/reqresp/interface.js';
import type { P2PBlockReceivedCallback, P2PService } from '../services/service.js';
import { TxCollector } from '../services/tx_collector.js';
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

  private synchedBlockHashes: AztecAsyncMap<number, string>;
  private synchedLatestBlockNumber: AztecAsyncSingleton<number>;
  private synchedProvenBlockNumber: AztecAsyncSingleton<number>;
  private synchedFinalizedBlockNumber: AztecAsyncSingleton<number>;
  private synchedLatestSlot: AztecAsyncSingleton<bigint>;

  private txPool: TxPool;
  private attestationPool: T extends P2PClientType.Full ? AttestationPool : undefined;

  private config: P2PConfig;

  private blockStream: L2BlockStream | undefined;

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
    mempools: MemPools<T>,
    private p2pService: P2PService,
    config: Partial<P2PConfig> = {},
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p'),
  ) {
    super(telemetry, 'P2PClient');

    this.config = { ...getP2PDefaultConfig(), ...config };
    this.txPool = mempools.txPool;
    this.attestationPool = mempools.attestationPool!;

    // Default to collecting all txs when we see a valid proposal
    // This can be overridden by the validator client to attest, and it will call collectForBlockProposal on its own
    const txCollector = new TxCollector(this, this.log);
    this.registerBlockProposalHandler(async (block, sender) => {
      this.log.debug(`Received block proposal from ${sender.toString()}`);
      await txCollector.collectForBlockProposal(block, sender);
      return undefined;
    });

    // REFACTOR: Try replacing these with an L2TipsStore
    this.synchedBlockHashes = store.openMap('p2p_pool_block_hashes');
    this.synchedLatestBlockNumber = store.openSingleton('p2p_pool_last_l2_block');
    this.synchedProvenBlockNumber = store.openSingleton('p2p_pool_last_proven_l2_block');
    this.synchedFinalizedBlockNumber = store.openSingleton('p2p_pool_last_finalized_l2_block');
    this.synchedLatestSlot = store.openSingleton('p2p_pool_last_l2_slot');
  }

  public clear(): Promise<void> {
    return this.store.clear();
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

  public updateP2PConfig(config: Partial<P2PConfig>): Promise<void> {
    this.txPool.updateConfig(config);
    return Promise.resolve();
  }

  public async getL2Tips(): Promise<L2Tips> {
    const latestBlockNumber = await this.getSyncedLatestBlockNum();
    let latestBlockHash: string | undefined;

    const provenBlockNumber = await this.getSyncedProvenBlockNum();
    let provenBlockHash: string | undefined;

    const finalizedBlockNumber = await this.getSyncedFinalizedBlockNum();
    let finalizedBlockHash: string | undefined;

    if (latestBlockNumber > 0) {
      latestBlockHash = await this.synchedBlockHashes.getAsync(latestBlockNumber);
      if (typeof latestBlockHash === 'undefined') {
        throw new Error(`Block hash for latest block ${latestBlockNumber} not found in p2p client`);
      }
    }

    if (provenBlockNumber > 0) {
      provenBlockHash = await this.synchedBlockHashes.getAsync(provenBlockNumber);
      if (typeof provenBlockHash === 'undefined') {
        throw new Error(`Block hash for proven block ${provenBlockNumber} not found in p2p client`);
      }
    }

    if (finalizedBlockNumber > 0) {
      finalizedBlockHash = await this.synchedBlockHashes.getAsync(finalizedBlockNumber);
      if (typeof finalizedBlockHash === 'undefined') {
        throw new Error(`Block hash for finalized block ${finalizedBlockNumber} not found in p2p client`);
      }
    }

    return {
      latest: { hash: latestBlockHash!, number: latestBlockNumber },
      proven: { hash: provenBlockHash!, number: provenBlockNumber },
      finalized: { hash: finalizedBlockHash!, number: finalizedBlockNumber },
    };
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    this.log.debug(`Handling block stream event ${event.type}`);
    switch (event.type) {
      case 'blocks-added':
        await this.handleLatestL2Blocks(event.blocks);
        break;
      case 'chain-finalized': {
        // TODO (alexg): I think we can prune the block hashes map here
        await this.setBlockHash(event.block);
        const from = (await this.getSyncedFinalizedBlockNum()) + 1;
        const limit = event.block.number - from + 1;
        if (limit > 0) {
          await this.handleFinalizedL2Blocks(await this.l2BlockSource.getBlocks(from, limit));
        }
        break;
      }
      case 'chain-proven': {
        await this.setBlockHash(event.block);
        await this.synchedProvenBlockNumber.set(event.block.number);
        break;
      }
      case 'chain-pruned':
        await this.setBlockHash(event.block);
        await this.handlePruneL2Blocks(event.block.number);
        break;
      default: {
        const _: never = event;
        break;
      }
    }
  }

  private async setBlockHash(block: L2BlockId): Promise<void> {
    if (block.hash !== undefined) {
      await this.synchedBlockHashes.set(block.number, block.hash.toString());
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
    const latestBlockNumbers = await this.l2BlockSource.getL2Tips();
    this.latestBlockNumberAtStart = latestBlockNumbers.latest.number;
    this.provenBlockNumberAtStart = latestBlockNumbers.proven.number;
    this.finalizedBlockNumberAtStart = latestBlockNumbers.finalized.number;

    const syncedLatestBlock = (await this.getSyncedLatestBlockNum()) + 1;
    const syncedProvenBlock = (await this.getSyncedProvenBlockNum()) + 1;
    const syncedFinalizedBlock = (await this.getSyncedFinalizedBlockNum()) + 1;

    if (
      (await this.txPool.isEmpty()) &&
      (this.attestationPool === undefined || (await this.attestationPool?.isEmpty()))
    ) {
      // if mempools are empty, we don't care about syncing prior blocks
      this.initBlockStream(this.latestBlockNumberAtStart);
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
    return this.syncPromise;
  }

  private initBlockStream(startingBlock?: number) {
    if (!this.blockStream) {
      const { blockRequestBatchSize: batchSize, blockCheckIntervalMS: pollIntervalMS } = this.config;
      this.blockStream = new TraceableL2BlockStream(
        this.l2BlockSource,
        this,
        this,
        this.telemetry.getTracer('P2PL2BlockStream'),
        'P2PL2BlockStream',
        createLogger('p2p:l2-block-stream'),
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
    await this.p2pService.stop();
    this.log.debug('Stopped p2p service');
    await this.blockStream?.stop();
    this.log.debug('Stopped block downloader');
    await this.runningPromise;
    this.setCurrentState(P2PClientState.STOPPED);
    this.log.info('P2P client stopped.');
  }

  /** Triggers a sync to the archiver. Used for testing. */
  public async sync() {
    this.initBlockStream();
    await this.blockStream!.sync();
  }

  @trackSpan('p2pClient.broadcastProposal', async proposal => ({
    [Attributes.BLOCK_NUMBER]: proposal.blockNumber.toNumber(),
    [Attributes.SLOT_NUMBER]: proposal.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: proposal.archive.toString(),
    [Attributes.P2P_ID]: (await proposal.p2pMessageIdentifier()).toString(),
  }))
  public broadcastProposal(proposal: BlockProposal): Promise<void> {
    this.log.verbose(`Broadcasting proposal for slot ${proposal.slotNumber.toNumber()} to peers`);
    return this.p2pService.propagate(proposal);
  }

  public async getAttestationsForSlot(slot: bigint, proposalId?: string): Promise<BlockAttestation[]> {
    return (
      (await (proposalId
        ? this.attestationPool?.getAttestationsForSlotAndProposal(slot, proposalId)
        : this.attestationPool?.getAttestationsForSlot(slot))) ?? []
    );
  }

  public addAttestations(attestations: BlockAttestation[]): Promise<void> {
    return this.attestationPool?.addAttestations(attestations) ?? Promise.resolve();
  }

  // REVIEW: https://github.com/AztecProtocol/aztec-packages/issues/7963
  // ^ This pattern is not my favorite (md)
  public registerBlockProposalHandler(handler: P2PBlockReceivedCallback): void {
    this.p2pService.registerBlockReceivedCallback(handler);
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
  public async requestTxsByHash(txHashes: TxHash[], pinnedPeerId: PeerId | undefined): Promise<(Tx | undefined)[]> {
    const timeoutMs = 8000; // Longer timeout for now
    const maxPeers = Math.min(Math.ceil(txHashes.length / 3), 10);
    const maxRetryAttempts = 10; // Keep retrying within the timeout

    const txs = await this.p2pService.sendBatchRequest(
      ReqRespSubProtocol.TX,
      txHashes,
      pinnedPeerId,
      timeoutMs,
      maxPeers,
      maxRetryAttempts,
    );

    // Some transactions may return undefined, so we filter them out
    const filteredTxs = txs.filter((tx): tx is Tx => !!tx);
    if (filteredTxs.length > 0) {
      await this.txPool.addTxs(filteredTxs);
    }
    const txHashesStr = txHashes.map(tx => tx.toString()).join(', ');
    this.log.debug(`Requested txs ${txHashesStr} (${filteredTxs.length} / ${txHashes.length}}) from peers`);

    // We return all transactions, even the not found ones to the caller, such they can handle missing items themselves.
    return txs;
  }

  public getPendingTxs(): Promise<Tx[]> {
    return this.getTxs('pending');
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
    const fetchedMissingTxs = missingTxs.filter((tx): tx is Tx => !!tx);

    // TODO: optimize
    // Merge the found txs in order
    const mergingTxsPromises = txHashes.map(async txHash => {
      // Is it in the txs list from the mempool?
      for (const tx of txs) {
        if (tx !== undefined && (await tx.getTxHash()).equals(txHash)) {
          return tx;
        }
      }

      // Is it in the fetched missing txs?
      for (const tx of fetchedMissingTxs) {
        if (tx !== undefined && (await tx.getTxHash()).equals(txHash)) {
          return tx;
        }
      }

      // Otherwise return undefined
      return undefined;
    });

    return await Promise.all(mergingTxsPromises);
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
    return await this.txPool.addTxs(txs);
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

  public async getSyncedFinalizedBlockNum(): Promise<number> {
    return (await this.synchedFinalizedBlockNumber.getAsync()) ?? INITIAL_L2_BLOCK_NUM - 1;
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
  private async handleLatestL2Blocks(blocks: PublishedL2Block[]): Promise<void> {
    if (!blocks.length) {
      return Promise.resolve();
    }

    await this.markTxsAsMinedFromBlocks(blocks.map(b => b.block));
    void this.requestMissingTxsFromUnprovenBlocks(blocks.map(b => b.block));

    const lastBlock = blocks.at(-1)!.block;

    await Promise.all(
      blocks.map(async block =>
        this.setBlockHash({
          number: block.block.number,
          hash: await block.block.hash().then(h => h.toString()),
        }),
      ),
    );

    await this.synchedLatestBlockNumber.set(lastBlock.number);
    await this.synchedLatestSlot.set(lastBlock.header.getSlot());
    this.log.verbose(`Synched to latest block ${lastBlock.number}`);
    await this.startServiceIfSynched();
  }

  /** Request txs for unproven blocks so the prover node has more chances to get them. */
  private async requestMissingTxsFromUnprovenBlocks(blocks: L2Block[]): Promise<void> {
    try {
      const provenBlockNumber = Math.max(await this.getSyncedProvenBlockNum(), this.provenBlockNumberAtStart);
      const unprovenBlocks = blocks.filter(block => block.number > provenBlockNumber);
      const txHashes = unprovenBlocks.flatMap(block => block.body.txEffects.map(txEffect => txEffect.txHash));
      const missingTxHashes = await this.txPool
        .hasTxs(txHashes)
        .then(availability => txHashes.filter((_, index) => !availability[index]));
      if (missingTxHashes.length > 0) {
        this.log.verbose(
          `Requesting ${missingTxHashes.length} missing txs from peers for ${unprovenBlocks.length} unproven mined blocks`,
          { missingTxHashes, unprovenBlockNumbers: unprovenBlocks.map(block => block.number) },
        );
        await this.requestTxsByHash(missingTxHashes, undefined);
      }
    } catch (err) {
      this.log.error(`Error requesting missing txs from unproven blocks`, err, {
        blocks: blocks.map(block => block.number),
      });
    }
  }

  /**
   * Handles new finalized blocks by deleting the txs and attestations in them.
   * @param blocks - A list of finalized L2 blocks.
   * @returns Empty promise.
   */
  private async handleFinalizedL2Blocks(blocks: L2Block[]): Promise<void> {
    this.log.trace(`Handling finalized blocks ${blocks.length} up to ${blocks.at(-1)?.number}`);
    if (!blocks.length) {
      return Promise.resolve();
    }

    const lastBlockNum = blocks[blocks.length - 1].number;
    const lastBlockSlot = blocks[blocks.length - 1].header.getSlot();

    await this.deleteTxsFromBlocks(blocks);
    await this.attestationPool?.deleteAttestationsOlderThan(lastBlockSlot);

    await this.synchedFinalizedBlockNumber.set(lastBlockNum);
    this.log.debug(`Synched to finalized block ${lastBlockNum}`);

    await this.startServiceIfSynched();
  }

  /**
   * Updates the tx pool after a chain prune.
   * @param latestBlock - The block number the chain was pruned to.
   */
  private async handlePruneL2Blocks(latestBlock: number): Promise<void> {
    // NOTE: temporary fix for alphanet, deleting ALL txs that were in the epoch from the pool #13723
    // TODO: undo once fixed: #13770
    const txsToDelete = new Map<string, TxHash>();
    const minedTxs = await this.txPool.getMinedTxHashes();
    for (const [txHash, blockNumber] of minedTxs) {
      if (blockNumber > latestBlock) {
        txsToDelete.set(txHash.toString(), txHash);
      }
    }

    // Find transactions that reference pruned blocks in their historical header
    for (const tx of await this.txPool.getAllTxs()) {
      // every tx that's been generated against a block that has now been pruned is no longer valid
      if (tx.data.constants.historicalHeader.globalVariables.blockNumber.toNumber() > latestBlock) {
        const txHash = await tx.getTxHash();
        txsToDelete.set(txHash.toString(), txHash);
      }
    }

    this.log.info(
      `Detected chain prune. Removing invalid txs count=${
        txsToDelete.size
      } newLatestBlock=${latestBlock} previousLatestBlock=${await this.getSyncedLatestBlockNum()}`,
    );

    // delete invalid txs (both pending and mined)
    await this.txPool.deleteTxs(Array.from(txsToDelete.values()));

    // everything left in the mined set was built against a block on the proven chain so its still valid
    // move back to pending the txs that were reorged out of the chain
    // NOTE: we can't move _all_ txs back to pending because the tx pool could keep hold of mined txs for longer
    // (see this.keepProvenTxsFor)

    // NOTE: given current fix for alphanet, the code below is redundant as all these txs will be deleted.
    // TODO: bring back once fixed: #13770
    // const txsToMoveToPending: TxHash[] = [];
    // for (const [txHash, blockNumber] of minedTxs) {
    //   if (blockNumber > latestBlock) {
    //     txsToMoveToPending.push(txHash);
    //   }
    // }

    // this.log.info(`Moving ${txsToMoveToPending.length} mined txs back to pending`);
    // await this.txPool.markMinedAsPending(txsToMoveToPending);

    await this.synchedLatestBlockNumber.set(latestBlock);
    // no need to update block hashes, as they will be updated as new blocks are added
  }

  private async startServiceIfSynched() {
    if (this.currentState !== P2PClientState.SYNCHING) {
      return;
    }
    const syncedFinalizedBlock = await this.getSyncedFinalizedBlockNum();
    const syncedProvenBlock = await this.getSyncedProvenBlockNum();
    const syncedLatestBlock = await this.getSyncedLatestBlockNum();

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
   * Marks transactions as non-evictable in the pool.
   * @param txHashes - Hashes of the transactions to mark as non-evictable.
   */
  public markTxsAsNonEvictable(txHashes: TxHash[]): Promise<void> {
    return this.txPool.markTxsAsNonEvictable(txHashes);
  }
}
