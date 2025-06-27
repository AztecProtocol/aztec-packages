import { times } from '@aztec/foundation/collection';
import { AbortError, TimeoutError } from '@aztec/foundation/error';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { boundInclusive } from '@aztec/foundation/number';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, elapsed } from '@aztec/foundation/timer';
import type { BlockInfo } from '@aztec/stdlib/block';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { TxHash, type TxWithHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import { type ReqRespInterface, ReqRespSubProtocol } from '../reqresp/interface.js';
import type { TxCollectionConfig } from './config.js';
import type { FastCollectionRequest, FastCollectionRequestInput, TxCollectionManager } from './tx_collection.js';
import type { TxSource } from './tx_source.js';

export class FastTxCollection {
  /** Fast collection requests */
  protected requests: Set<FastCollectionRequest> = new Set();

  constructor(
    private reqResp: Pick<ReqRespInterface, 'sendBatchRequest'>,
    private nodes: TxSource[],
    private collectionManager: TxCollectionManager,
    private config: TxCollectionConfig,
    private dateProvider: DateProvider = new DateProvider(),
    private log: Logger = createLogger('p2p:tx_collection_service'),
  ) {}

  public async stop() {
    this.requests.forEach(request => request.promise.reject(new AbortError(`Stopped collection service`)));
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

    const blockInfo: BlockInfo =
      input.type === 'proposal' ? input.blockProposal.toBlockInfo() : input.block.toBlockInfo();

    // This promise use used to await for the collection to finish during the main collectFast method.
    // It gets resolved in `foundTxs` when all txs have been collected, or rejected if the request is aborted or hits the deadline.
    const promise = promiseWithResolvers<void>();
    setTimeout(() => promise.reject(new TimeoutError(`Timed out while collecting txs`)), timeout);

    const request: FastCollectionRequest = {
      ...input,
      blockInfo,
      promise,
      foundTxs: new Map<string, TxWithHash>(),
      missingTxHashes: new Set(txHashes.map(t => t.toString())),
      deadline: opts.deadline,
    };

    const [duration] = await elapsed(() => this.collectFast(request, { ...opts }));

    this.log.verbose(
      `Collected ${request.foundTxs.size} txs out of ${txHashes.length} for ${input.type} at slot ${blockInfo.slotNumber}`,
      {
        ...blockInfo,
        duration,
        requestType: input.type,
        missingTxs: [...request.missingTxHashes],
      },
    );
    return [...request.foundTxs.values()];
  }

  protected async collectFast(
    request: FastCollectionRequest,
    opts: { proposal?: BlockProposal; deadline: Date; pinnedPeer?: PeerId },
  ) {
    this.requests.add(request);
    const { blockInfo } = request;

    this.log.debug(
      `Starting fast collection of ${request.missingTxHashes.size} txs for ${request.type} at slot ${blockInfo.slotNumber}`,
      { ...blockInfo, requestType: request.type, deadline: opts.deadline },
    );

    try {
      // Start blasting all nodes for the txs. We give them a little time to respond before we start reqresp.
      // And keep an eye on the request promise to ensure we don't wait longer than the deadline or return as soon
      // as we have collected all txs, whatever the source.
      const nodeCollectionPromise = this.collectFastFromNodes(request, opts);
      const waitBeforeReqResp = sleep(this.config.txCollectionFastNodesTimeoutBeforeReqRespMs);
      await Promise.race([nodeCollectionPromise, request.promise.promise, waitBeforeReqResp]);

      // If we have collected all txs, we can stop here
      if (request.missingTxHashes.size === 0) {
        this.log.debug(`All txs collected for slot ${blockInfo.slotNumber} without reqresp`, blockInfo);
        return;
      }

      // Start blasting reqresp for the remaining txs. Note that node collection keeps running in parallel.
      // We stop when we have collected all txs, timed out, or both node collection and reqresp have given up.
      const collectionPromise = Promise.allSettled([this.collectFastViaReqResp(request, opts), nodeCollectionPromise]);
      await Promise.race([collectionPromise, request.promise.promise]);
    } catch (err) {
      // Log and swallow all errors
      const logCtx = {
        ...blockInfo,
        errorMessage: err instanceof Error ? err.message : undefined,
        missingTxs: [...request.missingTxHashes].map(txHash => txHash.toString()),
      };
      if (err instanceof Error && err.name === 'TimeoutError') {
        this.log.warn(`Timed out collecting txs for ${request.type} at slot ${blockInfo.slotNumber}`, logCtx);
      } else if (err instanceof Error && err.name === 'AbortError') {
        this.log.warn(`Aborted collecting txs for ${request.type} at slot ${blockInfo.slotNumber}`, logCtx);
      } else {
        this.log.error(`Error collecting txs for ${request.type} for slot ${blockInfo.slotNumber}`, err, logCtx);
      }
    } finally {
      // Ensure no unresolved promises and remove the request from the set
      request.promise.resolve();
      this.requests.delete(request);
    }
  }

  /**
   * Starts collecting txs from all configured nodes. We send `txCollectionFastMaxParallelRequestsPerNode` requests
   * in parallel to each node. We keep track of the number of attempts made to collect each tx, so we can prioritize
   * the txs that have been requested less often whenever we need to send a new batch of requests. We ensure that no
   * tx is requested more than once at the same time to the same node.
   */
  private async collectFastFromNodes(request: FastCollectionRequest, opts: { deadline: Date }): Promise<void> {
    if (this.nodes.length === 0) {
      return;
    }

    // Keep a shared priority queue of all txs pending to be requested, sorted by the number of attempts made to collect them.
    const attemptsPerTx = [...request.missingTxHashes].map(txHash => ({ txHash, attempts: 0, found: false }));

    // Returns once we have finished all node loops. Each loop finishes when the deadline is hit, or all txs have been collected.
    await Promise.race(this.nodes.map(node => this.collectFastFromNode(request, node, attemptsPerTx, opts)));
  }

  private async collectFastFromNode(
    request: FastCollectionRequest,
    node: TxSource,
    attemptsPerTx: { txHash: string; attempts: number; found: boolean }[],
    opts: { deadline: Date },
  ) {
    const notFinished = () => this.dateProvider.now() <= +opts.deadline && request.missingTxHashes.size > 0;
    const maxParallelRequests = this.config.txCollectionFastMaxParallelRequestsPerNode;
    const activeRequestsToThisNode = new Set<string>(); // Track the txs being actively requested to this node
    const maxBatchSize = this.config.txCollectionNodeRpcMaxBatchSize;

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
          } else if (!request.missingTxHashes.has(txToRequest.txHash)) {
            // Mark as found if it was found somewhere else, we'll then remove it from the array
            // We don't delete it now since 'array.splice' is pretty expensive, so we do it after sorting
            txToRequest.found = true;
          } else if (!activeRequestsToThisNode.has(txToRequest.txHash)) {
            // If the tx is not alredy being requested to this node, add it to the current batch
            batch.push(txToRequest);
            activeRequestsToThisNode.add(txToRequest.txHash);
            txToRequest.attempts++;
          }
        }

        // After modifying the array by removing txs or updating attempts, re-sort it and trim the found txs from the end
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

        // Collect this batch from the node
        await this.collectionManager.collect(
          txHashes => node.getTxsByHash(txHashes),
          batch.map(({ txHash }) => TxHash.fromString(txHash)),
          {
            description: `fast ${node.getInfo()}`,
            node: node.getInfo(),
            method: 'fast-node-rpc',
            ...request.blockInfo,
          },
        );

        // Clear from the active requests the txs we just requested
        for (const requestedTx of batch) {
          activeRequestsToThisNode.delete(requestedTx.txHash);
        }

        // Sleep a bit until hitting the node again (or not, depending on config)
        if (notFinished()) {
          await sleep(this.config.txCollectionFastNodeIntervalMs);
        }
      }
    };

    // Kick off N parallel requests to the node, up to the maxParallelRequests limit
    await Promise.all(times(maxParallelRequests, processBatch));
  }

  private async collectFastViaReqResp(request: FastCollectionRequest, opts: { pinnedPeer?: PeerId }) {
    const timeoutMs = +request.deadline - this.dateProvider.now();
    const pinnedPeer = opts.pinnedPeer;
    const maxPeers = boundInclusive(Math.ceil(request.missingTxHashes.size / 2), 8, 32);
    const maxRetryAttempts = 5;
    const blockInfo = request.blockInfo;
    const slotNumber = blockInfo.slotNumber;

    if (timeoutMs < 100) {
      this.log.warn(
        `Not initiating fast reqresp for txs for ${request.type} at slot ${blockInfo.slotNumber} due to timeout`,
        { timeoutMs, ...blockInfo },
      );
      return;
    }

    this.log.debug(
      `Starting fast reqresp for ${request.missingTxHashes.size} txs for ${request.type} at slot ${blockInfo.slotNumber}`,
      { ...blockInfo, timeoutMs, pinnedPeer },
    );

    try {
      await this.collectionManager.collect(
        txHashes =>
          this.reqResp.sendBatchRequest<ReqRespSubProtocol.TX>(
            ReqRespSubProtocol.TX,
            txHashes,
            pinnedPeer,
            timeoutMs,
            maxPeers,
            maxRetryAttempts,
          ),
        Array.from(request.missingTxHashes).map(txHash => TxHash.fromString(txHash)),
        { description: `reqresp for slot ${slotNumber}`, method: 'fast-req-resp', ...opts, ...request.blockInfo },
      );
    } catch (err) {
      this.log.error(`Error sending fast reqresp request for txs`, err, {
        txs: [...request.missingTxHashes],
        ...blockInfo,
      });
    }
  }

  /**
   * Handle txs by marking them as found for the requests that are waiting for them, and resolves the request if all its txs have been found.
   * Called internally and from the main tx collection manager whenever the tx pool emits a tx-added event.
   */
  public foundTxs(txs: TxWithHash[]) {
    for (const request of this.requests) {
      for (const tx of txs) {
        const txHash = tx.txHash.toString();
        // Remove the tx hash from the missing set, and add it to the found set.
        if (request.missingTxHashes.has(txHash)) {
          request.missingTxHashes.delete(txHash);
          request.foundTxs.set(txHash, tx);
          this.log.trace(`Found tx ${txHash} for fast collection request`, {
            ...request.blockInfo,
            txHash: tx.txHash.toString(),
            type: request.type,
          });
          // If we found all txs for this request, we resolve the promise
          if (request.missingTxHashes.size === 0) {
            this.log.trace(`All txs found for fast collection request`, {
              ...request.blockInfo,
              type: request.type,
            });
            request.promise.resolve();
          }
        }
      }
    }
  }

  /**
   * Stop collecting all txs for blocks less than or requal to the block number specified.
   * To be called when we no longer care about gathering txs up to a certain block, eg when they become proven or finalized.
   */
  public stopCollectingForBlocksUpTo(blockNumber: number): void {
    for (const request of this.requests) {
      if (request.blockInfo.blockNumber <= blockNumber) {
        request.promise.reject(new AbortError(`Stopped collecting txs up to block ${blockNumber}`));
        this.requests.delete(request);
      }
    }
  }

  /**
   * Stop collecting all txs for blocks greater than the block number specified.
   * To be called when there is a chain prune and previously mined txs are no longer relevant.
   */
  public stopCollectingForBlocksAfter(blockNumber: number): void {
    for (const request of this.requests) {
      if (request.blockInfo.blockNumber > blockNumber) {
        request.promise.reject(new AbortError(`Stopped collecting txs after block ${blockNumber}`));
        this.requests.delete(request);
      }
    }
  }
}
