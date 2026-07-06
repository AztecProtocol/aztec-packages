import { chunkWrapAround } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { FifoMemoryQueue, type ISemaphore, Semaphore } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import { Tx, TxArray, TxHash, type TxValidator } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { strict as assert } from 'assert';

import { PeerErrorSeverity } from '../../../types/index.js';
import type { IRequestTracker } from '../../tx_collection/request_tracker.js';
import { ReqRespSubProtocol } from '.././interface.js';
import { BlockTxsRequest, BlockTxsResponse, type BlockTxsSource } from '.././protocols/index.js';
import { ReqRespStatus } from '.././status.js';
import {
  DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD,
  DEFAULT_BATCH_TX_REQUESTER_DUMB_PARALLEL_WORKER_COUNT,
  DEFAULT_BATCH_TX_REQUESTER_SMART_PARALLEL_WORKER_COUNT,
  DEFAULT_BATCH_TX_REQUESTER_TX_BATCH_SIZE,
} from './config.js';
import type { BatchTxRequesterLibP2PService, BatchTxRequesterOptions, ITxMetadataCollection } from './interface.js';
import { MissingTxMetadataCollection } from './missing_txs.js';
import { type IPeerCollection, PeerCollection } from './peer_collection.js';
import { createBatchRequestTxValidator } from './tx_validator.js';

/*
 * Tries to fetch all missing transaction until deadline is hit.
 * Transactions are yield by calling run*() method
 *
 * We have a couple of peer types:
 * - Pinned peer is the one who sent us the block proposal
 * - Dumb peer:
 *    - We query this peer blindly because we don't know which txs it has
 *    - We hope it might have some of the transactions we asked for
 *    - When this peer sends response it might become Smart peer
 * - Smart peer:
 *    - Initially there are no smart peers, all are considered "dumb"
 *    - Peer becomes smart when in response it tels us exactly which transactions it has
 *      AND we are missing some of those transactions
 * - Bad peer:
 *    - Is the peer which was unable to send us successful response N times in a row
 * */
export class BatchTxRequester {
  private readonly requestTracker: IRequestTracker;
  private readonly blockTxsSource: BlockTxsSource;
  private readonly pinnedPeer: PeerId | undefined;
  private readonly p2pService: BatchTxRequesterLibP2PService;
  private readonly logger: Logger;
  private readonly opts: BatchTxRequesterOptions;
  private readonly peers: IPeerCollection;
  private readonly txsMetadata: ITxMetadataCollection;
  private readonly smartRequesterSemaphore: ISemaphore;
  private readonly txQueue: FifoMemoryQueue<Tx>;
  private readonly txValidator: TxValidator;
  private readonly smartParallelWorkerCount: number;
  private readonly dumbParallelWorkerCount: number;
  private readonly txBatchSize: number;

  constructor(
    requestTracker: IRequestTracker,
    blockTxsSource: BlockTxsSource,
    pinnedPeer: PeerId | undefined,
    p2pService: BatchTxRequesterLibP2PService,
    logger?: Logger,
    dateProvider?: DateProvider,
    opts?: BatchTxRequesterOptions,
  ) {
    this.requestTracker = requestTracker;
    this.blockTxsSource = blockTxsSource;
    this.pinnedPeer = pinnedPeer;
    this.p2pService = p2pService;
    this.logger = logger ?? createLogger('p2p:reqresp_batch');
    this.opts = opts ?? {};

    this.smartParallelWorkerCount =
      this.opts.smartParallelWorkerCount ?? DEFAULT_BATCH_TX_REQUESTER_SMART_PARALLEL_WORKER_COUNT;
    this.dumbParallelWorkerCount =
      this.opts.dumbParallelWorkerCount ?? DEFAULT_BATCH_TX_REQUESTER_DUMB_PARALLEL_WORKER_COUNT;
    this.txBatchSize = this.opts.txBatchSize ?? DEFAULT_BATCH_TX_REQUESTER_TX_BATCH_SIZE;
    this.txQueue = new FifoMemoryQueue(this.logger);
    this.txValidator = this.opts.txValidator ?? createBatchRequestTxValidator(this.p2pService.txValidatorConfig);

    if (this.opts.peerCollection) {
      this.peers = this.opts.peerCollection;
    } else {
      const badPeerThreshold = this.opts.badPeerThreshold ?? DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD;
      this.peers = new PeerCollection(
        this.p2pService.connectionSampler,
        this.pinnedPeer,
        dateProvider ?? new DateProvider(),
        badPeerThreshold,
        this.p2pService.peerScoring,
      );
    }
    this.txsMetadata = new MissingTxMetadataCollection(requestTracker, this.txBatchSize);
    this.smartRequesterSemaphore = this.opts.semaphore ?? new Semaphore(0);
  }

