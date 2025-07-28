import { chunk } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx, TxArray, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { ConnectionSampler } from './connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol } from './interface.js';
import { BlockTxsRequest, BlockTxsResponse } from './protocols/index.js';
import { ReqRespStatus } from './status.js';

const TX_BATCH_SIZE = 8;
const PEERS_TO_QUERY_IN_PARALLEL = 10;

export class BatchTxRequester {
  private readonly peers: PeerId[];
  private readonly smartPeers = new Set<string>();
  private readonly badPeers = new Set<string>();

  private readonly txsMetadata;

  private readonly deadline;

  private startSmartRequester: ((v: void) => void) | undefined = undefined;

  constructor(
    private readonly blockProposal: BlockProposal,
    private readonly missingTxs: TxHash[],
    private readonly pinnedPeer: PeerId | undefined,
    private readonly timeoutMs: number,
    private readonly reqresp: ReqRespInterface,
    private readonly connectionSampler: ConnectionSampler,
    private logger = createLogger('p2p:reqresp_batch'),
  ) {
    this.txsMetadata = new MissingTxMetadataCollection(
      this.missingTxs.map(txHash => [txHash.toString(), new MissingTxMetadata(txHash)]),
    );
    this.peers = this.connectionSampler.getPeerListSortedByConnectionCountAsc();
    if (this.pinnedPeer) {
      this.smartPeers.add(this.pinnedPeer.toString());
    }

    this.deadline = Date.now() + this.timeoutMs;
  }

  public async run() {
    if (this.missingTxs.length === 0) {
      this.logger.debug('No missing txs to request');
      return;
    }

    const { promise, resolve } = promiseWithResolvers<void>();
    this.startSmartRequester = resolve;

    //TODO: executeTimeout?
    await Promise.allSettled([this.smartRequester(promise), this.dumbRequester()]);

    //TODO: handle this via async iter
    return this.txsMetadata.getFetchedTxs();
  }

  private async smartRequester(start: Promise<void>) {
    const nextPeerIndex = this.makeRoundRobinIndexer(() => getPeers().length);
    const getPeers = () => Array.from(this.smartPeers.difference(this.badPeers));

    // if we don't have a pinned peer we wait to start smart requester
    // otherwise we start immediately with the pinned peer
    if (!this.pinnedPeer) {
      await start;
    }

    const nextPeer = () => {
      const idx = nextPeerIndex();
      return idx === undefined ? undefined : peerIdFromString(getPeers()[idx]);
    };

    const makeRequest = (pid: PeerId) => {
      const txsToRequest = this.txsMetadata.getTxsToRequestFromThePeer(pid).slice(0, TX_BATCH_SIZE);
      txsToRequest.forEach(tx => this.txsMetadata.markRequested(tx));

      return BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txsToRequest);
    };

