import { chunk } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { boundInclusive } from '@aztec/foundation/number';
import { RunningPromise } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { L2Block } from '@aztec/stdlib/block';
import { type L1RollupConstants, getEpochAtSlot, getTimestampRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import { TxHash, TxHashArray, type TxWithHash } from '@aztec/stdlib/tx';

import { type ReqRespInterface, ReqRespSubProtocol } from '../reqresp/interface.js';
import type { TxCollectionConfig } from './config.js';
import type { FastTxCollection } from './fast_tx_collection.js';
import type { MissingTxInfo } from './tx_collection.js';
import type { TxCollectionSink } from './tx_collection_sink.js';
import type { TxSource } from './tx_source.js';

export class SlowTxCollection {
  /** Map from tx hash to missing tx info to collect via slow loop */
  private missingTxs: Map<string, MissingTxInfo> = new Map();

  /** One slow collection loop for each node tx source we have */
  private nodesSlowCollectionLoops: RunningPromise[];

  /** Slow collection loop for reqresp which collects txs from peers */
  private reqrespSlowCollectionLoop: RunningPromise;

  constructor(
    private reqResp: Pick<ReqRespInterface, 'sendBatchRequest'>,
    private nodes: TxSource[],
    private txCollectionSink: TxCollectionSink,
    private fastCollection: Pick<FastTxCollection, 'getFastCollectionRequests'>,
    private constants: L1RollupConstants,
    private config: TxCollectionConfig,
    private dateProvider: DateProvider = new DateProvider(),
    private log: Logger = createLogger('p2p:tx_collection_service'),
  ) {
    this.nodesSlowCollectionLoops = this.nodes.map(
      node =>
        new RunningPromise(
          () => this.collectMissingTxsFromNode(node),
          this.log,
          this.config.txCollectionSlowNodesIntervalMs,
        ),
    );

    this.reqrespSlowCollectionLoop = new RunningPromise(
      () => this.collectMissingTxsViaReqResp(),
      this.log,
      this.config.txCollectionSlowReqRespIntervalMs,
    );
  }

  public getMissingTxHashes() {
    return Array.from(this.missingTxs.keys()).map(TxHash.fromString);
  }

  public start() {
    this.nodesSlowCollectionLoops.forEach(loop => loop.start());
    this.reqrespSlowCollectionLoop.start();
  }

  public async stop() {
    await Promise.all([
      this.reqrespSlowCollectionLoop.stop(),
      ...this.nodesSlowCollectionLoops.map(loop => loop.stop()),
    ]);
  }

  public async trigger() {
    await Promise.all([
      this.reqrespSlowCollectionLoop.trigger(),
      ...this.nodesSlowCollectionLoops.map(loop => loop.trigger()),
    ]);
  }

  /** Starts collecting the given tx hashes for the given L2Block in the slow loop */
  public startCollecting(block: L2Block, txHashes: TxHash[]) {
    const slot = block.header.getSlot();
    const deadline = this.getDeadlineForSlot(slot);
    if (+deadline < this.dateProvider.now()) {
      this.log.debug(`Skipping collection of txs for block ${block.number} at slot ${slot} as it is already expired`, {
        blockNumber: block.number,
        slot: slot.toString(),
        txHashes: txHashes.map(txHash => txHash.toString()),
        deadline: +deadline,
        now: this.dateProvider.now(),
      });
    }

    for (const txHash of txHashes) {
      this.missingTxs.set(txHash.toString(), {
        blockNumber: block.number,
        deadline: this.getDeadlineForSlot(block.header.getSlot()),
        readyForReqResp: this.nodes.length === 0, // If we have no nodes, we can start reqresp immediately
      });
    }
  }

  /** Entrypoint for the node slow collection loop */
  private async collectMissingTxsFromNode(node: TxSource) {
    // If we have any fast requests, we skip the slow collection for this node if configured to do so
    const requests = this.fastCollection.getFastCollectionRequests();
    if (this.config.txCollectionDisableSlowDuringFastRequests && requests.size > 0) {
      this.log.trace(`Skipping node slow collection due to active fast requests`);
      return;
    }

    // Gather all missing txs that are not in fast collection and request them from the node
    const missingTxs = this.getMissingTxsForSlowCollection();
    const missingTxHashes = missingTxs.map(([txHash]) => txHash).map(TxHash.fromString);
    if (missingTxHashes.length === 0) {
      return;
    }

    // Request in chunks to avoid hitting RPC limits
    for (const batch of chunk(missingTxHashes, this.config.txCollectionNodeRpcMaxBatchSize)) {
      await this.txCollectionSink.collect(txHashes => node.getTxsByHash(txHashes), batch, {
        description: `node ${node.getInfo()}`,
        node: node.getInfo(),
        method: 'slow-node-rpc',
      });
    }

    // Mark every tx that is still missing as ready for reqresp.
    // Note that we can just mark all requested txs as ready for reqresp, without filtering out the ones
    // we retrieved, since the ones already found will have been removed from `missingTxs`.
    missingTxs.forEach(([_txHash, info]) => {
      info.readyForReqResp = true;
    });
  }

  /** Entrypoint for the reqresp slow collection loop */
  private async collectMissingTxsViaReqResp() {
    // If we have any fast requests, we skip the slow collection if configured to do so
    const requests = this.fastCollection.getFastCollectionRequests();
    if (this.config.txCollectionDisableSlowDuringFastRequests && requests.size > 0) {
      this.log.trace(`Skipping reqresp slow collection due to active fast requests`);
      return;
    }

    // Gather all missing txs that are not in fast collection and are ready for reqresp
    // A tx is flagged as ready for reqresp if it has been requested from a node at least once
    const missingTxs = this.getMissingTxsForSlowCollection({ onlyReqRespReady: true });
    if (missingTxs.length === 0) {
      return;
    }

    const pinnedPeer = undefined;
    const timeoutMs = this.config.txCollectionSlowReqRespTimeoutMs;
    const maxPeers = boundInclusive(Math.ceil(missingTxs.length / 3), 4, 16);
    const maxRetryAttempts = 3;
    // Per: https://github.com/AztecProtocol/aztec-packages/issues/15149#issuecomment-2999054485
    // we define Q as max number of transactions per batch, the comment explains why we use 8.
    const maxTxsPerBatch = 8;

    // Send a batch request via reqresp for the missing txs
    await this.txCollectionSink.collect(
      async txHashes => {
        const batches: Array<TxHashArray> = [];
        for (let i = 0; i < txHashes.length; i += maxTxsPerBatch) {
          batches.push(new TxHashArray(...txHashes.slice(i, i + maxTxsPerBatch)));
        }
        const txs = await this.reqResp.sendBatchRequest<ReqRespSubProtocol.TX>(
          ReqRespSubProtocol.TX,
          batches,
          pinnedPeer,
          timeoutMs,
          maxPeers,
          maxRetryAttempts,
        );

        return txs.flat();
      },
      missingTxs.map(([txHash]) => TxHash.fromString(txHash)),
      { description: 'slow reqresp', timeoutMs, method: 'slow-req-resp' },
    );
  }

  /** Retrieves all missing txs for the slow collection process. This is, all missing txs that are not part of a fast request. */
  private getMissingTxsForSlowCollection(opts: { onlyReqRespReady?: boolean } = {}): [string, MissingTxInfo][] {
    // Remove expired txs from missingTxs
    const now = this.dateProvider.now();
    const expiredTxs = Array.from(this.missingTxs.entries()).filter(([_, value]) => +value.deadline < now);
    expiredTxs.forEach(([txHash]) => this.missingTxs.delete(txHash));

    // Gather all txs that are marked for fast collection, we do not want to collect them via slow collection.
    // There are some situations where a tx is in both slow and fast collection, for example when a prover node
    // is fast-collecting missing txs for proving an epoch, and still has the tx in the slow collection loops
    // from mined unproven blocks it has seen in the past.
    const fastRequests = this.fastCollection.getFastCollectionRequests();
    const fastCollectionTxs: Set<string> = new Set(
      ...Array.from(fastRequests.values()).flatMap(r => r.missingTxHashes),
    );

    // Return all missing txs that are not in fastCollectionTxs and are ready for reqresp if requested
    return Array.from(this.missingTxs.entries())
      .filter(([txHash, _]) => !fastCollectionTxs.has(txHash))
      .filter(([_, value]) => !opts.onlyReqRespReady || value.readyForReqResp);
  }

  /** Stop collecting the given txs since we have found them. Called whenever tx pool emits a tx-added event. */
  public foundTxs(txs: TxWithHash[]): void {
    for (const txHash of txs.map(tx => tx.txHash)) {
      this.missingTxs.delete(txHash.toString());
    }
  }

  /**
   * Stop collecting all txs for blocks less than or requal to the block number specified.
   * To be called when we no longer care about gathering txs up to a certain block, eg when they become proven or finalized.
   */
  public stopCollectingForBlocksUpTo(blockNumber: number): void {
    for (const [txHash, info] of this.missingTxs.entries()) {
      if (info.blockNumber <= blockNumber) {
        this.missingTxs.delete(txHash);
      }
    }
  }

  /**
   * Stop collecting all txs for blocks greater than the block number specified.
   * To be called when there is a chain prune and previously mined txs are no longer relevant.
   */
  public stopCollectingForBlocksAfter(blockNumber: number): void {
    for (const [txHash, info] of this.missingTxs.entries()) {
      if (info.blockNumber > blockNumber) {
        this.missingTxs.delete(txHash);
      }
    }
  }

  /** Computes the proof submission deadline for a given slot, a tx mined in this slot is no longer interesting after this deadline */
  private getDeadlineForSlot(slotNumber: bigint): Date {
    const epoch = getEpochAtSlot(slotNumber, this.constants);
    const submissionEndEpoch = epoch + BigInt(this.constants.proofSubmissionEpochs);
    const submissionEndTimestamp = getTimestampRangeForEpoch(submissionEndEpoch, this.constants)[1];
    return new Date(Number(submissionEndTimestamp) * 1000);
  }
}
