import { Semaphore as RealSemaphore } from '@aztec/foundation/queue';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { MissingTxMetadata } from './missing_txs.js';

export interface ITxMetadataCollection {
  size: number;
  values(): IterableIterator<MissingTxMetadata>;
  getMissingTxHashes(): Set<string>;
  getTxsToRequestFromThePeer(peer: PeerId): TxHash[];
  markRequested(txHash: TxHash): void;
  markInFlightBySmartPeer(txHash: TxHash): void;
  markNotInFlightBySmartPeer(txHash: TxHash): void;
  markFetched(peerId: PeerId, tx: Tx): void;
  markPeerHas(peerId: PeerId, txHashes: TxHash[]): void;
  getFetchedTxs(): Tx[];
}

export type TxsMetadataFactory = (entries: Array<[string, MissingTxMetadata]>) => ITxMetadataCollection;

export interface BatchTxRequesterOptions {
  smartParallel: number;
  dumbParallel: number;
  txsMetadataFactory?: TxsMetadataFactory;
}