    const workers = Array.from({ length: Math.min(PEERS_TO_QUERY_IN_PARALLEL, getPeers().length) }, () =>
      this.workerLoop(nextPeer, makeRequest, 'smart'),
    );
    await Promise.allSettled(workers);
  }

  private async dumbRequester() {
    const peers = new Set(this.peers.map(peer => peer.toString()));
    const nextPeerIndex = this.makeRoundRobinIndexer(() => getPeers().length);
    const nextBatchIndex = this.makeRoundRobinIndexer(() => txChunks().length);
    const getPeers = () => Array.from(peers.difference(this.smartPeers.union(this.badPeers)));

    const txChunks = () =>
      chunk<TxHash>(
        this.missingTxs.filter(t => !this.txsMetadata.isFetched(t)),
        TX_BATCH_SIZE,
      );

    const makeRequest = (_pid: PeerId) => {
      const idx = nextBatchIndex();
      if (idx === undefined) {
        return undefined;
      }

      const txs = txChunks()[idx];
      txs.forEach(tx => this.txsMetadata.markRequested(tx));
      return BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txs);
    };

    const nextPeer = () => {
      const idx = nextPeerIndex();
      return idx === undefined ? undefined : peerIdFromString(Array.from(getPeers())[idx]);
    };

    const workers = Array.from({ length: Math.min(PEERS_TO_QUERY_IN_PARALLEL, getPeers().length) }, () =>
      this.workerLoop(nextPeer, makeRequest, 'dumb'),
    );
    await Promise.allSettled(workers);
  }

  private async workerLoop(
    pickNextPeer: () => PeerId | undefined,
    request: (pid: PeerId) => BlockTxsRequest | undefined,
    type: 'smart' | 'dumb',
  ) {
    while (!this.shouldStop()) {
      const peerId = pickNextPeer();
      const weRanOutOfPeersToQuery = peerId === undefined;
      if (weRanOutOfPeersToQuery) {
        this.logger.debug(`Worker loop: ${type}: No more peers to query`);
        return;
      }

      // TODO: think about this a bit more what should we do in this case?
      const nextBatchTxRequest = request(peerId);
      if (!nextBatchTxRequest) {
        this.logger.warn(`Worker loop: ${type}: Could not create next batch request`);
        // We retry with the next peer/batch
        continue;
      }

      await this.requestTxBatch(peerId, nextBatchTxRequest);
    }
  }

  private async requestTxBatch(peerId: PeerId, request: BlockTxsRequest): Promise<BlockTxsResponse | undefined> {
    try {
      const response = await this.reqresp.sendRequestToPeer(peerId, ReqRespSubProtocol.BLOCK_TXS, request.toBuffer());
      if (response.status !== ReqRespStatus.SUCCESS) {
        return;
      }

      const block_response = BlockTxsResponse.fromBuffer(response.data);
      this.handleSuccessResponseFromPeer(peerId, block_response);
    } catch (err: any) {
      this.logger.error(`Failed to deserialize response from peer ${peerId.toString()}: ${err.message}`, {
        peerId,
        error: err,
      });

      this.handleFailResponseFromPeer(peerId);
    }
  }

  private handleSuccessResponseFromPeer(peerId: PeerId, response: BlockTxsResponse) {
    this.logger.debug(`Received txs: ${response.txs.length} from peer ${peerId.toString()} `);
    if (!this.isBlockResponseValid(response)) {
      return;
    }

    this.smartPeers.add(peerId.toString());

    this.markTxsPeerHas(peerId, response);
    this.handleReceivedTxs(peerId, response.txs);

    //TODO: maybe wait for at least couple of peers so that we don't spam single one?
    if (this.startSmartRequester !== undefined) {
      this.startSmartRequester();
      // We use "undefined" here as marker that startSmartRequester has been called
      this.startSmartRequester = undefined;
    }
  }

  private isBlockResponseValid(response: BlockTxsResponse): boolean {
    //TODO: maybe ban peer if this does not match?
    const blockIdsMatch = this.blockProposal.archive === response.blockHash;
    const peerHasSomeTxsFromProposal = !response.txIndices.isEmpty();
    return blockIdsMatch && peerHasSomeTxsFromProposal;
  }

  private handleReceivedTxs(peerId: PeerId, txs: TxArray) {
    //TODO: yield txs
    txs.forEach(tx => {
      this.txsMetadata.markFetched(peerId, tx);
    });
  }

  private markTxsPeerHas(peerId: PeerId, response: BlockTxsResponse) {
    const txsPeerHas = this.extractHashesPeerHasFromResponse(response);
    this.txsMetadata.markPeerHas(peerId, txsPeerHas);
  }

  //TODO: are we missing something here?
  // banning the peers?
  private handleFailResponseFromPeer(peerId: PeerId) {
    this.badPeers.add(peerId.toString());
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

  private makeRoundRobinIndexer(size: () => number, start = 0) {
    let i = start;
    return () => {
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

class MissingTxMetadata {
  constructor(
    public readonly txHash: TxHash,
    public fetched = false,
    public requestedTimes = 0,
    public tx: Tx | undefined = undefined,
    public readonly peers = new Set<string>(),
  ) {}

  public markAsRequested() {
    this.requestedTimes++;
  }

  public markAsFetched(peerId: PeerId, tx: Tx) {
    this.fetched = true;
    this.tx = tx;

    this.peers.add(peerId.toString());
  }

  public toString() {
    return this.txHash.toString();
  }
}

/*
 * Single source or truth for transactions we are fetching
 * This could be better optimized but given expected count of missing txs (N < 100)
 * At the moment there is no need for it. And benefit is that we have everything in single store*/
class MissingTxMetadataCollection extends Map<string, MissingTxMetadata> {
  public getSortedByRequestedTimesAsc(): MissingTxMetadata[] {
    return Array.from(this.values()).sort((a, b) => a.requestedTimes - b.requestedTimes);
  }

  public isFetched(txHash: TxHash): boolean {
    //If something went' wrong and we don't have txMeta for this hash
    // We should not request it, so here we "pretend" that it was fetched
    return this.get(txHash.toString())?.fetched ?? true;
  }

  public getFetchedTxHashes(): Set<TxHash> {
    return new Set(
      this.values()
        .filter(t => t.fetched)
        .map(t => t.txHash),
    );
  }

  public getFetchedTxs(): Tx[] {
    return Array.from(
      this.values()
        .map(t => t.tx)
        .filter(t => !!t),
    );
  }

  public getTxsPeerHas(peer: PeerId): Set<TxHash> {
    const peerIdStr = peer.toString();
    const txsPeerHas = new Set<TxHash>();

    this.values().forEach(txMeta => {
      if (txMeta.peers.has(peerIdStr)) {
        txsPeerHas.add(txMeta.txHash);
      }
    });

    return txsPeerHas;
  }

  //TODO: sort by least requested
  public getTxsToRequestFromThePeer(peer: PeerId): TxHash[] {
    const txsPeerHas = this.getTxsPeerHas(peer);
    const fetchedTxs = this.getFetchedTxHashes();

    return Array.from(txsPeerHas.difference(fetchedTxs));
  }

  public markRequested(txHash: TxHash) {
    this.get(txHash.toString())?.markAsRequested();
  }

  public markFetched(peerId: PeerId, tx: Tx) {
    const txHashStr = tx.txHash.toString();
    const txMeta = this.get(txHashStr);
    if (!txMeta) {
      //TODO: what to do about peer which sent txs we didn't request?
      // 1. don't request from it in the scope of this batch request
      // 2. ban it immediately?
      // 3. track it and ban it?
      //
      return;
    }

    txMeta.markAsFetched(peerId, tx);

    txMeta.fetched = true;
  }

  public markPeerHas(peerId: PeerId, txHash: TxHash[]) {
    const peerIdStr = peerId.toString();
    txHash
      .map(t => t.toString())
      .forEach(txh => {
        const txMeta = this.get(txh);
        if (txMeta) {
          txMeta.peers.add(peerIdStr);
        }
      });
  }
}
