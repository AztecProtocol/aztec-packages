import { BlockNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, elapsed } from '@aztec/foundation/timer';
import type { L2Block, L2BlockInfo } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx } from '@aztec/stdlib/tx';
import { TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';

import type { TxPoolV2, TxPoolV2Events } from '../../mem_pools/tx_pool_v2/interfaces.js';
import { BatchTxRequester } from '../reqresp/batch-tx-requester/batch_tx_requester.js';
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import type { BlockTxsSource } from '../reqresp/index.js';
import type { TxCollectionConfig } from './config.js';
import { FileStoreTxCollection } from './file_store_tx_collection.js';
import type { FileStoreTxSource } from './file_store_tx_source.js';
import { type IRequestTracker, RequestTracker } from './request_tracker.js';
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
 * Collect missing transactions for a block or proposal via reqresp.
 * @param requestTracker - The missing transactions tracker
 * @param blockTxsSource - The block or proposal containing the transactions
 * @param pinnedPeer - Optional peer expected to have the transactions
 * @returns The collected transactions
 */
export type IReqRespTxsCollector = (
  requestTracker: IRequestTracker,
  blockTxsSource: BlockTxsSource,
  pinnedPeer: PeerId | undefined,
) => Promise<Tx[]>;

/**
 * Coordinates tx collection from remote RPC nodes, reqresp, and file store.
 *
 * Runs a sequential pipeline: node RPC → reqresp → file store. Node collection starts immediately,
 * reqresp starts after a configured delay, and file store (if configured) starts after a further
 * delay. All paths send txs to the collection sink, which handles metrics and adds them to the
 * tx pool. Whenever a tx is added to the sink or the pool, this service is notified and stops
 * collecting that tx across all in-flight requests.
 */
export class TxCollection {
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  protected requests: Set<FastCollectionRequest> = new Set();

  /** The collector for txs via reqresp */
  protected reqRespTxsCollector?: IReqRespTxsCollector;

  /** File store collection for the fast (proposal/proving) path */
  protected readonly fileStoreFastCollection: FileStoreTxCollection;

  /** Handles txs found by collection paths before adding to the pool */
  private readonly txCollectionSink: TxCollectionSink;

  /** Handler for the txs-added event from the tx pool */
  protected readonly handleTxsAddedToPool: TxPoolV2Events['txs-added'];

  /** Handler for the txs-added event from the tx collection sink */
  protected readonly handleTxsFound: TxPoolV2Events['txs-added'];

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

    this.reqRespTxsCollector = (requestTracker, blockTxsSource, pinnedPeer) =>
      BatchTxRequester.collectAllTxs(
        new BatchTxRequester(
          requestTracker,
          blockTxsSource,
          pinnedPeer,
          this.p2pService,
          this.log,
          this.dateProvider,
        ).run(),
      );

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

  /** Stops all activity. Cancels in-flight requests; file store workers self-terminate. */
  public stop() {
    this.requests.forEach(request => {
      request.requestTracker.cancel();
    });

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

    const hashes = txHashes.map(h => (typeof h === 'string' ? TxHash.fromString(h) : h));

    const blockInfo: L2BlockInfo =
      input.type === 'proposal'
        ? { ...input.blockProposal.toBlockInfo(), blockNumber: input.blockNumber }
        : { ...input.block.toBlockInfo() };

    const request: FastCollectionRequest = {
      ...input,
      blockInfo,
      requestTracker: RequestTracker.create(hashes, opts.deadline, this.dateProvider),
    };

    const [duration] = await elapsed(() => this.collectFast(request, { pinnedPeer: opts.pinnedPeer }));

    this.log.verbose(
      `Collected ${request.requestTracker.collectedTxs.length} txs out of ${hashes.length} for ${input.type} at slot ${blockInfo.slotNumber}`,
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
      // 1. Start node collection in the background.
      // Note: this will be a noop if no nodes are configured.
      const nodeCollectionPromise = this.collectFastFromNodes(request);

      // 2. Wait before starting reqresp, interruptible by cancellation or node exhaustion.
      await Promise.race([
        request.requestTracker.cancellationToken,
        sleep(this.config.txCollectionFastNodesTimeoutBeforeReqRespMs),
        nodeCollectionPromise, // If node collection has finished (or if there are no nodes configured), we can exit early.
      ]);

      // 3. Start reqresp in the background (runs in parallel with node collection).
      // Note: this will be a noop if all TXs were already found.
      const reqRespPromise = this.collectFastViaReqResp(request, opts);

      // 4. Wait before starting file store, interruptible by cancellation.
      await Promise.race([
        request.requestTracker.cancellationToken,
        sleep(this.config.txCollectionFileStoreFastDelayMs),
        reqRespPromise, // If reqresp has finished, we can exit early.
      ]);

      // 5. Start file store collection in the background. Self-terminates on tracker cancel / all-found.
      // Note: this will be a noop if all TXs were already found.
      const fileStorePromise = this.fileStoreFastCollection.startCollecting(
        request.requestTracker,
        this.getAddContext(request),
      );

      // 6. Wait for all paths to settle.
      // NOTE: The request will automatically be cancelled after `opt.deadline` is reached.
      await Promise.allSettled([reqRespPromise, nodeCollectionPromise, fileStorePromise]);
    } catch (err) {
      this.log.error(`Error collecting txs for ${request.type} for slot ${blockInfo.slotNumber}`, err, {
        ...blockInfo,
        missingTxs: request.requestTracker.missingTxHashes.values().map(txHash => txHash.toString()),
      });
    } finally {
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
            // If the tx is not already being requested to this node, add it to the current batch and increase attempts.
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

    if (request.requestTracker.checkCancelled()) {
      this.log.debug(`No txs to collect via reqresp for ${request.type} at slot ${blockInfo.slotNumber}`, {
        ...blockInfo,
      });
      return;
    }

    this.log.debug(
      `Starting fast reqresp for ${request.requestTracker.numberOfMissingTxs} txs for ${request.type} at slot ${blockInfo.slotNumber}`,
      { ...blockInfo, timeoutMs: request.requestTracker.timeoutMs, pinnedPeer },
    );

    try {
      await this.txCollectionSink.collect(
        async () => {
          let blockTxsSource: BlockTxsSource;
          if (request.type === 'proposal') {
            blockTxsSource = request.blockProposal;
          } else if (request.type === 'block') {
            blockTxsSource = {
              txHashes: request.block.body.txEffects.map(e => e.txHash),
              archive: request.block.archive.root,
            };
          } else {
            throw new Error(`Unknown request type: ${(request as { type: string }).type}`);
          }

          const result = await this.reqRespTxsCollector!(request.requestTracker, blockTxsSource, pinnedPeer);
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

  /** Mark the given txs as found. Stops collecting them across all in-flight requests. */
  private foundTxs(txs: Tx[]) {
    for (const request of this.requests) {
      for (const tx of txs) {
        if (request.requestTracker.markFetched(tx)) {
          this.log.trace(`Found tx ${tx.txHash.toString()} for fast collection request`, {
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
   * Stop collecting all txs for blocks less than or equal to the block number specified.
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
