import type { ISemaphore } from '@aztec/foundation/queue';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { MissingTxMetadata } from './missing_txs.js';
import type { IPeerCollection } from './peer_collection.js';

export interface ITxMetadataCollection {
  size: number;
  values(): IterableIterator<MissingTxMetadata>;
  getMissingTxHashes(): Set<string>;
  getTxsToRequestFromThePeer(peer: PeerId): TxHash[];
  markRequested(txHash: TxHash): void;
  markInFlightBySmartPeer(txHash: TxHash): void;
  markNotInFlightBySmartPeer(txHash: TxHash): void;
  alreadyFetched(txHash: TxHash): boolean;
  // Returns true if tx was marked as fetched, false if it was already marked as fetched
  markFetched(peerId: PeerId, tx: Tx): boolean;
  markPeerHas(peerId: PeerId, txHashes: TxHash[]): void;
  getFetchedTxs(): Tx[];
}

export interface BatchTxRequesterOptions {
  smartParallelWorkerCount: number;
  dumbParallelWorkerCount: number;
  //Injectable for testing purposes
  semaphore?: ISemaphore;
  peerCollection?: IPeerCollection;
  abortSignal?: AbortSignal;
}
