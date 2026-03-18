import { BlockNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, elapsed } from '@aztec/foundation/timer';
import type { L2BlockInfo } from '@aztec/stdlib/block';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { BatchTxRequesterConfig } from '../reqresp/batch-tx-requester/config.js';
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import type { TxCollectionConfig } from './config.js';
import {
  BatchTxRequesterCollector,
  type MissingTxsCollector,
  SendBatchRequestCollector,
} from './proposal_tx_collector.js';
import { RequestTracker } from './request_tracker.js';
import type { FastCollectionRequest, FastCollectionRequestInput } from './tx_collection.js';
import type { TxAddContext, TxCollectionSink } from './tx_collection_sink.js';
import type { TxSource } from './tx_source.js';

export class FastTxCollection {
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  protected requests: Set<FastCollectionRequest> = new Set();
  private missingTxsCollector: MissingTxsCollector;

  constructor(
    p2pService: BatchTxRequesterLibP2PService,
    private nodes: TxSource[],
    private txCollectionSink: TxCollectionSink,
    private config: TxCollectionConfig,
    private dateProvider: DateProvider = new DateProvider(),
    private log: Logger = createLogger('p2p:tx_collection_service'),
    missingTxsCollector?: MissingTxsCollector,
  ) {
    const batchTxRequesterConfig = this.config as Partial<BatchTxRequesterConfig>;
    const missingTxsCollectorType = this.config.txCollectionMissingTxsCollectorType;
    this.missingTxsCollector =
      missingTxsCollector ??
      (missingTxsCollectorType === 'old'
        ? new SendBatchRequestCollector(p2pService)
        : new BatchTxRequesterCollector(p2pService, log, dateProvider, undefined, batchTxRequesterConfig));
  }

  public async stop() {
    this.requests.forEach(request => {
      request.requestTracker.cancel();
    });
    await Promise.resolve();
  }

  public getFastCollectionRequests() {
    return this.requests;
  }

  public async collectFastFor(
    input: FastCollectionRequestInput,
    txHashes: TxHash[] | string[],
    opts: { deadline: Date; pinnedPeer?: PeerId },
  ) {
    const timeout = opts.deadline.getTime() - this.dateProvider.now();
    if (timeout <= 0) {
      this.log.warn(`Deadline for fast tx collection is in the past (${timeout}ms)`, {
        deadline: opts.deadline.getTime(),
        now: this.dateProvider.now(),
      });
      return [];
    }

    const blockInfo: L2BlockInfo =
      input.type === 'proposal'
        ? { ...input.blockProposal.toBlockInfo(), blockNumber: input.blockNumber }
        : { ...input.block.toBlockInfo() };

    const request: FastCollectionRequest = {
      ...input,
      blockInfo,
      requestTracker: RequestTracker.create(txHashes, opts.deadline, this.dateProvider),
    };

    const [duration] = await elapsed(() => this.collectFast(request, { ...opts }));

    this.log.verbose(
      `Collected ${request.requestTracker.collectedTxs.length} txs out of ${txHashes.length} for ${input.type} at slot ${blockInfo.slotNumber}`,
      {
        ...blockInfo,
        duration,
        requestType: input.type,
        missingTxs: [...request.requestTracker.missingTxHashes],
      },
    );
    return request.requestTracker.collectedTxs;
  }

  protected async collectFast(request: FastCollectionRequest, opts: { pinnedPeer?: PeerId }) {
    this.requests.add(request);
    const { blockInfo } = request;

    this.log.debug(
      `Starting fast collection of ${request.requestTracker.numberOfMissingTxs} txs for ${request.type} at slot ${blockInfo.slotNumber}`,
      { ...blockInfo, requestType: request.type, deadline: request.requestTracker.deadline },
    );

    try {
      // Start blasting all nodes for the txs. We give them a little time to respond before we start reqresp.
      // We race against the cancellation token to exit as soon as all txs are collected, the deadline expires,
      // or the request is externally cancelled.
      const nodeCollectionPromise = this.collectFastFromNodes(request);
      const waitBeforeReqResp = sleep(this.config.txCollectionFastNodesTimeoutBeforeReqRespMs);
      await Promise.race([request.requestTracker.cancellationToken, waitBeforeReqResp]);

      // If we have collected all txs or the request was cancelled, we can stop here.
      // Wait for node collection to settle so inner tasks finish before we return.
      if (request.requestTracker.checkCancelled()) {
        if (request.requestTracker.allFetched()) {
          this.log.debug(`All txs collected for slot ${blockInfo.slotNumber} without reqresp`, blockInfo);
        }
        await nodeCollectionPromise;
        return;
      }

      // Start blasting reqresp for the remaining txs. Note that node collection keeps running in parallel.
      // We stop when we have collected all txs, timed out, or both node collection and reqresp have given up.
      // Inner tasks observe requestTracker.checkCancelled() and stop themselves, so this settles shortly after cancellation.
      await Promise.allSettled([this.collectFastViaReqResp(request, opts), nodeCollectionPromise]);
    } catch (err) {
      this.log.error(`Error collecting txs for ${request.type} for slot ${blockInfo.slotNumber}`, err, {
        ...blockInfo,
        missingTxs: request.requestTracker.missingTxHashes.values().map(txHash => txHash.toString()),
      });
    } finally {
      // Ensure no unresolved promises and remove the request from the set
      request.requestTracker.cancel();
      this.requests.delete(request);
    }
  }