  /*
   * Fetches all missing transactions and yields them one by one
   * */
  public async *run(): AsyncGenerator<Tx, Tx | undefined, unknown> {
    try {
      if (this.txsMetadata.getMissingTxHashes().size === 0) {
        return undefined;
      }

      // Start workers in background. Workers stop themselves via requestTracker.checkCancelled().
      const workersPromise = Promise.allSettled([
        this.smartRequester(),
        this.dumbRequester(),
        this.pinnedPeerRequester(),
      ]).finally(() => {
        this.txQueue.end();
      });

      // Yield txs as workers put them on the queue. The queue's end() drains remaining items
      // before returning null, so we don't lose any txs.
      while (true) {
        const tx = await this.txQueue.get();

        if (tx === null) {
          break;
        }

        yield tx;
      }

      this.unlockSmartRequesterSemaphores();
      await workersPromise;
    } catch (e: any) {
      this.logger.error(`Batch tx requester failed with error: ${e.message}`, { error: e });
    } finally {
      this.txQueue.end();
      this.unlockSmartRequesterSemaphores();
    }
  }

  /*
   * Fetches all missing transactions
   * @returns Collection of fetched transactions */
  public static async collectAllTxs(generator: AsyncGenerator<Tx, Tx | undefined, unknown>): Promise<Tx[]> {
    const txs: Tx[] = [];
    for await (const tx of generator) {
      if (tx === undefined) {
        break;
      }
      txs.push(tx);
    }
    return txs;
  }

  /*
   * Handles so-called pinned peer
   * The pinned peer is the one who sent us block proposal
   * We expect pinned peer to have all transactions from the proposal at some point
   * This holds because they them selves have to attest to proposal and thus fetch all missing transactions
   *
   * Given the reasoning above - we query pinned peer separately from dumb/smart peers
   * */
  private async pinnedPeerRequester() {
    if (!this.pinnedPeer) {
      this.logger.debug('No pinned peer to request from');
      return;
    }

    while (!this.shouldStop()) {
      // We've hit rate limits on the pinned peer - wait until rate limit expires (clamped to deadline)
      const rateLimitDelay = this.peers.getPeerRateLimitDelayMs(this.pinnedPeer);
      const pinnedPeerIsRateLimited = rateLimitDelay !== undefined;
      if (pinnedPeerIsRateLimited) {
        await this.sleepClampedToDeadline(rateLimitDelay);
        continue;
      }

      const pinnedPeerWentBad = this.peers.getBadPeers().has(this.pinnedPeer.toString());
      if (pinnedPeerWentBad) {
        return;
      }

      // From pinned peer we always request transactions so that we first request the least requested and not in flight
      // This makes sense since pinned peer should have ALL transactions,
      // Thus if it has all it is best to ask pinned first for the transactions we have trouble getting from other peers
      const txs = this.txsMetadata.getTxsToRequestFromThePeer(this.pinnedPeer);
      if (txs.length === 0) {
        this.logger.debug(`Pinned peer ${this.pinnedPeer.toString()} has no txs to request`);
        return;
      }

      const request = BlockTxsRequest.fromTxsSourceAndMissingTxs(this.blockTxsSource, txs);
      if (!request) {
        return;
      }

      txs.forEach(tx => {
        this.txsMetadata.markRequested(tx);
        this.txsMetadata.markInFlightBySmartPeer(tx);
      });

      await this.requestTxBatch(this.pinnedPeer, request);

      txs.forEach(tx => {
        this.txsMetadata.markNotInFlightBySmartPeer(tx);
      });
    }
  }

