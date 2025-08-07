import { chunk } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { type TxArray, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { ConnectionSampler } from '.././connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol } from '.././interface.js';
import { BlockTxsRequest, BlockTxsResponse } from '.././protocols/index.js';
import { ReqRespStatus } from '.././status.js';
import { MissingTxMetadata, MissingTxMetadataCollection, TX_BATCH_SIZE } from './missing_txs.js';
import { PeerCollection } from './peer_colleciton.js';

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
    private logger = createLogger('p2p:reqresp_batch'),
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

    this.deadline = Date.now() + this.timeoutMs;
  }

  public async run() {
    if (this.txsMetadata.getMissingTxHashes().size === 0) {
      this.logger.debug('No missing txs to request');
      return;
    }

    //TODO: executeTimeout?
    await Promise.allSettled([this.smartRequester(), this.dumbRequester(), this.pinnedPeerRequester()]);

    //TODO: handle this via async iter
    return this.txsMetadata.getFetchedTxs();
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
    const getPeers = () => this.peers.getSmartPeersToQuery();

    const nextPeer = () => {
      const peers = getPeers();
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
      { length: Math.min(DUMB_PEERS_TO_QUERY_IN_PARALLEL, this.peers.getAllPeers().size) },
      () => this.workerLoop(nextPeer, makeRequest, 'smart'),
    );

    await Promise.allSettled(workers);
  }

  private async dumbRequester() {
    const nextPeerIndex = this.makeRoundRobinIndexer();
    const nextBatchIndex = this.makeRoundRobinIndexer();

    const txChunks = () =>
      //TODO: wrap around  for last batch
      chunk<string>(
        this.txsMetadata
          .getSortedByRequestedCountThenByInFlightCountAsc(Array.from(this.txsMetadata.getMissingTxHashes()))
          .map(t => t.txHash.toString()),
        TX_BATCH_SIZE,
      );

    const makeRequest = (_pid: PeerId) => {
      const txsChunks = txChunks();
      const idx = nextBatchIndex(() => txChunks().length);
      if (idx === undefined) {
        return undefined;
      }

      const txs = txChunks()[idx].map(t => TxHash.fromString(t));
      console.log(`Dumb batch index: ${idx}, batches count: ${txsChunks.length}`);
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
      () => this.workerLoop(nextPeer, makeRequest, 'dumb'),
    );
    await Promise.allSettled(workers);
  }

  //TODO: cleanup the typeing here
  // splitting this in workerLoopSmart and dumb probably makes sense
  private async workerLoop(
    pickNextPeer: () => PeerId | undefined,
    request: (pid: PeerId) => { blockRequest: BlockTxsRequest | undefined; txs: TxHash[] } | undefined,
    type: 'smart' | 'dumb',
  ) {
    if (type === 'smart') {
      await this.smartRequesterSemaphore.acquire();
    }

    let count = 0;
    while (!this.shouldStop()) {
      count++;
      const peerId = pickNextPeer();
      const weRanOutOfPeersToQuery = peerId === undefined;
      if (weRanOutOfPeersToQuery) {
        this.logger.debug(`Worker loop: ${type}: No more peers to query`);
        console.log(`[${count}] Worker loop: ${type}: No more peers to query`);
        return;
      }

      const nextBatchTxRequest = request(peerId);
      if (!nextBatchTxRequest) {
        this.logger.warn(`Worker loop: ${type}: Could not create next batch request`);
        // We retry with the next peer/batch
        continue;
      }

      const { blockRequest, txs } = nextBatchTxRequest;
      if (blockRequest === undefined) {
        return;
      }

      console.log(
        `[${count}] Worker type: ${type}: Requesting txs from peer ${peerId.toString()}: ${txs.map(tx => tx.toString()).join('\n')}`,
      );

      await this.requestTxBatch(peerId, blockRequest);
      if (type === 'smart') {
        txs.forEach(tx => {
          this.txsMetadata.markNotInFlightBySmartPeer(tx);
        });
      }
    }
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

      console.log(`Peer ${peerId.toString()}\n${err}`);
      await this.handleFailResponseFromPeer(peerId, ReqRespStatus.UNKNOWN);
    } finally {
      this.peers.unMarkPeerInFlight(peerId);
    }
  }

  private handleSuccessResponseFromPeer(peerId: PeerId, response: BlockTxsResponse) {
    this.peers.markPeerAsBad(peerId);
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
  }

  private markTxsPeerHas(peerId: PeerId, response: BlockTxsResponse) {
    const txsPeerHas = this.extractHashesPeerHasFromResponse(response);
    console.log(`${peerId.toString()} has txs: ${txsPeerHas.map(tx => tx.toString()).join('\n')}`);
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

      const current = i;
      i = (current + 1) % length;
      return current;
    };
  }

  private fetchedAllTxs() {
    return this.txsMetadata.values().every(tx => tx.fetched);
  }

  //TODO: abort signal here?
  private shouldStop() {
    return this.txsMetadata.size === 0 || this.fetchedAllTxs() || Date.now() > this.deadline;
  }
}
