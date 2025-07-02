import { compactArray } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { BlockInfo, L2Block } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { Tx, TxHash, type TxWithHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';

import type { TxPool } from '../../mem_pools/index.js';
import type { TxPoolEvents } from '../../mem_pools/tx_pool/tx_pool.js';
import type { ReqRespInterface } from '../reqresp/interface.js';
import type { TxCollectionConfig } from './config.js';
import { FastTxCollection } from './fast_tx_collection.js';
import { SlowTxCollection } from './slow_tx_collection.js';
import { TxCollectionSink } from './tx_collection_sink.js';
import type { TxSource } from './tx_source.js';

export type CollectionMethod = 'fast-req-resp' | 'fast-node-rpc' | 'slow-req-resp' | 'slow-node-rpc';

export type MissingTxInfo = { blockNumber: number; deadline: Date; readyForReqResp: boolean };

export type FastCollectionRequestInput =
  | { type: 'block'; block: L2Block }
  | { type: 'proposal'; blockProposal: BlockProposal };

export type FastCollectionRequest = FastCollectionRequestInput & {
  missingTxHashes: Set<string>;
  deadline: Date;
  blockInfo: BlockInfo;
  promise: PromiseWithResolvers<void>;
  foundTxs: Map<string, TxWithHash>;
};

/**
 * Coordinates tx collection from remote RPC nodes and reqresp.
 *
 * The slow collection loops are used for periodically collecting missing txs from mined blocks,
 * from remote RPC nodes and via reqresp. The fast collection methods are used to quickly gather
 * txs, usually for attesting to block proposals or preparing to prove an epoch. The slow and fast
 * collection instances both send their txs to the collection sink, which handles metrics and adds
 * them to the tx pool. Whenever a tx is added to either the sink or the pool, this service is notified
 * via events and notifies the slow and fast collection loops to stop collecting that tx, so that we don't
 * collect the same tx multiple times.
 */
export class TxCollection {
  /** Slow collection background loops */
  protected readonly slowCollection: SlowTxCollection;

  /** Fast collection methods */
  protected readonly fastCollection: FastTxCollection;

  /** Loop for periodically reconciling found transactions from the tx pool in case we missed some */
  private readonly reconcileFoundTxsLoop: RunningPromise;

  /** Handles txs found by the slow and fast collection loops */
  private readonly txCollectionSink: TxCollectionSink;

  /** Handler for the txs-added event from the tx pool */
  protected readonly handleTxsAddedToPool: TxPoolEvents['txs-added'];

  /** Handler for the txs-added event from the tx collection sink */
  protected readonly handleTxsFound: TxPoolEvents['txs-added'];

  constructor(
    private readonly reqResp: Pick<ReqRespInterface, 'sendBatchRequest'>,
    private readonly nodes: TxSource[],
    private readonly constants: L1RollupConstants,
    private readonly txPool: TxPool,
    private readonly config: TxCollectionConfig,
    private readonly dateProvider: DateProvider = new DateProvider(),
    telemetryClient: TelemetryClient = getTelemetryClient(),
    private readonly log: Logger = createLogger('p2p:tx_collection_service'),
  ) {
    this.txCollectionSink = new TxCollectionSink(this.txPool, telemetryClient, this.log);

    this.fastCollection = new FastTxCollection(
      this.reqResp,
      this.nodes,
      this.txCollectionSink,
      this.config,
      this.dateProvider,
      this.log,
    );

    this.slowCollection = new SlowTxCollection(
      this.reqResp,
      this.nodes,
      this.txCollectionSink,
      this.fastCollection,
      constants,
      this.config,
      this.dateProvider,
      this.log,
    );

    this.reconcileFoundTxsLoop = new RunningPromise(
      () => this.reconcileFoundTxsWithPool(),
      this.log,
      this.config.txCollectionReconcileIntervalMs,
    );

    this.handleTxsFound = (args: Parameters<TxPoolEvents['txs-added']>[0]) => {
      this.foundTxs(args.txs);
    };
    this.txCollectionSink.on('txs-added', this.handleTxsFound);

    this.handleTxsAddedToPool = (args: Parameters<TxPoolEvents['txs-added']>[0]) => {
      const { txs, source } = args;
      if (source !== 'tx-collection') {
        this.foundTxs(txs);
      }
    };
    this.txPool.on('txs-added', this.handleTxsAddedToPool);
  }

  /** Starts all collection loops. */
  public start(): Promise<void> {
    this.slowCollection.start();
    this.reconcileFoundTxsLoop.start();

    // TODO(palla/txs): Collect mined unproven tx hashes for txs we dont have in the pool and populate missingTxs on startup
    return Promise.resolve();
  }

  /** Stops all activity. */
  public async stop() {
    await Promise.all([this.slowCollection.stop(), this.fastCollection.stop(), this.reconcileFoundTxsLoop.stop()]);

    this.txPool.removeListener('txs-added', this.handleTxsAddedToPool);
    this.txCollectionSink.removeListener('txs-added', this.handleTxsFound);
  }

  /** Force trigger the slow collection and reconciliation loops */
  public async trigger() {
    await Promise.all([this.reconcileFoundTxsLoop.trigger(), this.slowCollection.trigger()]);
  }

  /** Returns L1 rollup constants. */
  public getConstants(): L1RollupConstants {
    return this.constants;
  }

  /** Starts collecting the given tx hashes for the given L2Block in the slow loop */
  public startCollecting(block: L2Block, txHashes: TxHash[]) {
    return this.slowCollection.startCollecting(block, txHashes);
  }

  /** Collects the set of txs for the given block proposal as fast as possible */
  public collectFastForProposal(
    blockProposal: BlockProposal,
    txHashes: TxHash[] | string[],
    opts: { deadline: Date; pinnedPeer?: PeerId },
  ) {
    return this.collectFastFor({ type: 'proposal', blockProposal }, txHashes, opts);
  }

  /** Collects the set of txs for the given mined block as fast as possible */
  public collectFastForBlock(
    block: L2Block,
    txHashes: TxHash[] | string[],
    opts: { deadline: Date; pinnedPeer?: PeerId },
  ) {
    return this.collectFastFor({ type: 'block', block }, txHashes, opts);
  }

  /** Collects the set of txs for the given proposal or block as fast as possible */
  public collectFastFor(
    input: FastCollectionRequestInput,
    txHashes: TxHash[] | string[],
    opts: { deadline: Date; pinnedPeer?: PeerId },
  ) {
    return this.fastCollection.collectFastFor(input, txHashes, opts);
  }

  /** Mark the given txs as found. Stops collecting them. */
  private foundTxs(txs: TxWithHash[]) {
    this.slowCollection.foundTxs(txs);
    this.fastCollection.foundTxs(txs);
  }

  /**
   * Stop collecting all txs for blocks less than or requal to the block number specified.
   * To be called when we no longer care about gathering txs up to a certain block, eg when they become proven or finalized.
   */
  public stopCollectingForBlocksUpTo(blockNumber: number): void {
    this.slowCollection.stopCollectingForBlocksUpTo(blockNumber);
    this.fastCollection.stopCollectingForBlocksUpTo(blockNumber);
  }

  /**
   * Stop collecting all txs for blocks greater than the block number specified.
   * To be called when there is a chain prune and previously mined txs are no longer relevant.
   */
  public stopCollectingForBlocksAfter(blockNumber: number): void {
    this.slowCollection.stopCollectingForBlocksAfter(blockNumber);
    this.fastCollection.stopCollectingForBlocksAfter(blockNumber);
  }

  /** Every now and then, check if the pool has received one of the txs we are looking for, just to catch any race conditions */
  private async reconcileFoundTxsWithPool() {
    const missingTxHashes = this.slowCollection.getMissingTxHashes();
    const foundTxs = await Tx.toTxsWithHashes(compactArray(await this.txPool.getTxsByHash(missingTxHashes)));
    if (foundTxs.length > 0) {
      this.log.verbose(`Found ${foundTxs.length} txs in the pool during reconciliation`, {
        foundTxs: foundTxs.map(t => t.txHash.toString()),
      });
      this.foundTxs(foundTxs);
    }
  }
}