  /*
   * Starts dumb worker loops
   * */
  private async dumbRequester() {
    const nextBatchIndex = this.makeRoundRobinIndexer();

    // Chunk missing tx hashes into batches of txBatchSize, wrapping around to ensure no peer gets less than txBatchSize
    const txChunks = () => {
      const missingHashes = Array.from(this.txsMetadata.getMissingTxHashes());
      return chunkWrapAround(missingHashes, this.txBatchSize);
    };

    const makeRequest = (_pid: PeerId) => {
      const chunks = txChunks();
      const idx = nextBatchIndex(() => chunks.length);
      const noMoreTxsToRequest = idx === undefined;
      if (noMoreTxsToRequest) {
        return undefined;
      }

      const txs = chunks[idx].map(t => TxHash.fromString(t));

      // If peer is dumb peer, we don't know yet if they received full blockProposal
      // there is solid chance that peer didn't receive proposal yet, thus we must send full hashes
      const includeFullHashesInRequestNotJustIndices = true;
      const blockRequest = BlockTxsRequest.fromTxsSourceAndMissingTxs(
        this.blockTxsSource,
        txs,
        includeFullHashesInRequestNotJustIndices,
      );
      const blockRequestHasNoMissingTxsFromTheProposal = !blockRequest;

      if (blockRequestHasNoMissingTxsFromTheProposal) {
        return undefined;
      }

      return { blockRequest, txs };
    };

    const workerCount = this.dumbParallelWorkerCount;
    const workers = Array.from({ length: workerCount }, (_, index) =>
      this.dumbWorkerLoop(this.peers.nextDumbPeerToQuery.bind(this.peers), makeRequest, index + 1),
    );

    await Promise.allSettled(workers);
  }

  /*
   * Dumb worker loop.
   * It fetches next available dumb peer and builds request for that peer
   * Loops until shouldStop condition is not met or there are no more dubm peers to query
   *   This can happen if e.g. all "dumb" peers transition to "smart" or e.g. become "bad"
   * */
  private async dumbWorkerLoop(
    pickNextPeer: () => PeerId | undefined,
    request: (pid: PeerId) => { blockRequest: BlockTxsRequest; txs: TxHash[] } | undefined,
    workerIndex: number,
  ) {
    try {
      this.logger.debug(`Dumb worker ${workerIndex} started`);
      while (!this.shouldStop()) {
        const peerId = pickNextPeer();
        const weRanOutOfPeersToQuery = peerId === undefined;
        if (weRanOutOfPeersToQuery) {
          const nextDumbPeerDelay = this.peers.getNextDumbPeerAvailabilityDelayMs();
          const thereAreSomeRateLimitedDumbPeers = nextDumbPeerDelay !== undefined;
          if (thereAreSomeRateLimitedDumbPeers) {
            // There are still some dumb peers to query but they have been rate limited
            // Sleep until the earliest one gets unblocked (clamped to deadline)
            await this.sleepClampedToDeadline(nextDumbPeerDelay);
            continue;
          }

          this.logger.debug(`Worker loop dumb: No more peers to query`);
          break;
        }

        const nextBatchTxRequest = request(peerId);
        if (!nextBatchTxRequest) {
          this.logger.debug(`Worker loop dumb: no txs to request, exiting`);
          break;
        }

        const { blockRequest, txs } = nextBatchTxRequest;

        this.logger.debug(
          `Worker type dumb: Requesting txs from peer ${peerId.toString()}: ${txs.map(tx => tx.toString()).join(', ')}`,
        );

        await this.requestTxBatch(peerId, blockRequest);
      }
    } catch (err: any) {
      this.logger.error(`Dumb worker ${workerIndex} encountered an error: ${err}`);
    } finally {
      this.logger.debug(`Dumb worker ${workerIndex} finished`);
    }
  }

  /*
   * Starts smart worker loops
   * */
  private async smartRequester() {
    const makeRequest = (pid: PeerId) => {
      const txs = this.txsMetadata.getTxsToRequestFromThePeer(pid);
      const blockRequest = BlockTxsRequest.fromTxsSourceAndMissingTxs(this.blockTxsSource, txs);
      if (!blockRequest) {
        return undefined;
      }

      return { blockRequest, txs };
    };

    const workers = Array.from({ length: this.smartParallelWorkerCount }, (_, index) =>
      this.smartWorkerLoop(this.peers.nextSmartPeerToQuery.bind(this.peers), makeRequest, index + 1),
    );

    await Promise.allSettled(workers);
  }

