import { type Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

export const TX_BATCH_SIZE = 8;

export class MissingTxMetadata {
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
 * At the moment there is no need for it. And benefit is that we have everything in single store
 * */
export class MissingTxMetadataCollection extends Map<string, MissingTxMetadata> {
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
    // If something went wrong and we don't have txMeta for this hash
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
