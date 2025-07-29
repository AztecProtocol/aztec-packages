import { chunk } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { type Tx, type TxArray, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { ConnectionSampler } from './connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol } from './interface.js';
import { BlockTxsRequest, BlockTxsResponse } from './protocols/index.js';
import { ReqRespStatus } from './status.js';

const TX_BATCH_SIZE = 8;
const SMART_PEERS_TO_QUERY_IN_PARALLEL = 10;
const DUMB_PEERS_TO_QUERY_IN_PARALLEL = 10;

export class BatchTxRequester {
  private readonly peers: PeerId[];
  private readonly smartPeers = new Set<string>();
  private readonly badPeers = new Set<string>();

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
    this.peers = this.connectionSampler.getPeerListSortedByConnectionCountAsc();
    if (this.pinnedPeer) {
      this.smartPeers.add(this.pinnedPeer.toString());
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
    const nextPeerIndex = this.makeRoundRobinIndexer(() => getPeers().length);
    const getPeers = () => Array.from(this.smartPeers.difference(this.badPeers));

    const nextPeer = () => {
      const idx = nextPeerIndex();
      return idx === undefined ? undefined : peerIdFromString(getPeers()[idx]);
    };

    const makeRequest = (pid: PeerId) => {
      const txs = this.txsMetadata.getTxsToRequestFromThePeer(pid).slice(0, TX_BATCH_SIZE);

      txs.forEach(tx => {
        this.txsMetadata.markRequested(tx);
        this.txsMetadata.markInFlightBySmartPeer(tx);
      });

      return { blockRequest: BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txs), txs };
    };

    const workers = Array.from({ length: SMART_PEERS_TO_QUERY_IN_PARALLEL }, () =>
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
      chunk<string>(
        this.txsMetadata
          .getSortedByRequestedCountThenByInFlightCountAsc(Array.from(this.txsMetadata.getMissingTxHashes()))
          .map(t => t.txHash.toString()),
        TX_BATCH_SIZE,
      );

    const makeRequest = (_pid: PeerId) => {
      const idx = nextBatchIndex();
      if (idx === undefined) {
        return undefined;
      }

      const txs = txChunks()[idx].map(t => TxHash.fromString(t));
      txs.forEach(tx => this.txsMetadata.markRequested(tx));
      return { blockRequest: BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txs), txs };
    };

    const nextPeer = () => {
      const idx = nextPeerIndex();
      return idx === undefined ? undefined : peerIdFromString(Array.from(getPeers())[idx]);
    };

    const workers = Array.from({ length: Math.min(DUMB_PEERS_TO_QUERY_IN_PARALLEL, getPeers().length) }, () =>
      this.workerLoop(nextPeer, makeRequest, 'dumb'),
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

    while (!this.shouldStop()) {
      const peerId = pickNextPeer();
      const weRanOutOfPeersToQuery = peerId === undefined;
      if (weRanOutOfPeersToQuery) {
        this.logger.debug(`Worker loop: ${type}: No more peers to query`);
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
      const response = await this.reqresp.sendRequestToPeer(peerId, ReqRespSubProtocol.BLOCK_TXS, request.toBuffer());
      if (response.status !== ReqRespStatus.SUCCESS) {
        return;
      }

      const blockResponse = BlockTxsResponse.fromBuffer(response.data);
      this.handleSuccessResponseFromPeer(peerId, blockResponse);
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

    this.handleReceivedTxs(peerId, response.txs);

    // We mark peer as "smart" only if they have some txs we are missing
    // Otherwise we keep them as "dumb" in hope they'll receive some new txs we are missing in the future
    if (!this.peerHasSomeTxsWeAreMissing(peerId, response)) {
      return;
    }

    this.markTxsPeerHas(peerId, response);
    this.smartPeers.add(peerId.toString());

    if (this.smartPeers.size <= SMART_PEERS_TO_QUERY_IN_PARALLEL) {
      this.smartRequesterSemaphore.release();
    }
  }

  private isBlockResponseValid(response: BlockTxsResponse): boolean {
    //TODO: maybe ban peer if this does not match?
    const blockIdsMatch = this.blockProposal.archive === response.blockHash;
    const peerHasSomeTxsFromProposal = !response.txIndices.isEmpty();
    return blockIdsMatch && peerHasSomeTxsFromProposal;
  }

  private peerHasSomeTxsWeAreMissing(peerId: PeerId, response: BlockTxsResponse): boolean {
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
    public requestedCount = 0,
    public inFlightCount = 0,
    public tx: Tx | undefined = undefined,
    public readonly peers = new Set<string>(),
  ) {}

  public markAsRequested() {
    this.requestedCount++;
  }

  public markInFlight() {
    this.inFlightCount++;
  }

  public markNotInFlight() {
    this.inFlightCount = Math.max(--this.inFlightCount, 0);
  }

  public isInFlight(): boolean {
    return this.inFlightCount > 0;
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
  public getSortedByRequestedCountAsc(txs: string[]): MissingTxMetadata[] {
    return Array.from(this.values().filter(txMeta => txs.includes(txMeta.txHash.toString()))).sort(
      (a, b) => a.requestedCount - b.requestedCount,
    );
  }

  public getSortedByRequestedCountThenByInFlightCountAsc(txs: string[]): MissingTxMetadata[] {
    const filtered = Array.from(this.values()).filter(txMeta => txs.includes(txMeta.txHash.toString()));

    const [notInFlight, inFlight] = filtered.reduce<[MissingTxMetadata[], MissingTxMetadata[]]>(
      (buckets, tx) => {
        tx.isInFlight() ? buckets[1].push(tx) : buckets[0].push(tx);
        return buckets;
      },
      [[], []],
    );

    notInFlight.sort((a, b) => a.requestedCount - b.requestedCount);
    inFlight.sort((a, b) => a.inFlightCount - b.inFlightCount);

    return [...notInFlight, ...inFlight];
  }

  public isFetched(txHash: TxHash): boolean {
    //If something went' wrong and we don't have txMeta for this hash
    // We should not request it, so here we "pretend" that it was fetched
    return this.get(txHash.toString())?.fetched ?? true;
  }

  public getFetchedTxHashes(): Set<string> {
    return new Set(
      this.values()
        .filter(t => t.fetched)
        .map(t => t.txHash.toString()),
    );
  }

  public getMissingTxHashes(): Set<string> {
    return new Set(
      this.values()
        .filter(t => !t.fetched)
        .map(t => t.txHash.toString()),
    );
  }

  public getInFlightTxHashes(): Set<string> {
    return new Set(
      this.values()
        .filter(t => t.isInFlight())
        .map(t => t.txHash.toString()),
    );
  }

  public getFetchedTxs(): Tx[] {
    return Array.from(
      this.values()
        .map(t => t.tx)
        .filter(t => !!t),
    );
  }

  public getTxsPeerHas(peer: PeerId): Set<string> {
    const peerIdStr = peer.toString();
    const txsPeerHas = new Set<string>();

    this.values().forEach(txMeta => {
      if (txMeta.peers.has(peerIdStr)) {
        txsPeerHas.add(txMeta.txHash.toString());
      }
    });

    return txsPeerHas;
  }

  public getTxsToRequestFromThePeer(peer: PeerId): TxHash[] {
    const txsPeerHas = this.getTxsPeerHas(peer);
    const fetchedTxs = this.getFetchedTxHashes();

    const txsToRequest = txsPeerHas.difference(fetchedTxs);
    if (txsToRequest.size >= TX_BATCH_SIZE) {
      return this.getSortedByRequestedCountThenByInFlightCountAsc(Array.from(txsToRequest)).map(t => t.txHash);
    }

    // Otherwise fill the txs to request till TX_BATCH_SIZE with random txs we are missing
    // Who knows, maybe we get lucky and peer received these txs in the meantime

    const countToFill = TX_BATCH_SIZE - txsToRequest.size;
    const txsToFill = this.getSortedByRequestedCountThenByInFlightCountAsc(
      Array.from(this.getMissingTxHashes().difference(txsToRequest)),
    )
      .slice(0, countToFill)
      .map(t => t.txHash);

    return [...Array.from(txsToRequest).map(t => TxHash.fromString(t)), ...txsToFill];
  }

  public markRequested(txHash: TxHash) {
    this.get(txHash.toString())?.markAsRequested();
  }

  /*
   * This should be called only when requesting tx from smart peer
   * Because the smart peer should return this tx, whereas
   * "dumb" peer might return it, or might not - we don't know*/
  public markInFlightBySmartPeer(txHash: TxHash) {
    this.get(txHash.toString())?.markInFlight();
  }

  /*
   * This should be called only when requesting tx from smart peer
   * Because the smart peer should return this tx, whereas
   * "dumb" peer might return it, or might not - we don't know*/
  public markNotInFlightBySmartPeer(txHash: TxHash) {
    this.get(txHash.toString())?.markNotInFlight();
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