  /*
   * Smart worker loop.
   * It fetches next available smart peer and builds request for that peer
   * Loops until shouldStop condition is not met
   *
   * Notes:
   * - We don't start worker loop immediately, but block on semaphore
   *   until some dumb peer transactions to smart peer
   * - We might run out of smart peers, because:
   *    - they "went bad"
   *    - there are less smart peers than worker loops
   *   In such scenario we either wait for next dumb peer to become smart or kill the worker loop
   * */
  private async smartWorkerLoop(
    pickNextPeer: () => PeerId | undefined,
    request: (pid: PeerId) => { blockRequest: BlockTxsRequest; txs: TxHash[] } | undefined,
    workerIndex: number,
  ) {
    try {
      this.logger.trace(`Smart worker ${workerIndex} started`);
      await Promise.race([this.smartRequesterSemaphore.acquire(), this.requestTracker.cancellationToken]);
      if (this.requestTracker.checkCancelled()) {
        return;
      }
      this.logger.trace(`Smart worker ${workerIndex} acquired semaphore`);

      while (!this.shouldStop()) {
        const peerId = pickNextPeer();
        const weRanOutOfPeersToQuery = peerId === undefined;
        if (weRanOutOfPeersToQuery) {
          this.logger.debug(`Worker loop smart: No more peers to query`);

          // If we have rate limited peers wait for them.
          const nextSmartPeerDelay = this.peers.getNextSmartPeerAvailabilityDelayMs();
          const thereAreSomeRateLimitedSmartPeers = nextSmartPeerDelay !== undefined;
          if (thereAreSomeRateLimitedSmartPeers) {
            await this.sleepClampedToDeadline(nextSmartPeerDelay);
            continue;
          }

          // We end up here when all known smart peers became temporarily unavailable via combination of
          // (bad, in-flight, or rate-limited) or in some weird scenario all current smart peers turn bad which is permanent
          // but there are dumb peers that could be promoted
          // or new peer can join as dumb and be promoted later
          //
          // When a dumb peer responds with valid txIndices, it gets
          // promoted to smart and releases the semaphore, waking this worker.
          await Promise.race([this.smartRequesterSemaphore.acquire(), this.requestTracker.cancellationToken]);
          if (this.requestTracker.checkCancelled()) {
            break;
          }
          this.logger.debug(`Worker loop smart: acquired next smart peer`);
          continue;
        }

        const nextBatchTxRequest = request(peerId);
        if (!nextBatchTxRequest) {
          this.logger.debug(`Worker loop smart: no txs to request, exiting`);
          break;
        }

        const { blockRequest, txs } = nextBatchTxRequest;

        // We only mark transactions as in flight if queried by Smart peer
        // Because asking them from dumb peer is shot in the dark (there is a good chance they won't have it)
        // So we don't gain anything if we mark txs in-flight for dumb peers
        txs.forEach(tx => {
          this.txsMetadata.markRequested(tx);
          this.txsMetadata.markInFlightBySmartPeer(tx);
        });

        await this.requestTxBatch(peerId, blockRequest);
        txs.forEach(tx => {
          this.txsMetadata.markNotInFlightBySmartPeer(tx);
        });
      }
    } catch (err: any) {
      this.logger.error(`Smart worker ${workerIndex} encountered an error: ${err}`);
    } finally {
      this.logger.debug(`Smart worker ${workerIndex} finished`);
    }
  }

