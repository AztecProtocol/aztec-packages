import { chunk } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import type { TxHash } from '@aztec/stdlib/tx';

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
  private readonly peersToTxMap = new Map<string, Array<TxHash>>();

  private readonly txsMetadata;

  private startSmartRequester: ((v: void) => void) | undefined = undefined;

  constructor(
    private readonly blockProposal: BlockProposal,
    private readonly missingTxs: TxHash[],
    private readonly pinnedPeer: PeerId | undefined,
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

    Promise.allSettled([this.smartRequester(promise), this.dumbRequester()]);
  }

  private async smartRequester(start: Promise<void>) {
    const nextPeerIndex = this.makeRoundRobinIndexer(() => this.smartPeers.size);
    // if we don't have a pinned peer we wait to start smart requester
    // otherwise we start immediately with the pinned peer
    if (!this.pinnedPeer) {
      await start;
    }

    const nextPeer = () => peerIdFromString(Array.from(this.smartPeers)[nextPeerIndex()]);
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

    // Kick off workers
    const workers = Array.from({ length: Math.min(PEERS_TO_QUERY_IN_PARALLEL, this.smartPeers.size) }, () =>
      this.workerLoop(nextPeer, makeRequest),
    );
    await Promise.allSettled(workers);
  }

  private async dumbRequester() {
    const nextPeerIndex = this.makeRoundRobinIndexer(() => peers.length);
    const nextBatchIndex = this.makeRoundRobinIndexer(() => txChunks.length);

    const peers = [...this.peers];
    const txChunks = chunk<TxHash>(this.missingTxs, TX_BATCH_SIZE);

    //TODO: batches should be adaptive
    const makeRequest = (_pid: PeerId) => {
      return BlockTxsRequest.fromBlockProposalAndMissingTxs(this.blockProposal, txChunks[nextBatchIndex()]);
    };

    const nextPeer = () => peers.filter(pid => !this.smartPeers.has(pid.toString()))[nextPeerIndex()];

    const workers = Array.from({ length: Math.min(PEERS_TO_QUERY_IN_PARALLEL, peers.length) }, () =>
      this.workerLoop(nextPeer, makeRequest),
    );
    await Promise.allSettled(workers);
  }

  private async workerLoop(pickNextPeer: () => PeerId, request: (pid: PeerId) => BlockTxsRequest | undefined) {
    while (!this.shouldStop()) {
      const peerId = pickNextPeer();
      //
      // TODO: think about this a bit more what should we do in this case?
      const nextBatchTxRequest = request(peerId);
      if (!nextBatchTxRequest) {
        this.logger.warn('No txs matched');
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

  //TODO: 1 mark missing transactions as fetched
  //TODO: 2 mark peer having this transactions
  //TODO: 3 stream responses either via async generator or callbacks
  private handleSuccessResponseFromPeer(peerId: PeerId, response: BlockTxsResponse) {
    this.logger.debug(`Received txs: ${response.txs.length} from peer ${peerId.toString()} `);
    if (!this.isBlockResponseValid(response)) {
      return;
    }

    //TODO: yield txs
    for (const tx of response.txs) {
      const key = tx.txHash.toString();
      let meta = this.txsMetadata.get(key);

      if (!meta) {
        meta = new MissingTxMetadata(tx.txHash, true);
        this.txsMetadata.set(key, meta);
      } else {
        meta.fetched = true; // mutate in place; no need to re-set
      }
    }

    const peerIdStr = peerId.toString();
    this.smartPeers.add(peerIdStr);
    const txsPeerHas = this.extractHashesPeerHasFromResponse(response);
    // NOTE: it's ok to override this and not make it union with previous data
    // because the newer request contains most up to date info
    this.peersToTxMap.set(peerIdStr, txsPeerHas);

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

  //TODO:
  private handleFailResponseFromPeer(peerId: PeerId) {}

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
      const current = i;
      i = (current + 1) % size();
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
    return this.fetchedAllTxs() || this.txsMetadata.size === 0;
  }
}
