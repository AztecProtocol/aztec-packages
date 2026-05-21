import { BlockNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { L2Block, L2BlockInfo } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx } from '@aztec/stdlib/tx';
import { TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';

import type { TxPoolV2, TxPoolV2Events } from '../../mem_pools/tx_pool_v2/interfaces.js';
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import type { TxCollectionConfig } from './config.js';
import { FastTxCollection } from './fast_tx_collection.js';
import { FileStoreTxCollection } from './file_store_tx_collection.js';
import type { FileStoreTxSource } from './file_store_tx_source.js';
import type { IRequestTracker } from './request_tracker.js';
import { type TxAddContext, TxCollectionSink } from './tx_collection_sink.js';
import type { TxSource } from './tx_source.js';

export type CollectionMethod = 'fast-req-resp' | 'fast-node-rpc' | 'file-store';

export type FastCollectionRequestInput =
  | { type: 'block'; block: L2Block }
  | { type: 'proposal'; blockProposal: BlockProposal; blockNumber: BlockNumber };

export type FastCollectionRequest = FastCollectionRequestInput & {
  requestTracker: IRequestTracker;
  blockInfo: L2BlockInfo;
};

/**
 * Coordinates tx collection from remote RPC nodes, reqresp, and file store.
 *
 * The fast collection methods quickly gather txs from RPC nodes and reqresp, usually for attesting
 * to block proposals or preparing to prove an epoch. A delayed file-store fallback can also fetch
 * txs if configured. Both paths send txs to the collection sink, which handles metrics and adds
 * them to the tx pool. Whenever a tx is added to either the sink or the pool, this service is
 * notified via events and stops collecting that tx across all in-flight requests.
 */
export class TxCollection {
  /** Fast collection methods */
  protected readonly fastCollection: FastTxCollection;

  /** File store collection for fast (proposal/proving) path */
  protected readonly fileStoreFastCollection: FileStoreTxCollection;

  /** Handles txs found by collection paths before adding to the pool */
  private readonly txCollectionSink: TxCollectionSink;

  /** Handler for the txs-added event from the tx pool */
  protected readonly handleTxsAddedToPool: TxPoolV2Events['txs-added'];

  /** Handler for the txs-added event from the tx collection sink */
  protected readonly handleTxsFound: TxPoolV2Events['txs-added'];

  /** Whether the service has been started. */
  private started = false;

  /** Whether file store sources are configured. */
  private readonly hasFileStoreSources: boolean;

  constructor(
    private readonly p2pService: BatchTxRequesterLibP2PService,
    private readonly nodes: TxSource[],
    private readonly constants: L1RollupConstants,
    private readonly txPool: TxPoolV2,
    private readonly config: TxCollectionConfig,
    fileStoreSources: FileStoreTxSource[] = [],
    private readonly dateProvider: DateProvider = new DateProvider(),
    telemetryClient: TelemetryClient = getTelemetryClient(),
    private readonly log: Logger = createLogger('p2p:tx_collection_service'),
  ) {
    this.txCollectionSink = new TxCollectionSink(this.txPool, telemetryClient, this.log);

    this.fastCollection = new FastTxCollection(
      this.p2pService,
      this.nodes,
      this.txCollectionSink,
      this.config,
      this.dateProvider,
      this.log,
    );

    this.hasFileStoreSources = fileStoreSources.length > 0;
    this.fileStoreFastCollection = new FileStoreTxCollection(
      fileStoreSources,
      this.txCollectionSink,
      {
        workerCount: config.txCollectionFileStoreFastWorkerCount,
        backoffBaseMs: config.txCollectionFileStoreFastBackoffBaseMs,
        backoffMaxMs: config.txCollectionFileStoreFastBackoffMaxMs,
      },
      this.dateProvider,
      this.log,
    );

    this.handleTxsFound = (args: Parameters<TxPoolV2Events['txs-added']>[0]) => {
      this.foundTxs(args.txs);
    };
    this.txCollectionSink.on('txs-added', this.handleTxsFound);

    this.handleTxsAddedToPool = (args: Parameters<TxPoolV2Events['txs-added']>[0]) => {
      const { txs, source } = args;
      if (source !== 'tx-collection') {
        this.foundTxs(txs);
      }
    };
    this.txPool.on('txs-added', this.handleTxsAddedToPool);
  }

  /** Starts all collection loops. */
  public start(): Promise<void> {
    this.started = true;
    this.fileStoreFastCollection.start();

    // TODO(palla/txs): Collect mined unproven tx hashes for txs we dont have in the pool and populate missingTxs on startup
    return Promise.resolve();
  }

  /** Stops all activity. */
  public async stop() {
    this.started = false;
    await Promise.all([this.fastCollection.stop(), this.fileStoreFastCollection.stop()]);

    this.txPool.removeListener('txs-added', this.handleTxsAddedToPool);
    this.txCollectionSink.removeListener('txs-added', this.handleTxsFound);
  }

  /** Returns L1 rollup constants. */
  public getConstants(): L1RollupConstants {
    return this.constants;
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
    const hashes = txHashes.map(h => (typeof h === 'string' ? TxHash.fromString(h) : h));

    // Delay file store collection to give P2P methods time to find txs first
    if (this.hasFileStoreSources) {
      const context = this.getAddContextForInput(input);
      sleep(this.config.txCollectionFileStoreFastDelayMs)
        .then(() => {
          if (!this.started) {
            return;
          }

          // Only queue txs that are still missing after the delay.
          const missingTxHashStrings = new Set(this.fastCollection.getMissingTxHashes().map(hash => hash.toString()));
          const missingTxHashesToCollect = hashes.filter(hash => missingTxHashStrings.has(hash.toString()));
          if (missingTxHashesToCollect.length > 0) {
            this.fileStoreFastCollection.startCollecting(missingTxHashesToCollect, context, opts.deadline);
          }
        })
        .catch(err => this.log.error('Error in file store fast delay', err));
    }

    return this.fastCollection.collectFastFor(input, txHashes, opts);
  }

  /** Returns the TxAddContext for the given fast collection request input */
  private getAddContextForInput(input: FastCollectionRequestInput): TxAddContext {
    if (input.type === 'proposal') {
      return { type: 'proposal', blockHeader: input.blockProposal.blockHeader };
    } else {
      return { type: 'mined', block: input.block };
    }
  }

  /** Mark the given txs as found. Stops collecting them. */
  private foundTxs(txs: Tx[]) {
    this.fastCollection.foundTxs(txs);
    this.fileStoreFastCollection.foundTxs(txs);
  }

  /**
   * Stop collecting all txs for blocks less than or equal to the block number specified.
   * To be called when we no longer care about gathering txs up to a certain block, eg when they become proven or finalized.
   */
  public stopCollectingForBlocksUpTo(blockNumber: BlockNumber): void {
    this.fastCollection.stopCollectingForBlocksUpTo(blockNumber);
    this.fileStoreFastCollection.clearPending();
  }

  /**
   * Stop collecting all txs for blocks greater than the block number specified.
   * To be called when there is a chain prune and previously mined txs are no longer relevant.
   */
  public stopCollectingForBlocksAfter(blockNumber: BlockNumber): void {
    this.fastCollection.stopCollectingForBlocksAfter(blockNumber);
    this.fileStoreFastCollection.clearPending();
  }
}