  /*
   * Sends actual request to the peer and handles response
   *
   * @param peerId - the peer to send request to
   * @param request - the actual request
   */
  private async requestTxBatch(peerId: PeerId, request: BlockTxsRequest): Promise<void> {
    try {
      this.peers.markPeerInFlight(peerId);
      const response = await this.p2pService.reqResp.sendRequestToPeer(
        peerId,
        ReqRespSubProtocol.BLOCK_TXS,
        request.toBuffer(),
      );
      if (response.status !== ReqRespStatus.SUCCESS) {
        this.logger.debug(`Peer ${peerId.toString()} failed to respond with status: ${response.status}`);
        this.handleFailResponseFromPeer(peerId, response.status);
        return;
      }

      const blockResponse = BlockTxsResponse.fromBuffer(response.data);

      // Validate response. Peers will be penalised by the validator if they send invalid response.
      const isValid = await this.p2pService.validateRequestedBlockTxsConsistency(request, blockResponse, peerId);
      if (!isValid) {
        this.logger.debug(`Peer ${peerId.toString()} sent invalid response`);
        this.handleFailResponseFromPeer(peerId, ReqRespStatus.INTERNAL_ERROR);
        return;
      }

      await this.handleSuccessResponseFromPeer(peerId, blockResponse);
    } catch (err: any) {
      this.logger.error(`Failed to get valid response from peer ${peerId.toString()}: ${err.message}`, {
        peerId,
        error: err,
      });

      this.handleFailResponseFromPeer(peerId, ReqRespStatus.UNKNOWN);
    } finally {
      this.peers.unMarkPeerInFlight(peerId);
    }
  }

  /*
   * Handles failed response form the peer
   * There are 3 scenarios
   * - RATE_LIMIT_EXCEEDED: We mark this and don't query this peer again for some_time
   * - INTERNAL_ERROR: We use this to cover cases where the request-response consistency validation fails.
   * - FAILURE and UNKNOWN: We penalise this, if peer has been penalised this way N times they are not queried again
   *   this implies we will query these peers couple of more times and give them a chance to "redeem" themselves before completely ignoring them
   */
  private handleFailResponseFromPeer(peerId: PeerId, responseStatus: ReqRespStatus) {
    switch (responseStatus) {
      case ReqRespStatus.RATE_LIMIT_EXCEEDED:
        this.peers.markPeerRateLimitExceeded(peerId);
        return;
      case ReqRespStatus.INTERNAL_ERROR:
        this.peers.markPeerDumb(peerId);
        this.txsMetadata.clearPeerData(peerId);
        return;
      default: // includes FAILURE, UNKNOWN
        this.peers.penalisePeer(peerId, PeerErrorSeverity.HighToleranceError);
        this.peers.markPeerDumb(peerId);
        this.txsMetadata.clearPeerData(peerId);
        return;
    }
  }

  /*
   * Handles successful response form the peer, this includes
   * - Handling received transactions
   * - Deciding if the peer is "smart" or not
   * */
  private async handleSuccessResponseFromPeer(peerId: PeerId, response: BlockTxsResponse) {
    this.logger.debug(`Received txs: ${response.txs.length} from peer ${peerId.toString()} `);
    await this.handleReceivedTxs(peerId, response.txs);

    this.decideIfPeerIsSmart(peerId, response);
  }

