import { type Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import { DEFAULT_BATCH_TX_REQUESTER_TX_BATCH_SIZE } from './config.js';
import type { IMissingTxsTracker, ITxMetadataCollection } from './interface.js';

export class MissingTxsTracker implements IMissingTxsTracker {
  constructor(public readonly missingTxHashes: Set<string>) {}

  markFetched(tx: Tx): boolean {
    return this.missingTxHashes.delete(tx.txHash.toString());
  }

  get numberOfMissingTxs(): number {
    return this.missingTxHashes.size;
  }

  isMissing(txHash: string): boolean {
    return this.missingTxHashes.has(txHash.toString());
  }
}

class MissingTxMetadata {
  constructor(
    public readonly txHash: string,
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

  //Returns true if this is the first time we mark it as fetched
  public markAsFetched(peerId: PeerId, tx: Tx): boolean {
    if (this.fetched) {
      return false;
    }

    this.fetched = true;
    this.tx = tx;

    this.peers.add(peerId.toString());

    return true;
  }
}

/*
 * Single source or truth for transactions we are fetching
 * This could be better optimized but given expected count of missing txs (N < 100)
 * At the moment there is no need for it. And benefit is that we have everything in single store
 * */
export class MissingTxMetadataCollection implements ITxMetadataCollection {
  private txMetadata = new Map<string, MissingTxMetadata>();

  constructor(
    private missingTxsTracker: IMissingTxsTracker,
    private readonly txBatchSize: number = DEFAULT_BATCH_TX_REQUESTER_TX_BATCH_SIZE,
  ) {
    missingTxsTracker.missingTxHashes.forEach(hash => this.txMetadata.set(hash, new MissingTxMetadata(hash)));
  }

  public getPrioritizingNotInFlightAndLowerRequestCount(txs: string[]): MissingTxMetadata[] {
    const filtered = Array.from(this.txMetadata.values()).filter(txMeta => txs.includes(txMeta.txHash.toString()));

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

  public getMissingTxHashes(): Set<string> {
    return this.missingTxsTracker.missingTxHashes;
  }

  public getTxsPeerHas(peer: PeerId): Set<string> {
    const peerIdStr = peer.toString();
    const txsPeerHas = new Set<string>();

    this.txMetadata.values().forEach(txMeta => {
      if (txMeta.peers.has(peerIdStr)) {
        txsPeerHas.add(txMeta.txHash.toString());
      }
    });

    return txsPeerHas;
  }

  public getTxsToRequestFromThePeer(peer: PeerId): TxHash[] {
    const txsPeerHas = this.getTxsPeerHas(peer);
    const missingTxHashes = this.getMissingTxHashes();

    const txsToRequest = txsPeerHas.intersection(missingTxHashes);

    if (txsToRequest.size >= this.txBatchSize) {
      return this.getPrioritizingNotInFlightAndLowerRequestCount(Array.from(txsToRequest))
        .map(t => TxHash.fromString(t.txHash))
        .slice(0, this.txBatchSize);
    }

    // Otherwise fill the txs to request till txBatchSize with random txs we are missing
    // Who knows, maybe we get lucky and peer received these txs in the meantime

    const countToFill = this.txBatchSize - txsToRequest.size;
    const txsToFill = this.getPrioritizingNotInFlightAndLowerRequestCount(
      Array.from(this.getMissingTxHashes().difference(txsToRequest)),
    )
      .slice(0, countToFill)
      .map(t => TxHash.fromString(t.txHash));

    return [...Array.from(txsToRequest).map(t => TxHash.fromString(t)), ...txsToFill];
  }

  public markRequested(txHash: TxHash) {
    this.txMetadata.get(txHash.toString())?.markAsRequested();
  }

  /*
   * This should be called only when requesting tx from smart peer
   * Because the smart peer should return this tx, whereas
   * "dumb" peer might return it, or might not - we don't know
   * */
  public markInFlightBySmartPeer(txHash: TxHash) {
    this.txMetadata.get(txHash.toString())?.markInFlight();
  }

  /*
   * This should be called only when requesting tx from smart peer
   * Because the smart peer should return this tx, whereas
   * "dumb" peer might return it, or might not - we don't know*/
  public markNotInFlightBySmartPeer(txHash: TxHash) {
    this.txMetadata.get(txHash.toString())?.markNotInFlight();
  }

  public alreadyFetched(txHash: TxHash): boolean {
    return this.txMetadata.get(txHash.toString())?.fetched ?? false;
  }

  public markFetched(peerId: PeerId, tx: Tx): boolean {
    const txHashStr = tx.txHash.toString();
    const txMeta = this.txMetadata.get(txHashStr);
    if (!txMeta) {
      //TODO: what to do about peer which sent txs we didn't request?
      // 1. don't request from it in the scope of this batch request
      // 2. ban it immediately?
      // 3. track it and ban it?
      //
      return false;
    }

    this.missingTxsTracker.markFetched(tx);
    return txMeta.markAsFetched(peerId, tx);
  }

  public markPeerHas(peerId: PeerId, txHash: TxHash[]) {
    const peerIdStr = peerId.toString();
    txHash
      .map(t => t.toString())
      .forEach(txh => {
        const txMeta = this.txMetadata.get(txh);
        if (txMeta) {
          txMeta.peers.add(peerIdStr);
        }
      });
  }
}
