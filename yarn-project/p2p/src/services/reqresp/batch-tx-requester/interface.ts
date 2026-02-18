import type { ISemaphore } from '@aztec/foundation/queue';
import type { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { ConnectionSampler } from '../connection-sampler/connection_sampler.js';
import type { ReqRespInterface } from '../interface.js';
import type { IPeerCollection } from './peer_collection.js';
import type { BatchRequestTxValidatorConfig, IBatchRequestTxValidator } from './tx_validator.js';

export interface IPeerPenalizer {
  penalizePeer(peerId: PeerId, penalty: PeerErrorSeverity): void;
}

export interface ITxMetadataCollection {
  getMissingTxHashes(): Set<string>;
  markFetched(peerId: PeerId, tx: Tx): boolean;
  getTxsToRequestFromThePeer(peer: PeerId): TxHash[];
  markRequested(txHash: TxHash): void;
  markInFlightBySmartPeer(txHash: TxHash): void;
  markNotInFlightBySmartPeer(txHash: TxHash): void;
  alreadyFetched(txHash: TxHash): boolean;
  // Returns true if tx was marked as fetched, false if it was already marked as fetched
  markPeerHas(peerId: PeerId, txHashes: TxHash[]): void;
}

/**
 * Interface for BatchTxRequester dependencies that can be injected from upstream
 */
export interface BatchTxRequesterLibP2PService {
  /** ReqResp interface for sending requests to peers */
  reqResp: Pick<ReqRespInterface, 'sendBatchRequest' | 'sendRequestToPeer'>;
  /** Connection sampler for getting peer lists */
  connectionSampler: Pick<ConnectionSampler, 'getPeerListSortedByConnectionCountAsc'>;
  /** Configuration needed for transaction validation */
  txValidatorConfig: BatchRequestTxValidatorConfig;
  /** Peer scoring for penalizing peers */
  peerScoring: IPeerPenalizer;
}

export interface BatchTxRequesterOptions {
  smartParallelWorkerCount?: number;
  dumbParallelWorkerCount?: number;
  txBatchSize?: number;
  badPeerThreshold?: number;
  //Injectable for testing purposes
  semaphore?: ISemaphore;
  peerCollection?: IPeerCollection;
  abortSignal?: AbortSignal;
  /** Optional tx validator for testing - if not provided, one is created from p2pService.txValidatorConfig */
  txValidator?: IBatchRequestTxValidator;
}