  /**
   * Starts collecting txs from all configured nodes. We send `txCollectionFastMaxParallelRequestsPerNode` requests
   * in parallel to each node. We keep track of the number of attempts made to collect each tx, so we can prioritize
   * the txs that have been requested less often whenever we need to send a new batch of requests. We ensure that no
   * tx is requested more than once at the same time to the same node.
   */
  private async collectFastFromNodes(request: FastCollectionRequest): Promise<void> {
    if (this.nodes.length === 0) {
      return;
    }

    // Keep a shared priority queue of all txs pending to be requested, sorted by the number of attempts made to collect them.
    const attemptsPerTx = [...request.requestTracker.missingTxHashes].map(txHash => ({
      txHash,
      attempts: 0,
      found: false,
    }));

    // Returns once we have finished all node loops. Each loop finishes when the deadline is hit, or all txs have been collected.
    await Promise.allSettled(this.nodes.map(node => this.collectFastFromNode(request, node, attemptsPerTx)));
  }

  private async collectFastFromNode(
    request: FastCollectionRequest,
    node: TxSource,
    attemptsPerTx: { txHash: string; attempts: number; found: boolean }[],
  ) {
    const notFinished = () => !request.requestTracker.checkCancelled();

    const maxParallelRequests = this.config.txCollectionFastMaxParallelRequestsPerNode;
    const maxBatchSize = this.config.txCollectionNodeRpcMaxBatchSize;
    const activeRequestsToThisNode = new Set<string>(); // Track the txs being actively requested to this node

    const processBatch = async () => {
      while (notFinished()) {
        // Pull tx hashes from the attemptsPerTx array, which is sorted by attempts,
        // so we prioritize txs that have been requested less often.
        const batch = [];
        let index = 0;
        while (batch.length < maxBatchSize) {
          const txToRequest = attemptsPerTx[index++];
          if (!txToRequest) {
            // No more txs to process
            break;
          } else if (!request.requestTracker.isMissing(txToRequest.txHash)) {
            // Mark as found if it was found somewhere else, we'll then remove it from the array.
            // We don't delete it now since 'array.splice' is pretty expensive, so we do it after sorting.
            txToRequest.found = true;
          } else if (!activeRequestsToThisNode.has(txToRequest.txHash)) {
            // If the tx is not alredy being requested to this node, add it to the current batch and increase attempts.
            // Note that we increase the attempts *before* making the request, so the next `collectFastFromNode` that
            // needs to grab txs to send, will pick txs that have been requested less often, instead of all requesting
            // the same txs at the same time.
            batch.push(txToRequest);
            activeRequestsToThisNode.add(txToRequest.txHash);
            txToRequest.attempts++;
          }
        }

        // After modifying the array by removing txs or updating attempts, re-sort it and trim the found txs from the end.
        attemptsPerTx.sort((a, b) =>
          a.found === b.found ? a.attempts - b.attempts : Number(a.found) - Number(b.found),
        );
        const firstFoundTxIndex = attemptsPerTx.findIndex(tx => tx.found);
        if (firstFoundTxIndex !== -1) {
          attemptsPerTx.length = firstFoundTxIndex;
        }

        // If we see no more txs to request, we can stop this "process" loop
        if (batch.length === 0) {
          return;
        }

        const txHashes = batch.map(({ txHash }) => txHash);
        // Collect this batch from the node
        await this.txCollectionSink.collect(
          async () => {
            const result = await node.getTxsByHash(txHashes.map(TxHash.fromString));
            for (const tx of result.validTxs) {
              request.requestTracker.markFetched(tx);
            }
            return result;
          },
          txHashes,
          {
            description: `fast ${node.getInfo()}`,
            node: node.getInfo(),
            method: 'fast-node-rpc',
            ...request.blockInfo,
          },
          this.getAddContext(request),
        );

        // Clear from the active requests the txs we just requested
        for (const requestedTx of batch) {
          activeRequestsToThisNode.delete(requestedTx.txHash);
        }

        // Sleep a bit until hitting the node again, but wake up immediately on cancellation
        if (notFinished()) {
          await Promise.race([
            sleep(this.config.txCollectionFastNodeIntervalMs),
            request.requestTracker.cancellationToken,
          ]);
        }
      }
    };

    // Kick off N parallel requests to the node, up to the maxParallelRequests limit
    await Promise.all(times(maxParallelRequests, processBatch));
  }

