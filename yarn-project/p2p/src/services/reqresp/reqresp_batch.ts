import { chunk } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { TxArray, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { ConnectionSampler } from './connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol } from './interface.js';
import { BlockTxsRequest, BlockTxsResponse } from './protocols/index.js';
import { ReqRespStatus } from './status.js';

const TX_BATCH_SIZE = 8;
const PEERS_TO_QUERY_IN_PARALLEL = 10;

class MissingTxMetadata {
  constructor(
    public readonly txHash: TxHash,
    public fetched = false,
    public inFlight = false,
    public requestedTimes = 0,
    public readonly peers = new Set<string>(),
  ) {}
}

export class BatchTxRequester {
  private readonly peers: PeerId[];
  private readonly smartPeers = new Set<string>();
  private readonly badPeers = new Set<string>();
  private readonly peersToTxMap = new Map<string, Array<TxHash>>();

  private readonly txsMetadata;

  private readonly deadline = Date.now() + this.timeoutMs;

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
    this.txsMetadata = new Map(this.missingTxs.map(txHash => [txHash.toString(), new MissingTxMetadata(txHash)]));
    this.peers = this.connectionSampler.getPeerListSortedByConnectionCountAsc();
    if (this.pinnedPeer) {
      this.smartPeers.add(this.pinnedPeer.toString());
    }
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
      //TODO: for this peer we have to make batch on the fly based on which txs peer has
      const txsPeerHas = this.peersToTxMap.get(pid.toString());
      const peerHasTxs = txsPeerHas && txsPeerHas.length > 0;
      if (!peerHasTxs) {
        return undefined;
      }

      //TODO: make this smarter, we should only request txs that we don't have
      // and we should request txs that have been requested the least times
      const txsToRequest = txsPeerHas.slice(0, TX_BATCH_SIZE);

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
    const nextBatchIndex = this.makeRoundRobinIndexer(() => txChunks.length);
    const getPeers = () => Array.from(peers.difference(this.smartPeers.union(this.badPeers)));

    const txChunks = chunk<TxHash>(this.missingTxs, TX_BATCH_SIZE);

    //TODO: batches should be adaptive
    const makeRequest = (_pid: PeerId) => {
      const idx = nextBatchIndex();
      return idx === undefined
        ? undefined
        : BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txChunks[idx]);
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
    for (const tx of txs) {
      const key = tx.txHash.toString();
      let txMeta = this.txsMetadata.get(key);
      if (txMeta) {
        txMeta.fetched = true;
        txMeta.peers.add(peerId.toString());
      } else {
        //TODO: what to do about peer which sent txs we didn't request?
        // 1. don't request from it in the scope of this batch request
        // 2. ban it immediately?
        // 3. track it and ban it?
        //
        // NOTE: don't break immediately peer still might have txs we need
      }
    }
  }

  private markTxsPeerHas(peerId: PeerId, response: BlockTxsResponse) {
    const peerIdStr = peerId.toString();
    const txsPeerHas = this.extractHashesPeerHasFromResponse(response);
    // NOTE: it's ok to override this and not make it union with previous data
    // because the newer request contains most up to date info
    this.peersToTxMap.set(peerIdStr, txsPeerHas);

    this.txsMetadata.values().forEach(txMeta => {
      txMeta.peers.add(peerIdStr);
    });
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

  //TODO: stop on:
  //1. abort signal
  //2. deadline
  //3. received all
  private shouldStop() {
    return this.txsMetadata.size === 0 || this.fetchedAllTxs() || Date.now() > this.deadline;
  }
}
