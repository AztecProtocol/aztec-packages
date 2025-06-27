import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
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
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { type PeerInfo, tryStop } from '@aztec/stdlib/interfaces/server';
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
import type { AuthRequest, StatusMessage } from '../services/index.js';
import {
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandler,
  type ReqRespSubProtocolValidators,
import { chunkTxHashesRequest } from '../services/reqresp/protocols/tx.js';
} from '../services/reqresp/interface.js';
import type { P2PBlockReceivedCallback, P2PService } from '../services/service.js';
import { TxCollection } from '../services/tx_collection/tx_collection.js';
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

  private synchedBlockHashes: AztecAsyncMap<number, string>;
  private synchedLatestBlockNumber: AztecAsyncSingleton<number>;
  private synchedProvenBlockNumber: AztecAsyncSingleton<number>;
  private synchedFinalizedBlockNumber: AztecAsyncSingleton<number>;
  private synchedLatestSlot: AztecAsyncSingleton<bigint>;

  private txPool: TxPool;
  private attestationPool: T extends P2PClientType.Full ? AttestationPool : undefined;

  private config: P2PConfig;

  private blockStream: L2BlockStream | undefined;

  private txProvider: TxProvider;

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
    private txCollection: TxCollection,
    config: Partial<P2PConfig> = {},
    private _dateProvider: DateProvider = new DateProvider(),
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p'),
  ) {
    super(telemetry, 'P2PClient');

    this.config = { ...getP2PDefaultConfig(), ...config };
    this.txPool = mempools.txPool;
    this.attestationPool = mempools.attestationPool!;

    this.txProvider = new TxProvider(
      this.txCollection,
      this.txPool,
      this,
      this.log.createChild('tx-provider'),
      this.telemetry,
    );

    // Default to collecting all txs when we see a valid proposal
    // This can be overridden by the validator client to attest, and it will call getTxsForBlockProposal on its own
    // TODO(palla/txs): We should not trigger a request for txs on a proposal before fully validating it. We need to bring
    // validator-client code into here so we can validate a proposal is reasonable.
    this.registerBlockProposalHandler(async (block, sender) => {
      this.log.debug(`Received block proposal from ${sender.toString()}`);
      // TODO(palla/txs): Need to subtract validatorReexecuteDeadlineMs from this deadline (see ValidatorClient.getReexecutionDeadline)
      const constants = this.txCollection.getConstants();
      const nextSlotTimestampSeconds = Number(getTimestampForSlot(block.slotNumber.toBigInt() + 1n, constants));
      const deadline = new Date(nextSlotTimestampSeconds * 1000);
      await this.txProvider.getTxsForBlockProposal(block, { pinnedPeer: sender, deadline });
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

  public getTxProvider(): TxProvider {
    return this.txProvider;
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
        this.txCollection.stopCollectingForBlocksUpTo(event.block.number);
        await this.synchedProvenBlockNumber.set(event.block.number);
        break;
      }
      case 'chain-pruned':
        await this.setBlockHash(event.block);
        this.txCollection.stopCollectingForBlocksAfter(event.block.number);
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
    await this.txCollection.start();
    return this.syncPromise;
  }

  addReqRespSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void> {
    return this.p2pService.addReqRespSubProtocol(subProtocol, handler, validator);
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
    await this.p2pService.stop();
    this.log.debug('Stopped p2p service');
    await this.blockStream?.stop();
    this.log.debug('Stopped block downloader');
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
    [Attributes.BLOCK_NUMBER]: proposal.blockNumber,
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
   * Uses the batched Request Response protocol to request a set of transactions from the network.
   */
  public async requestTxsByHash(txHashes: TxHash[], pinnedPeerId: PeerId | undefined): Promise<Tx[]> {
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
      await this.txPool.addTxs(txs);
    }

    const txHashesStr = txHashes.map(tx => tx.toString()).join(', ');
    this.log.debug(`Requested txs ${txHashesStr} (${txs.length} / ${txHashes.length}) from peers`);

    // We return all transactions, even the not found ones to the caller, such they can handle missing items themselves.
    return txs;
  }

  public getPendingTxs(limit?: number, after?: TxHash): Promise<Tx[]> {
    return this.getTxs('pending', limit, after);
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
   * @param filter - The type of txs to return
   * @param limit - How many txs to return
   * @param after - If paginating, the last known tx hash. Will return txs after this hash
   * @returns An array of Txs.
   */
  public async getTxs(filter: 'all' | 'pending' | 'mined', limit?: number, after?: TxHash): Promise<Tx[]> {
    if (limit !== undefined && limit <= 0) {
      throw new TypeError('limit must be greater than 0');
    }

    let txs: Tx[] | undefined = undefined;
    let txHashes: TxHash[];

    if (filter === 'all') {
      txs = await this.txPool.getAllTxs();
      txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    } else if (filter === 'mined') {
      const minedTxHashes = await this.txPool.getMinedTxHashes();
      txHashes = minedTxHashes.map(([txHash]) => txHash);
    } else if (filter === 'pending') {
      txHashes = await this.txPool.getPendingTxHashes();
    } else {
      const _: never = filter;
      throw new Error(`Unknown filter ${filter}`);
    }

    let startIndex = 0;
    let endIndex: number | undefined = undefined;

    if (after) {
      startIndex = txHashes.findIndex(txHash => after.equals(txHash));

      // if we can't find the last tx in our set then return an empty array as pagination is no longer valid.
      if (startIndex === -1) {
        return [];
      }

      // increment by one because we don't want to return the same tx again
      startIndex++;
    }

    if (limit !== undefined) {
      endIndex = startIndex + limit;
    }

    txHashes = txHashes.slice(startIndex, endIndex);
    if (txs) {
      txs = txs.slice(startIndex, endIndex);
    } else {
      const maybeTxs = await Promise.all(txHashes.map(txHash => this.txPool.getTxByHash(txHash)));
      txs = maybeTxs.filter((tx): tx is Tx => !!tx);
    }

    return txs;
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
    const mergingTxsPromises = txHashes.map(async txHash => {
      // Is it in the txs list from the mempool?
      for (const tx of txs) {
        if (tx !== undefined && (await tx.getTxHash()).equals(txHash)) {
          return tx;
        }
      }

      // Is it in the fetched missing txs?
      // Note: this is an O(n^2) operation, but we expect the number of missing txs to be small.
      for (const tx of missingTxs) {
        if ((await tx.getTxHash()).equals(txHash)) {
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
      await this.txPool.markAsMined(txHashes, block.header);
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
    await this.startCollectingMissingTxs(blocks.map(b => b.block));

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
      if (tx.data.constants.historicalHeader.globalVariables.blockNumber > latestBlock) {
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

  public shouldTrustWithIdentity(peerId: PeerId): boolean {
    return this.p2pService.shouldTrustWithIdentity(peerId);
  }

  public handleAuthFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage> {
    return this.p2pService.handleAuthFromPeer(authRequest, peerId);
  }
}