  /*
   * Handles received txs.
   * Transactions are validated and then put on async queue
   * to be yielded by main running loop
   */
  private async handleReceivedTxs(peerId: PeerId, txs: TxArray) {
    const newTxs = txs.filter(tx => !this.txsMetadata.alreadyFetched(tx.txHash));

    if (newTxs.length === 0) {
      return;
    }

    // TODO: this validation can be slow, maybe spawn worker just for validation
    // We could use the async queue for communication.
    const validationResults = await Promise.allSettled(
      newTxs.map(async tx => ({
        tx,
        isValid: (await this.txValidator.validateTx(tx)).result === 'valid',
      })),
    );

    let hasInvalidTx = false;
    validationResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.isValid) {
        if (this.txsMetadata.markFetched(peerId, result.value.tx)) {
          this.txQueue.put(result.value.tx);
        }
      } else {
        hasInvalidTx = true;
      }
    });

    if (hasInvalidTx) {
      this.logger.warn(`Penalizing peer ${peerId.toString()} for sending invalid transactions in batch response`, {
        peerId,
      });
      this.peers.penalisePeer(peerId, PeerErrorSeverity.LowToleranceError);
    } else {
      // If we have received successful response from the peer, they have "redeemed" themselves and not considered bad anymore
      this.peers.unMarkPeerAsBad(peerId);
    }

    const missingTxHashes = this.txsMetadata.getMissingTxHashes();
    if (missingTxHashes.size === 0) {
      // wake sleepers so they can see shouldStop() and exit before waiting on timeout
      this.unlockSmartRequesterSemaphores();
    } else {
      this.logger.trace(
        `Missing txs: ${Array.from(this.txsMetadata.getMissingTxHashes())
          .map(tx => tx.toString())
          .join(', ')}`,
      );
    }
  }

  /*
   * Peer is smart if:
   * - They are not pinned peer
   * - They have sent successful response indicating which txs from Block proposal they have
   * - They have transactions we are missing
   */
  private decideIfPeerIsSmart(peerId: PeerId, response: BlockTxsResponse) {
    const pinnedPeerShouldNeverBeMarkedAsSmart = this.pinnedPeer && peerId.toString() === this.pinnedPeer.toString();
    if (pinnedPeerShouldNeverBeMarkedAsSmart) {
      return;
    }

    const smartPeersAreDisabled = this.smartParallelWorkerCount === 0;
    if (smartPeersAreDisabled) {
      return;
    }

    // If the peer doesn't have the block, we mark them as dumb.
    if (!response.peerHasBlock()) {
      this.peers.markPeerDumb(peerId);
      this.txsMetadata.clearPeerData(peerId);
      return;
    }

    // We mark peer as "smart" only if they have some txs we are missing
    // Otherwise we keep them as "dumb" in hope they'll receive some new txs we are missing in the future
    if (!this.peerHasSomeTxsWeAreMissing(peerId, response)) {
      this.logger.debug(`${peerId.toString()} has no txs we are missing, skipping`);
      return;
    }

    this.peers.markPeerSmart(peerId);
    this.markTxsPeerHas(peerId, response);

    // Unblock smart workers
    this.smartRequesterSemaphore.release();
  }

  private peerHasSomeTxsWeAreMissing(_peerId: PeerId, response: BlockTxsResponse): boolean {
    if (response.txIndices.isEmpty()) {
      return false;
    }
    const txsPeerHas = new Set(this.extractHashesPeerHasFromResponse(response).map(h => h.toString()));
    return this.txsMetadata.getMissingTxHashes().intersection(txsPeerHas).size > 0;
  }

  private markTxsPeerHas(peerId: PeerId, response: BlockTxsResponse) {
    const txsPeerHas = this.extractHashesPeerHasFromResponse(response);
    this.logger.debug(`${peerId.toString()} has txs: ${txsPeerHas.map(tx => tx.toString()).join(', ')}`);
    this.txsMetadata.markPeerHas(peerId, txsPeerHas);
  }

  private extractHashesPeerHasFromResponse(response: BlockTxsResponse): Array<TxHash> {
    // Should already have been validated, but just in case.
    assert(response.txIndices.getLength() === this.blockTxsSource.txHashes.length);
    return response.txIndices.getTrueIndices().map(idx => this.blockTxsSource.txHashes[idx]);
  }

  /*
   * Helper function to crate round robin indexer -
   * i.e. the "thing" which returns next index/number in round robin fashion
   **/
  private makeRoundRobinIndexer(start = 0) {
    let i = start;
    /*
     * Function to calculate next round-robin number
     * Idea is that we pass in an array size and based on it and previous state we call next
     * Array size can change between calls thus it is passed as function
     *
     * @returns next index or undefined if size is 0
     */
    return (size: () => number) => {
      const length = size();
      if (length === 0) {
        return undefined;
      }

      const current = i % length;
      i = (current + 1) % length;
      return current;
    };
  }

  /*
   * Checks if the BatchTxRequester should stop fetching missing txs.
   * Delegates to requestTracker which covers: deadline hit, all txs fetched, or external cancellation. */
  private shouldStop() {
    if (this.requestTracker.checkCancelled()) {
      this.unlockSmartRequesterSemaphores();
    }

    return this.requestTracker.checkCancelled();
  }

  /*
   * Helper function which unlocks all smart requester semaphores
   * @note This is needed otherwise they will block forever
   * */
  private unlockSmartRequesterSemaphores() {
    for (let i = 0; i < this.smartParallelWorkerCount; i++) {
      this.smartRequesterSemaphore.release();
    }
  }

  /*
   * Sleeps for the given duration, but clamped to the deadline.
   * This ensures we don't sleep past the deadline.
   * */
  private async sleepClampedToDeadline(durationMs: number) {
    if (this.requestTracker.checkCancelled()) {
      return;
    }
    await Promise.race([sleep(durationMs), this.requestTracker.cancellationToken]);
  }
}