  private async collectFastViaReqResp(request: FastCollectionRequest, opts: { pinnedPeer?: PeerId }) {
    const pinnedPeer = opts.pinnedPeer;
    const blockInfo = request.blockInfo;
    const slotNumber = blockInfo.slotNumber;
    if (request.requestTracker.timeoutMs < 100) {
      this.log.warn(
        `Not initiating fast reqresp for txs for ${request.type} at slot ${blockInfo.slotNumber} due to timeout`,
        { timeoutMs: request.requestTracker.timeoutMs, ...blockInfo },
      );
      return;
    }

    this.log.debug(
      `Starting fast reqresp for ${request.requestTracker.numberOfMissingTxs} txs for ${request.type} at slot ${blockInfo.slotNumber}`,
      { ...blockInfo, timeoutMs: request.requestTracker.timeoutMs, pinnedPeer },
    );

    try {
      await this.txCollectionSink.collect(
        async () => {
          let result: Tx[];
          if (request.type === 'proposal') {
            result = await this.missingTxsCollector.collectTxs(
              request.requestTracker,
              request.blockProposal,
              pinnedPeer,
            );
          } else if (request.type === 'block') {
            const blockTxsSource = {
              txHashes: request.block.body.txEffects.map(e => e.txHash),
              archive: request.block.archive.root,
            };
            result = await this.missingTxsCollector.collectTxs(request.requestTracker, blockTxsSource, pinnedPeer);
          } else {
            throw new Error(`Unknown request type: ${(request as any).type}`);
          }
          return { validTxs: result, invalidTxHashes: [] };
        },
        Array.from(request.requestTracker.missingTxHashes),
        { description: `reqresp for slot ${slotNumber}`, method: 'fast-req-resp', ...opts, ...request.blockInfo },
        this.getAddContext(request),
      );
    } catch (err) {
      this.log.error(`Error sending fast reqresp request for txs`, err, {
        txs: [...request.requestTracker.missingTxHashes],
        ...blockInfo,
      });
    }
  }

  /** Returns the TxAddContext for the given request, used by the sink to add txs to the pool correctly. */
  private getAddContext(request: FastCollectionRequest): TxAddContext {
    if (request.type === 'proposal') {
      return { type: 'proposal', blockHeader: request.blockProposal.blockHeader };
    } else {
      return { type: 'mined', block: request.block };
    }
  }

  /**
   * Handle txs by marking them as found for the requests that are waiting for them, and resolves the request if all its txs have been found.
   * Called internally and from the main tx collection manager whenever the tx pool emits a tx-added event.
   */
  public foundTxs(txs: Tx[]) {
    for (const request of this.requests) {
      for (const tx of txs) {
        const txHash = tx.txHash.toString();
        // Remove the tx hash from the missing set, and add it to the found set.
        if (request.requestTracker.markFetched(tx)) {
          this.log.trace(`Found tx ${txHash} for fast collection request`, {
            ...request.blockInfo,
            txHash: tx.txHash.toString(),
            type: request.type,
          });
          if (request.requestTracker.allFetched()) {
            this.log.trace(`All txs found for fast collection request`, {
              ...request.blockInfo,
              type: request.type,
            });
            break;
          }
        }
      }
    }
  }

  /**
   * Stop collecting all txs for blocks less than or requal to the block number specified.
   * To be called when we no longer care about gathering txs up to a certain block, eg when they become proven or finalized.
   */
  public stopCollectingForBlocksUpTo(blockNumber: BlockNumber): void {
    for (const request of this.requests) {
      if (request.blockInfo.blockNumber <= blockNumber) {
        request.requestTracker.cancel();
      }
    }
  }

  /**
   * Stop collecting all txs for blocks greater than the block number specified.
   * To be called when there is a chain prune and previously mined txs are no longer relevant.
   */
  public stopCollectingForBlocksAfter(blockNumber: BlockNumber): void {
    for (const request of this.requests) {
      if (request.blockInfo.blockNumber > blockNumber) {
        request.requestTracker.cancel();
      }
    }
  }
}
