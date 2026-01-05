import { chunk } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { FifoMemoryQueue, type ISemaphore, Semaphore } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, executeTimeout } from '@aztec/foundation/timer';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { Tx, TxArray, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import { ReqRespSubProtocol } from '.././interface.js';
import { BlockTxsRequest, BlockTxsResponse } from '.././protocols/index.js';
import { ReqRespStatus } from '.././status.js';
import type { BatchTxRequesterLibP2PService, BatchTxRequesterOptions, ITxMetadataCollection } from './interface.js';
import { MissingTxMetadata, MissingTxMetadataCollection, TX_BATCH_SIZE } from './missing_txs.js';
import { type IPeerCollection, PeerCollection, RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL } from './peer_collection.js';

const SMART_PEERS_TO_QUERY_IN_PARALLEL = 10;
const DUMB_PEERS_TO_QUERY_IN_PARALLEL = 10;
const FAILED_MAKE_REQUEST_THRESHOLD = 5;

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
 *    - Is the peer which was unable to send us successful response  BAD_PEER_THRESHOLD  times in a row
 * */
export class BatchTxRequester {
  private readonly peers: IPeerCollection;
  private readonly txsMetadata: ITxMetadataCollection;
  private readonly deadline: number;
  private readonly smartRequesterSemaphore: ISemaphore;
  private readonly txQueue: FifoMemoryQueue<Tx>;

  constructor(
    missingTxs: TxHash[],
    private readonly blockProposal: BlockProposal,
    private readonly pinnedPeer: PeerId | undefined,
    private readonly timeoutMs: number,
    private readonly p2pService: BatchTxRequesterLibP2PService,
    private readonly logger = createLogger('p2p:reqresp_batch'),
    private readonly dateProvider: DateProvider = new DateProvider(),
    private readonly opts: BatchTxRequesterOptions = {
      smartParallelWorkerCount: SMART_PEERS_TO_QUERY_IN_PARALLEL,
      dumbParallelWorkerCount: DUMB_PEERS_TO_QUERY_IN_PARALLEL,
    },
  ) {
    this.txQueue = new FifoMemoryQueue(this.logger);
    this.deadline = this.dateProvider.now() + this.timeoutMs;

    if (this.opts.peerCollection) {
      this.peers = this.opts.peerCollection;
    } else {
      const initialPeers = this.p2pService.connectionSampler.getPeerListSortedByConnectionCountAsc();
      this.peers = new PeerCollection(initialPeers, pinnedPeer, dateProvider);
    }
    const entries: Array<[string, MissingTxMetadata]> = missingTxs.map(h => [h.toString(), new MissingTxMetadata(h)]);
    this.txsMetadata = new MissingTxMetadataCollection(entries);
    this.smartRequesterSemaphore = this.opts.semaphore ?? new Semaphore(0);
  }

  /*
   * Fetches all missing transactions and yields them  one by one
   * */
  public async *run(): AsyncGenerator<Tx, Tx | undefined, unknown> {
    // Our timeout is represented in milliseconds but queue expects seconds
    // We also want to make sure we wait at least 1 second in case of very low timeouts
    const timeoutQueueAfter = Math.max(Math.ceil(this.timeoutMs / 1_000), 1);
    try {
      if (this.txsMetadata.getMissingTxHashes().size === 0) {
        return undefined;
      }

      // Start workers in background
      const workersPromise = executeTimeout(
        () => Promise.allSettled([this.smartRequester(), this.dumbRequester(), this.pinnedPeerRequester()]),
        this.timeoutMs,
      ).finally(() => {
        this.txQueue.end();
      });

      while (true) {
        const tx = await this.txQueue.get(timeoutQueueAfter);

        // null indicates that the queue has ended
        if (tx === null) {
          break;
        }

        yield tx;

        if (this.shouldStop()) {
          // Drain queue before ending
          let remaining;
          while ((remaining = this.txQueue.getImmediate()) !== undefined) {
            yield remaining;
          }
          break;
        }
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
      // We've hit rate limits on the pinned peer - wait a bit before making another request
      if (this.peers.getRateLimitExceededPeers().has(this.pinnedPeer.toString())) {
        await sleep(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL);
        continue;
      }

      //Pinned peer went bad, don't request from it anymore
      if (this.peers.getBadPeers().has(this.pinnedPeer.toString())) {
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

      txs.forEach(tx => {
        this.txsMetadata.markRequested(tx);
        this.txsMetadata.markInFlightBySmartPeer(tx);
      });

      const request = BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txs);
      if (!request) {
        return;
      }
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
    const nextPeerIndex = this.makeRoundRobinIndexer();
    const nextBatchIndex = this.makeRoundRobinIndexer();

    // Chunk missing tx hashes into batches of TX_BATCH_SIZE
    const txChunks = () => {
      const missingHashes = Array.from(this.txsMetadata.getMissingTxHashes());
      if (missingHashes.length < TX_BATCH_SIZE) {
        return [missingHashes];
      }

      // This ensures that peers are queried optimally - that no peer is queried for less than TX_BATCH_SIZE txs
      const remainder = missingHashes.length % TX_BATCH_SIZE;
      if (remainder === 0) {
        return chunk<string>(missingHashes, TX_BATCH_SIZE);
      }

      const wrapAroundCount = TX_BATCH_SIZE - remainder;
      const wrappedHashes = [...missingHashes, ...missingHashes.slice(0, wrapAroundCount)];
      return chunk<string>(wrappedHashes, TX_BATCH_SIZE);
    };

    const makeRequest = (_pid: PeerId) => {
      const chunks = txChunks();
      const idx = nextBatchIndex(() => chunks.length);
      if (idx === undefined) {
        return undefined;
      }

      if (chunks[idx] === undefined) {
        this.logger.error(`Dumb requester Chunk at index ${idx} is undefined, chunk length: ${chunks.length}`);
        return undefined;
      }

      const txs = chunks[idx].map(t => TxHash.fromString(t));

      // If peer is dumb peer, we don't know yet if they received full blockProposal
      // there is solid chance that peer didn't receive proposal yet, thus we must send full hashes
      const includeFullHashesInRequestNotJustIndices = true;
      const blockRequest = BlockTxsRequest.fromBlockProposalAndMissingTxs(
        this.blockProposal,
        txs,
        includeFullHashesInRequestNotJustIndices,
      );
      if (!blockRequest) {
        return undefined;
      }

      return { blockRequest, txs };
    };

    const nextPeer = () => {
      const peers = this.peers.getDumbPeersToQuery();
      const idx = nextPeerIndex(() => peers.length);
      return idx === undefined ? undefined : peerIdFromString(peers[idx]);
    };

    const workerCount = Math.min(this.opts.dumbParallelWorkerCount, this.peers.getAllPeers().size);
    const workers = Array.from({ length: workerCount }, (_, index) =>
      this.dumbWorkerLoop(nextPeer, makeRequest, index + 1),
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
    let failedMakeRequestCount = 0;
    try {
      this.logger.debug(`Dumb worker ${workerIndex} started`);
      while (!this.shouldStop()) {
        const peerId = pickNextPeer();
        const weRanOutOfPeersToQuery = peerId === undefined;
        if (weRanOutOfPeersToQuery) {
          if (!this.peers.thereAreSomeDumbRatelimitExceededPeers()) {
            this.logger.debug(`Worker loop dumb: No more peers to query`);
            break;
          } else {
            // There are still some dumb peers to query but they have been rate limited
            // Sleep until they get unblocked
            await sleep(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL);
            continue;
          }
        }

        const nextBatchTxRequest = request(peerId);
        if (!nextBatchTxRequest) {
          failedMakeRequestCount++;
          if (failedMakeRequestCount >= FAILED_MAKE_REQUEST_THRESHOLD) {
            this.logger.debug(
              `Worker loop dumb: Could not create next batch request ${FAILED_MAKE_REQUEST_THRESHOLD} times, exiting`,
            );
            break;
          }

          this.logger.debug(`Worker loop dumb: Could not create next batch request`);
          continue;
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
    const nextPeerIndex = this.makeRoundRobinIndexer();

    const nextPeer = () => {
      const peers = this.peers.getSmartPeersToQuery();
      const idx = nextPeerIndex(() => peers.length);
      return idx === undefined ? undefined : peerIdFromString(peers[idx]);
    };

    const makeRequest = (pid: PeerId) => {
      const txs = this.txsMetadata.getTxsToRequestFromThePeer(pid);
      const blockRequest = BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txs);
      if (!blockRequest) {
        return undefined;
      }

      return { blockRequest, txs };
    };

    const workers = Array.from(
      { length: Math.min(this.opts.smartParallelWorkerCount, this.peers.getAllPeers().size) },
      (_, index) => this.smartWorkerLoop(nextPeer, makeRequest, index + 1),
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
    let failedMakeRequestCount = 0;
    try {
      this.logger.trace(`Smart worker ${workerIndex} started`);
      await executeTimeout((_: AbortSignal) => this.smartRequesterSemaphore.acquire(), this.timeoutMs);
      this.logger.trace(`Smart worker ${workerIndex} acquired semaphore`);

      while (!this.shouldStop()) {
        const peerId = pickNextPeer();
        const weRanOutOfPeersToQuery = peerId === undefined;
        if (weRanOutOfPeersToQuery) {
          this.logger.debug(`Worker loop smart: No more peers to query`);

          //If there are no more dumb peers to query then none of our peers can become smart,
          //thus we can simply exit this worker
          const noMoreDumbPeersToQuery = this.peers.getDumbPeersToQuery().length === 0;
          if (noMoreDumbPeersToQuery) {
            // These might be either smart peers that will get unblocked after _some time_
            const thereAreSomeRateLimitedPeers = this.peers.getRateLimitExceededPeers().size > 0;
            if (thereAreSomeRateLimitedPeers) {
              await sleep(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL);
              continue;
            }

            this.logger.debug(`Worker loop smart: No more smart peers to query killing ${workerIndex}`);
            break;
          }

          // Otherwise there are still some dumb peers that could become smart
          // We wait on this
          await executeTimeout((_: AbortSignal) => this.smartRequesterSemaphore.acquire(), this.timeoutMs);
          this.logger.debug(`Worker loop smart: acquired next smart peer`);
          continue;
        }

        const nextBatchTxRequest = request(peerId);
        if (!nextBatchTxRequest) {
          failedMakeRequestCount++;
          if (failedMakeRequestCount >= FAILED_MAKE_REQUEST_THRESHOLD) {
            this.logger.debug(
              `Worker loop smart: Could not create next batch request ${FAILED_MAKE_REQUEST_THRESHOLD} times, exiting`,
            );
            break;
          }

          this.logger.debug(`Worker loop smart: Could not create next batch request`);
          continue;
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
   * - FAILURE and UNKNOWN: We mark this, if peer has been marked this way N (N = BAD_PEER_THRESHOLD ) times they are not queried again
   *   this implies we will query these peers couple of more times and give them a chance to "redeem" themselves before completely ignoring them
   */
  private handleFailResponseFromPeer(peerId: PeerId, responseStatus: ReqRespStatus) {
    //TODO: Should we ban these peers?
    if (responseStatus === ReqRespStatus.FAILURE || responseStatus === ReqRespStatus.UNKNOWN) {
      this.peers.markPeerAsBad(peerId);
      return;
    }

    if (responseStatus === ReqRespStatus.RATE_LIMIT_EXCEEDED) {
      this.peers.markPeerRateLimitExceeded(peerId);
    }
  }

  /*
   * Handles successful response form the peer, this includes
   * - Handling received transactions
   * - Deciding if the peer is "smart" or not
   * */
  private async handleSuccessResponseFromPeer(peerId: PeerId, response: BlockTxsResponse) {
    // If we have received successful response from the peer, they have "redeemed" themselves and not considered bad anymore
    this.peers.unMarkPeerAsBad(peerId);
    this.logger.debug(`Received txs: ${response.txs.length} from peer ${peerId.toString()} `);
    await this.handleReceivedTxs(peerId, response.txs);

    this.decideIfPeerIsSmart(peerId, response);
  }

  /*
   * Handles received txs.
   * Transactions are validated and then put on async queue
   * to be yielded by main running loop
   * */
  private async handleReceivedTxs(peerId: PeerId, txs: TxArray) {
    const newTxs = txs.filter(tx => !this.txsMetadata.alreadyFetched(tx.txHash));

    if (newTxs.length === 0) {
      return;
    }

    //TODO: this validation can be slow, maybe spawn worker just for validation
    // We could use the async queue for communication.
    const validationResults = await Promise.allSettled(
      newTxs.map(async tx => ({
        tx,
        isValid: await this.p2pService.txValidator(tx, peerId),
      })),
    );

    validationResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.isValid) {
        if (this.txsMetadata.markFetched(peerId, result.value.tx)) {
          this.txQueue.put(result.value.tx);
        }
      }
    });

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

    const smartPeersAreDisabled = this.opts.smartParallelWorkerCount === 0;
    if (smartPeersAreDisabled) {
      return;
    }

    // If block response is invalid we still want to query this peer in the future
    // Because they sent successful response, so they might become smart peer in the future
    // Or send us needed txs
    if (!this.isBlockResponseValid(response)) {
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
    if (this.peers.getSmartPeers().size <= this.opts.smartParallelWorkerCount) {
      this.smartRequesterSemaphore.release();
    }
  }

  private isBlockResponseValid(response: BlockTxsResponse): boolean {
    const blockIdsMatch = this.blockProposal.archive.toString() === response.blockHash.toString();
    const peerHasSomeTxsFromProposal = !response.txIndices.isEmpty();
    return blockIdsMatch && peerHasSomeTxsFromProposal;
  }

  private peerHasSomeTxsWeAreMissing(_peerId: PeerId, response: BlockTxsResponse): boolean {
    const txsPeerHas = new Set(this.extractHashesPeerHasFromResponse(response).map(h => h.toString()));
    return this.txsMetadata.getMissingTxHashes().intersection(txsPeerHas).size > 0;
  }

  private markTxsPeerHas(peerId: PeerId, response: BlockTxsResponse) {
    const txsPeerHas = this.extractHashesPeerHasFromResponse(response);
    this.logger.debug(`${peerId.toString()} has txs: ${txsPeerHas.map(tx => tx.toString()).join(', ')}`);
    this.txsMetadata.markPeerHas(peerId, txsPeerHas);
  }

  private extractHashesPeerHasFromResponse(response: BlockTxsResponse): Array<TxHash> {
    const hashes: TxHash[] = [];
    const indicesOfHashesPeerHas = new Set(response.txIndices.getTrueIndices());
    this.blockProposal.txHashes.forEach((hash, idx) => {
      if (indicesOfHashesPeerHas.has(idx)) {
        hashes.push(hash);
      }
    });

    return hashes;
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
   * @returns true if all missing txs have been fetched */
  private fetchedAllTxs() {
    return Array.from(this.txsMetadata.values()).every(tx => tx.fetched);
  }

  /*
   * Checks if the BatchTxRequester should stop fetching missing txs
   * Conditions for stopping are:
   * - There have been no missing transactions to start with
   * - All transactions have been fetched
   * - The deadline has been hit (no more time to fetch)
   * - This process has been cancelled via abortSignal
   *
   * @returns true if BatchTxRequester should stop, otherwise false*/
  private shouldStop() {
    const aborted = this.opts.abortSignal?.aborted ?? false;
    if (aborted) {
      this.unlockSmartRequesterSemaphores();
    }

    return aborted || this.txsMetadata.size === 0 || this.fetchedAllTxs() || this.dateProvider.now() > this.deadline;
  }

  /*
   * Helper function which unlocks all smart requester semaphores
   * @note This is needed otherwise they will block forever
   * */
  private unlockSmartRequesterSemaphores() {
    for (let i = 0; i < this.opts.smartParallelWorkerCount; i++) {
      this.smartRequesterSemaphore.release();
    }
  }
}
