import { compactArray } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise } from '@aztec/foundation/promise';
import { DateProvider, elapsed } from '@aztec/foundation/timer';
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
import { TxCollectionInstrumentation } from './instrumentation.js';
import { SlowTxCollection } from './slow_tx_collection.js';
import type { TxSource } from './tx_source.js';

/** Internal interface to fast and slow collection services. */
export interface TxCollectionManager {
  collect(
    collectFn: (txHashes: TxHash[]) => Promise<(Tx | undefined)[]>,
    requested: TxHash[],
    info: Record<string, any> & { description: string; method: CollectionMethod },
  ): Promise<{ txs: TxWithHash[]; requested: TxHash[]; duration: number }>;

  getFastCollectionRequests(): Set<FastCollectionRequest>;
}

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
 * The slow collection loops are used for periodically collecting missing txs from mined blocks,
 * from remote RPC nodes and via reqresp. The fast collection methods are used to quickly gather
 * txs, usually for attesting to block proposals or preparing to prove an epoch.
 */
export class TxCollection {
  /** Slow collection background loops */
  private readonly slowCollection: SlowTxCollection;

  /** Fast collection methods */
  private readonly fastCollection: FastTxCollection;

  /** Loop for periodically reconciling found transactions from the tx pool in case we missed some */
  private readonly reconcileFoundTxsLoop: RunningPromise;

  /** Metrics */
  private readonly instrumentation: TxCollectionInstrumentation;

  /** Handler for the txs-added event from the tx pool */
  private handleTxsAddedToPool: TxPoolEvents['txs-added'] | undefined;

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
    const collectionManager: TxCollectionManager = {
      collect: (collectFn, requested, info) => this.collect(collectFn, requested, info),
      getFastCollectionRequests: () => this.fastCollection.getFastCollectionRequests(),
    };

    this.instrumentation = new TxCollectionInstrumentation(telemetryClient, 'TxCollection');

    this.slowCollection = new SlowTxCollection(
      this.reqResp,
      this.nodes,
      collectionManager,
      constants,
      this.config,
      this.dateProvider,
      this.log,
    );

    this.fastCollection = new FastTxCollection(
      this.reqResp,
      this.nodes,
      collectionManager,
      this.config,
      this.dateProvider,
      this.log,
    );

    this.reconcileFoundTxsLoop = new RunningPromise(
      () => this.reconcileFoundTxsWithPool(),
      this.log,
      this.config.txCollectionReconcileIntervalMs,
    );
  }

  /** Starts all collection loops. */
  public start(): Promise<void> {
    this.slowCollection.start();
    this.reconcileFoundTxsLoop.start();

    this.handleTxsAddedToPool = async (args: Parameters<TxPoolEvents['txs-added']>[0]) => {
      const { txs, source } = args;
      if (source !== 'tx-collection') {
        this.foundTxs(await Tx.toTxsWithHashes(txs));
      }
    };
    this.txPool.on('txs-added', this.handleTxsAddedToPool);

    // TODO(palla/txs): Collect mined unproven tx hashes for txs we dont have in the pool and populate missingTxs on startup
    return Promise.resolve();
  }

  /** Stops all activity. */
  public async stop() {
    await Promise.all([this.slowCollection.stop(), this.fastCollection.stop(), this.reconcileFoundTxsLoop.stop()]);
    if (this.handleTxsAddedToPool) {
      this.txPool.removeListener('txs-added', this.handleTxsAddedToPool);
    }
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

  /**
   * Wrapper for a collection function. Handles logging, metrics, removing found txs from the missing set,
   * adding them to the found set (for fast requests only), and adding to the tx pool. Called by both fast and slow
   * collection methods whenever they actually collect txs.
   */
  private async collect(
    collectFn: (txHashes: TxHash[]) => Promise<(Tx | undefined)[]>,
    requested: TxHash[],
    info: Record<string, any> & { description: string; method: CollectionMethod },
  ) {
    // Execute collection function and measure the time taken, catching any errors.
    const [duration, response] = await elapsed(async () => {
      try {
        return await collectFn(requested);
      } catch (err) {
        this.log.error(`Error collecting txs via ${info.description}`, err, {
          ...info,
          requestedTxs: requested.map(hash => hash.toString()),
        });
        return [] as (Tx | undefined)[];
      }
    });

    // Report metrics for the collection
    const txs = await Tx.toTxsWithHashes(response.filter(tx => tx !== undefined));
    if (txs.length > 0) {
      this.log.verbose(
        `Collected ${txs.length} txs out of ${requested.length} requested via ${info.description} in ${duration}ms`,
        { ...info, duration, txs: txs.map(t => t.txHash.toString()), requestedTxs: requested.map(t => t.toString()) },
      );
      this.instrumentation.increaseTxsFor(info.method, txs.length, duration);
    }

    // Mark txs as found in the slow missing txs set and all fast requests
    this.foundTxs(txs);

    // Add txs to the tx pool (should not fail, but we catch it just in case)
    try {
      await this.txPool.addTxs(txs, { source: `tx-collection` });
    } catch (err) {
      this.log.error(`Error adding txs to the pool via ${info.description}`, err, {
        ...info,
        requestedTxs: requested.map(hash => hash.toString()),
      });
      // Return no txs since none have been added
      return { txs: [], requested, duration };
    }

    return { txs, requested, duration };
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
