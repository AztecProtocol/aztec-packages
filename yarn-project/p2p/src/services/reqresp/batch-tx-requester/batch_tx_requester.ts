import { chunk } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { FifoMemoryQueue, type ISemaphore, Semaphore } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, executeTimeout } from '@aztec/foundation/timer';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { Tx, TxArray, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { ConnectionSampler } from '.././connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol } from '.././interface.js';
import { BlockTxsRequest, BlockTxsResponse } from '.././protocols/index.js';
import { ReqRespStatus } from '.././status.js';
import type { BatchTxRequesterOptions, ITxMetadataCollection } from './interface.js';
import { MissingTxMetadata, MissingTxMetadataCollection, TX_BATCH_SIZE } from './missing_txs.js';
import { type IPeerCollection, PeerCollection, RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL } from './peer_collection.js';

const SMART_PEERS_TO_QUERY_IN_PARALLEL = 10;
const DUMB_PEERS_TO_QUERY_IN_PARALLEL = 10;

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
    private readonly reqresp: ReqRespInterface,
    private readonly connectionSampler: ConnectionSampler,
    private readonly txValidator: (tx: Tx, peerId: PeerId) => Promise<boolean>,
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
      const initialPeers = this.connectionSampler.getPeerListSortedByConnectionCountAsc();
      this.peers = new PeerCollection(initialPeers, pinnedPeer, dateProvider);
    }
    const entries: Array<[string, MissingTxMetadata]> = missingTxs.map(h => [h.toString(), new MissingTxMetadata(h)]);
    this.txsMetadata = new MissingTxMetadataCollection(entries);
    this.smartRequesterSemaphore = this.opts.semaphore ?? new Semaphore(0);
  }

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

  public static async collectAllTxs(generator: AsyncGenerator<Tx, Tx | undefined, unknown>): Promise<Tx[]> {
    const txs: Tx[] = [];
    for await (const tx of generator) {
      if (tx === undefined) break;
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

  private async smartRequester() {
    const nextPeerIndex = this.makeRoundRobinIndexer();

    const nextPeer = () => {
      const peers = this.peers.getSmartPeersToQuery();
      const idx = nextPeerIndex(() => peers.length);
      return idx === undefined ? undefined : peerIdFromString(peers[idx]);
    };

    const makeRequest = (pid: PeerId) => {
      const txs = this.txsMetadata.getTxsToRequestFromThePeer(pid).slice(0, TX_BATCH_SIZE);

      txs.forEach(tx => {
        this.txsMetadata.markRequested(tx);
        this.txsMetadata.markInFlightBySmartPeer(tx);
      });

      return { blockRequest: BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txs), txs };
    };

    const workers = Array.from(
      { length: Math.min(this.opts.smartParallelWorkerCount, this.peers.getAllPeers().size) },
      (_, index) => this.smartWorkerLoop(nextPeer, makeRequest, index + 1),
    );

    await Promise.allSettled(workers);
  }

  private async dumbRequester() {
    const nextPeerIndex = this.makeRoundRobinIndexer();
    const nextBatchIndex = this.makeRoundRobinIndexer();

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
      }
      const txs = chunks[idx].map(t => TxHash.fromString(t));

      this.logger.debug(`Dumb batch index: ${idx}, batches count: ${chunks.length}`);
      return { blockRequest: BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txs), txs };
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

  private async dumbWorkerLoop(
    pickNextPeer: () => PeerId | undefined,
    request: (pid: PeerId) => { blockRequest: BlockTxsRequest | undefined; txs: TxHash[] } | undefined,
    workerIndex: number,
  ) {
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
          this.logger.debug(`Worker loop dumb: Could not create next batch request`);
          // We retry with the next peer/batch
          continue;
        }

        //TODO: check this, this should only happen in case something bad happened
        const { blockRequest, txs } = nextBatchTxRequest;
        if (blockRequest === undefined) {
          this.logger.error(`Dumb worker: BLOCK REQ undefined`);
          break;
        }

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

  private async smartWorkerLoop(
    pickNextPeer: () => PeerId | undefined,
    request: (pid: PeerId) => { blockRequest: BlockTxsRequest | undefined; txs: TxHash[] } | undefined,
    workerIndex: number,
  ) {
    this.logger.debug(`Smart worker ${workerIndex} started`);
    await executeTimeout((_: AbortSignal) => this.smartRequesterSemaphore.acquire(), this.timeoutMs);
    this.logger.debug(`Smart worker ${workerIndex} acquired semaphore`);

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
          // Or dumb peers that might become smart, so let's not 'kill' this worker, but sleep
          const thereAreSomeRateLimitedPeers = this.peers.getRateLimitExceededPeers().size > 0;
          if (thereAreSomeRateLimitedPeers) {
            await sleep(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL);
            continue;
          }

          this.logger.debug(`Worker loop smart: No more smart peers to query, EXITING`);
          break;
        }

        // Otherwise we wait until some peer becomes smart
        await executeTimeout((_: AbortSignal) => this.smartRequesterSemaphore.acquire(), this.timeoutMs);
        this.logger.debug(`Worker loop smart: acquired next smart peer`);
        continue;
      }

      const nextBatchTxRequest = request(peerId);
      if (!nextBatchTxRequest) {
        // We retry with the next peer/batch
        this.logger.warn(`Worker loop smart: Could not create next batch request`);
        continue;
      }

      //TODO: check this, this should only happen in case something bad happened
      const { blockRequest, txs } = nextBatchTxRequest;
      if (blockRequest === undefined) {
        this.logger.error(`Smart worker: BLOCK REQ undefined`);
        break;
      }

      this.logger.debug(
        `Worker type smart: Requesting txs from peer ${peerId.toString()}: ${txs.map(tx => tx.toString()).join(', ')}`,
      );

      await this.requestTxBatch(peerId, blockRequest);
      txs.forEach(tx => {
        this.txsMetadata.markNotInFlightBySmartPeer(tx);
      });
    }

    this.logger.debug(`Smart worker ${workerIndex} finished`);
  }

  private async requestTxBatch(peerId: PeerId, request: BlockTxsRequest): Promise<BlockTxsResponse | undefined> {
    try {
      this.peers.markPeerInFlight(peerId);
      const response = await this.reqresp.sendRequestToPeer(peerId, ReqRespSubProtocol.BLOCK_TXS, request.toBuffer());
      if (response.status !== ReqRespStatus.SUCCESS) {
        this.logger.debug(`Peer ${peerId.toString()} failed to respond with status: ${response.status}`);
        this.handleFailResponseFromPeer(peerId, response.status);
        return;
      }

      const blockResponse = BlockTxsResponse.fromBuffer(response.data);
      await this.handleSuccessResponseFromPeer(peerId, blockResponse);
    } catch (err: any) {
      this.logger.error(`Failed to deserialize response from peer ${peerId.toString()}: ${err.message}`, {
        peerId,
        error: err,
      });

      this.handleFailResponseFromPeer(peerId, ReqRespStatus.UNKNOWN);
    } finally {
      this.peers.unMarkPeerInFlight(peerId);
    }
  }

  private async handleSuccessResponseFromPeer(peerId: PeerId, response: BlockTxsResponse) {
    this.peers.unMarkPeerAsBad(peerId);
    this.logger.debug(`Received txs: ${response.txs.length} from peer ${peerId.toString()} `);
    await this.handleReceivedTxs(peerId, response.txs);

    const pinnedPeerShouldNeverBeMarkedAsSmart = this.pinnedPeer && peerId.toString() === this.pinnedPeer.toString();
    if (pinnedPeerShouldNeverBeMarkedAsSmart) {
      return;
    }

    const smartPeersAreDisabled = this.opts.smartParallelWorkerCount === 0;
    if (smartPeersAreDisabled) {
      return;
    }

    if (!this.isBlockResponseValid(response)) {
      return;
    }

    // We mark peer as "smart" only if they have some txs we are missing
    // Otherwise we keep them as "dumb" in hope they'll receive some new txs we are missing in the future
    if (!this.peerHasSomeTxsWeAreMissing(peerId, response)) {
      this.logger.debug(`${peerId.toString()} has no txs we are missing, skipping`);
      return;
    }

    this.markTxsPeerHas(peerId, response);

    this.peers.markPeerSmart(peerId);
    if (this.peers.getSmartPeers().size <= this.opts.smartParallelWorkerCount) {
      this.smartRequesterSemaphore.release();
    }
  }

  private isBlockResponseValid(response: BlockTxsResponse): boolean {
    //TODO: should we  ban peer if this does not match?
    const blockIdsMatch = this.blockProposal.archive.toString() === response.blockHash.toString();
    const peerHasSomeTxsFromProposal = !response.txIndices.isEmpty();
    return blockIdsMatch && peerHasSomeTxsFromProposal;
  }

  private peerHasSomeTxsWeAreMissing(_peerId: PeerId, response: BlockTxsResponse): boolean {
    const txsPeerHas = new Set(this.extractHashesPeerHasFromResponse(response).map(h => h.toString()));
    return this.txsMetadata.getMissingTxHashes().intersection(txsPeerHas).size > 0;
  }

  private async handleReceivedTxs(peerId: PeerId, txs: TxArray) {
    const newTxs = txs.filter(tx => !this.txsMetadata.alreadyFetched(tx.txHash));

    //TODO: this validation can be slow, maybe spawn worker just for validation
    // We could use the async queue for communication.
    const validationResults = await Promise.allSettled(
      newTxs.map(async tx => ({
        tx,
        isValid: await this.txValidator(tx, peerId),
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

  private markTxsPeerHas(peerId: PeerId, response: BlockTxsResponse) {
    const txsPeerHas = this.extractHashesPeerHasFromResponse(response);
    this.logger.debug(`${peerId.toString()} has txs: ${txsPeerHas.map(tx => tx.toString()).join(', ')}`);
    this.txsMetadata.markPeerHas(peerId, txsPeerHas);
  }

  private handleFailResponseFromPeer(peerId: PeerId, responseStatus: ReqRespStatus) {
    if (responseStatus === ReqRespStatus.FAILURE || responseStatus === ReqRespStatus.UNKNOWN) {
      //TODO: Should we ban these peers?
      this.peers.markPeerAsBad(peerId);
      return;
    }

    if (responseStatus === ReqRespStatus.RATE_LIMIT_EXCEEDED) {
      this.peers.markPeerRateLimitExceeded(peerId);
    }
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

  private makeRoundRobinIndexer(start = 0) {
    let i = start;
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

  private fetchedAllTxs() {
    return Array.from(this.txsMetadata.values()).every(tx => tx.fetched);
  }

  private shouldStop() {
    const aborted = this.opts.abortSignal?.aborted ?? false;
    if (aborted) {
      this.unlockSmartRequesterSemaphores();
    }

    return aborted || this.txsMetadata.size === 0 || this.fetchedAllTxs() || this.dateProvider.now() > this.deadline;
  }

  // Helper function which unlocks all smart requester semaphores
  // This is needed otherwise they will block forever
  private unlockSmartRequesterSemaphores() {
    for (let i = 0; i < this.opts.smartParallelWorkerCount; i++) {
      this.smartRequesterSemaphore.release();
    }
  }
}
