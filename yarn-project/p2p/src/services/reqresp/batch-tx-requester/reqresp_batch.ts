import { chunk } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { type TxArray, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { ConnectionSampler } from '.././connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol, type ReqRespSubProtocolValidators } from '.././interface.js';
import { BlockTxsRequest, BlockTxsResponse } from '.././protocols/index.js';
import { ReqRespStatus } from '.././status.js';
import { MissingTxMetadata, MissingTxMetadataCollection, TX_BATCH_SIZE } from './missing_txs.js';
import { PeerCollection } from './peer_collection.js';

const SMART_PEERS_TO_QUERY_IN_PARALLEL = 10;
const DUMB_PEERS_TO_QUERY_IN_PARALLEL = 10;

export class BatchTxRequester {
  private readonly peers: PeerCollection;
  private readonly txsMetadata;

  private readonly deadline;

  private readonly smartRequesterSemaphore = new Semaphore(0);

  constructor(
    missingTxs: TxHash[],
    private readonly blockProposal: BlockProposal,
    private readonly pinnedPeer: PeerId | undefined,
    private readonly timeoutMs: number,
    private readonly reqresp: ReqRespInterface,
    private readonly connectionSampler: ConnectionSampler,
    private readonly txValidator: ReqRespSubProtocolValidators[ReqRespSubProtocol.TX],
    private readonly logger = createLogger('p2p:reqresp_batch'),
    private readonly dateProvider: DateProvider = new DateProvider(),
  ) {
    this.txsMetadata = new MissingTxMetadataCollection(
      missingTxs.map(txHash => [txHash.toString(), new MissingTxMetadata(txHash)]),
    );
    this.peers = new PeerCollection(this.connectionSampler.getPeerListSortedByConnectionCountAsc());
    console.log(this.peers);

    //Pinned peer is queried separately and thus always considered "in-flight" by both "dumb" and "smart" requester
    if (this.pinnedPeer) {
      this.peers.markPeerInFlight(this.pinnedPeer);
    }

    this.deadline = this.dateProvider.now() + this.timeoutMs;
  }

  public async run() {
    try {
      if (this.txsMetadata.getMissingTxHashes().size === 0) {
        this.logger.debug('No missing txs to request');
        return;
      }

      //TODO: executeTimeout?
      await Promise.allSettled([this.smartRequester(), this.dumbRequester(), this.pinnedPeerRequester()]);

      //TODO: handle this via async iter
      return this.txsMetadata.getFetchedTxs();
    } finally {
      for (let i = 0; i < SMART_PEERS_TO_QUERY_IN_PARALLEL; i++) {
        this.smartRequesterSemaphore.release();
      }
    }
  }

  //TODO: handle pinned peer properly
  private async pinnedPeerRequester() {
    while (!this.shouldStop()) {
      if (!this.pinnedPeer) {
        this.logger.debug('No pinned peer to request from');
        return;
      }

      const txsToRequest = this.txsMetadata.getTxsToRequestFromThePeer(this.pinnedPeer).slice(0, TX_BATCH_SIZE);
      if (txsToRequest.length === 0) {
        this.logger.debug(`Pinned peer ${this.pinnedPeer.toString()} has no txs to request`);
        return;
      }

      txsToRequest.forEach(tx => this.txsMetadata.markRequested(tx));

      const request = BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txsToRequest);
      if (!request) {
        return;
      }
      await this.requestTxBatch(this.pinnedPeer, request);
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
      { length: Math.min(SMART_PEERS_TO_QUERY_IN_PARALLEL, this.peers.getAllPeers().size) },
      (_, index) => this.smartWorkerLoop(nextPeer, makeRequest, index + 1),
    );

    await Promise.allSettled(workers);
  }

  private async dumbRequester() {
    const nextPeerIndex = this.makeRoundRobinIndexer();
    const nextBatchIndex = this.makeRoundRobinIndexer();

    const txChunks = () =>
      //TODO: wrap around  for last batch
      chunk<string>(
        // this.txsMetadata
        //   .getSortedByRequestedCountThenByInFlightCountAsc(Array.from(this.txsMetadata.getMissingTxHashes()))
        //   .map(t => t.txHash.toString()),
        Array.from(this.txsMetadata.getMissingTxHashes()),
        TX_BATCH_SIZE,
      );

    const makeRequest = (_pid: PeerId) => {
      const chunks = txChunks();
      const idx = nextBatchIndex(() => chunks.length);
      if (idx === undefined) {
        return undefined;
      }

      if (chunks[idx] === undefined) {
        console.error(`Dumb requester Chunk at index ${idx} is undefined, chunk length: ${chunks.length}`);
      }
      const txs = chunks[idx].map(t => TxHash.fromString(t));
      console.log(`Dumb batch index: ${idx}, batches count: ${chunks.length}`);
      txs.forEach(tx => this.txsMetadata.markRequested(tx));
      return { blockRequest: BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txs), txs };
    };

    const nextPeer = () => {
      const peers = this.peers.getDumbPeersToQuery();
      const idx = nextPeerIndex(() => peers.length);
      return idx === undefined ? undefined : peerIdFromString(peers[idx]);
    };

    const workers = Array.from(
      { length: Math.min(DUMB_PEERS_TO_QUERY_IN_PARALLEL, this.peers.getAllPeers().size) },
      (_, index) => this.dumbWorkerLoop(nextPeer, makeRequest, index + 1),
    );
    await Promise.allSettled(workers);
  }

  private async dumbWorkerLoop(
    pickNextPeer: () => PeerId | undefined,
    request: (pid: PeerId) => { blockRequest: BlockTxsRequest | undefined; txs: TxHash[] } | undefined,
    workerIndex: number,
  ) {
    try {
      console.log(`Dumb worker ${workerIndex} started`);
      let count = 0;
      while (!this.shouldStop()) {
        count++;
        const peerId = pickNextPeer();
        const weRanOutOfPeersToQuery = peerId === undefined;
        if (weRanOutOfPeersToQuery) {
          this.logger.debug(`Worker loop dumb: No more peers to query`);
          console.log(`[${workerIndex}][${count}] Worker loop dumb: No more peers to query`);
          break;
        }

        console.log(`[${workerIndex}] Worker loop dumb: count: ${count} for peerId: ${peerId.toString()}`);

        const nextBatchTxRequest = request(peerId);
        if (!nextBatchTxRequest) {
          this.logger.warn(`Worker loop dumb: Could not create next batch request`);
          // We retry with the next peer/batch
          console.log(
            `[${workerIndex}][${count}] Worker loop dumb: Could not create next batch request for peer ${peerId.toString()}`,
          );
          continue;
        }

        //TODO: check this, this should only happen in case something bad happened
        const { blockRequest, txs } = nextBatchTxRequest;
        if (blockRequest === undefined) {
          console.log(`[${workerIndex}] Dumb worker: BLOCK REQ undefined`);
          break;
        }

        console.log(
          `[${workerIndex}][${count}] Worker type dumb: Requesting txs from peer ${peerId.toString()}: ${txs.map(tx => tx.toString()).join('\n')}`,
        );

        await this.requestTxBatch(peerId, blockRequest);
      }
    } catch (err: any) {
      console.error(`Dumb worker ${workerIndex} encountered an error: ${err}`);
    } finally {
      console.log(`Dumb worker ${workerIndex} finished`);
    }
  }

  private async smartWorkerLoop(
    pickNextPeer: () => PeerId | undefined,
    request: (pid: PeerId) => { blockRequest: BlockTxsRequest | undefined; txs: TxHash[] } | undefined,
    workerIndex: number,
  ) {
    console.log(`Smart worker ${workerIndex} started`);
    let count = 0;
    await this.smartRequesterSemaphore.acquire();
    console.log(`Smart worker ${workerIndex} acquired semaphore`);

    while (!this.shouldStop()) {
      count++;
      const peerId = pickNextPeer();
      const weRanOutOfPeersToQuery = peerId === undefined;
      if (weRanOutOfPeersToQuery) {
        this.logger.debug(`Worker loop smart: No more no more peers to query`);
        console.log(`[${workerIndex}][${count}] Worker loop smart: No more smart peers to query`);

        //If there are no more dumb peers to query then none of our peers can become smart,
        //thus we can simply exit this worker
        const noMoreDumbPeersToQuery = this.peers.getDumbPeersToQuery().length === 0;
        if (noMoreDumbPeersToQuery) {
          console.log(`[${workerIndex}][${count}] Worker loop smart: No more smart peers to query, EXITING`);
          break;
        }

        await this.smartRequesterSemaphore.acquire();
        this.logger.debug(`Worker loop smart: acquired next smart peer`);
        console.log(`[${workerIndex}][${count}] Worker loop smart: acquired next smart peer`);
        continue;
      }

      const nextBatchTxRequest = request(peerId);
      if (!nextBatchTxRequest) {
        this.logger.warn(`Worker loop smart: Could not create next batch request`);
        console.log(`[${workerIndex}][${count}] Worker loop smart: Could not create next batch request`);
        // We retry with the next peer/batch
        continue;
      }

      //TODO: check this, this should only happen in case something bad happened
      const { blockRequest, txs } = nextBatchTxRequest;
      if (blockRequest === undefined) {
        console.log(`[${workerIndex}] Smart worker: BLOCK REQ undefined`);
        break;
      }

      console.log(
        `[${workerIndex}][${count}] Worker type smart : Requesting txs from peer ${peerId.toString()}: ${txs.map(tx => tx.toString()).join('\n')}`,
      );

      await this.requestTxBatch(peerId, blockRequest);
      txs.forEach(tx => {
        this.txsMetadata.markNotInFlightBySmartPeer(tx);
      });
    }

    console.log(`Smart worker ${workerIndex} finished`);
  }

  private async requestTxBatch(peerId: PeerId, request: BlockTxsRequest): Promise<BlockTxsResponse | undefined> {
    try {
      this.peers.markPeerInFlight(peerId);
      const response = await this.reqresp.sendRequestToPeer(peerId, ReqRespSubProtocol.BLOCK_TXS, request.toBuffer());
      if (response.status !== ReqRespStatus.SUCCESS) {
        console.log(`Peer ${peerId.toString()} failed to respond with status: ${response.status}`);
        await this.handleFailResponseFromPeer(peerId, response.status);
        return;
      }

      const blockResponse = BlockTxsResponse.fromBuffer(response.data);
      this.handleSuccessResponseFromPeer(peerId, blockResponse);
    } catch (err: any) {
      this.logger.error(`Failed to deserialize response from peer ${peerId.toString()}: ${err.message}`, {
        peerId,
        error: err,
      });

      console.error(`Peer ${peerId.toString()}\n${err}`);
      await this.handleFailResponseFromPeer(peerId, ReqRespStatus.UNKNOWN);
    } finally {
      // Don't mark pinned peer as not in flight
      if (!this.pinnedPeer?.equals(peerId)) {
        this.peers.unMarkPeerInFlight(peerId);
      }
    }
  }

  private handleSuccessResponseFromPeer(peerId: PeerId, response: BlockTxsResponse) {
    this.peers.unMarkPeerAsBad(peerId);
    this.logger.debug(`Received txs: ${response.txs.length} from peer ${peerId.toString()} `);
    this.handleReceivedTxs(peerId, response.txs);

    if (!this.isBlockResponseValid(response)) {
      return;
    }

    // We mark peer as "smart" only if they have some txs we are missing
    // Otherwise we keep them as "dumb" in hope they'll receive some new txs we are missing in the future
    if (!this.peerHasSomeTxsWeAreMissing(peerId, response)) {
      console.log(`${peerId.toString()} has no txs we are missing, skipping`);
      return;
    }

    this.markTxsPeerHas(peerId, response);
    this.peers.markPeerSmart(peerId);

    if (this.peers.getSmartPeers().size <= SMART_PEERS_TO_QUERY_IN_PARALLEL) {
      this.smartRequesterSemaphore.release();
    }
  }

  private isBlockResponseValid(response: BlockTxsResponse): boolean {
    //TODO: maybe ban peer if this does not match?
    const blockIdsMatch = this.blockProposal.archive.toString() === response.blockHash.toString();
    const peerHasSomeTxsFromProposal = !response.txIndices.isEmpty();
    return blockIdsMatch && peerHasSomeTxsFromProposal;
  }

  private peerHasSomeTxsWeAreMissing(_peerId: PeerId, response: BlockTxsResponse): boolean {
    const txsPeerHas = new Set(this.extractHashesPeerHasFromResponse(response).map(h => h.toString()));
    return this.txsMetadata.getMissingTxHashes().intersection(txsPeerHas).size > 0;
  }

  private handleReceivedTxs(peerId: PeerId, txs: TxArray) {
    //TODO: yield txs
    txs.forEach(tx => {
      this.txsMetadata.markFetched(peerId, tx);
    });

    const missingTxHashes = this.txsMetadata.getMissingTxHashes();
    if (missingTxHashes.size === 0) {
      // wake sleepers so they can see shouldStop() and exit
      for (let i = 0; i < SMART_PEERS_TO_QUERY_IN_PARALLEL; i++) {
        this.smartRequesterSemaphore.release();
      }
    } else {
      console.log(
        `Missing txs: \n ${Array.from(this.txsMetadata.getMissingTxHashes())
          .map(tx => tx.toString())
          .join('\n')}`,
      );
    }
  }

  private markTxsPeerHas(peerId: PeerId, response: BlockTxsResponse) {
    const txsPeerHas = this.extractHashesPeerHasFromResponse(response);
    console.log(`${peerId.toString()} has txs: ${txsPeerHas.map(tx => tx.toString()).join('\n')}`);
    //TODO: validate txs
    this.txsMetadata.markPeerHas(peerId, txsPeerHas);
  }

  //TODO: are we missing something here?
  // banning the peers?
  private async handleFailResponseFromPeer(peerId: PeerId, responseStatus: ReqRespStatus) {
    if (responseStatus === ReqRespStatus.FAILURE || responseStatus === ReqRespStatus.UNKNOWN) {
      this.peers.markPeerAsBad(peerId);
    }

    //TODO: handle this properly
    if (responseStatus === ReqRespStatus.RATE_LIMIT_EXCEEDED) {
      await sleep(1000);
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
    return this.txsMetadata.values().every(tx => tx.fetched);
  }

  //TODO: abort signal here?
  private shouldStop() {
    return this.txsMetadata.size === 0 || this.fetchedAllTxs() || this.dateProvider.now() > this.deadline;
  }
}
