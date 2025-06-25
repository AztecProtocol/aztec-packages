import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { BlockAttestation, BlockProposal, Gossipable } from '@aztec/stdlib/p2p';
import type { Tx } from '@aztec/stdlib/tx';

import type { ENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import type EventEmitter from 'events';

import type {
  ReqRespSubProtocol,
  ReqRespSubProtocolHandler,
  ReqRespSubProtocolValidators,
  SubProtocolMap,
} from './reqresp/interface.js';
import type { AuthRequest, AuthResponse } from './reqresp/protocols/auth.js';

export enum PeerDiscoveryState {
  RUNNING = 'running',
  STOPPED = 'stopped',
}

export type P2PBlockReceivedCallback = (
  block: BlockProposal,
  sender: PeerId,
) => Promise<BlockAttestation[] | undefined>;

export type AuthReceivedCallback = (peerId: PeerId, authRequest: AuthRequest) => Promise<AuthResponse | undefined>;

/**
 * The interface for a P2P service implementation.
 */
export interface P2PService {
  /**
   * Starts the service.
   * @returns An empty promise.
   */
  start(): Promise<void>;

  /**
   * Stops the service.
   * @returns An empty promise.
   */
  stop(): Promise<void>;

  /**
   * Called to have the given transaction propagated through the P2P network.
   * @param message - The message to be propagated.
   */
  propagate<T extends Gossipable>(message: T): Promise<void>;

  /**
   * Request information from peers via the request response protocol.
   *
   * @param protocol - The request response protocol to use
   * @param request - The request type, corresponding to the protocol
   * @returns The response type, corresponding to the protocol
   */
  sendRequest<Protocol extends ReqRespSubProtocol>(
    protocol: Protocol,
    request: InstanceType<SubProtocolMap[Protocol]['request']>,
  ): Promise<InstanceType<SubProtocolMap[Protocol]['response']> | undefined>;

  /**
   * Send a batch of requests to peers, and return the responses
   *
   * @param protocol - The request response protocol to use
   * @param requests - The requests to send to the peers
   * @returns The responses to the requests
   */
  sendBatchRequest<Protocol extends ReqRespSubProtocol>(
    protocol: Protocol,
    requests: InstanceType<SubProtocolMap[Protocol]['request']>[],
    pinnedPeerId?: PeerId,
    timeoutMs?: number,
    maxPeers?: number,
    maxRetryAttempts?: number,
  ): Promise<(InstanceType<SubProtocolMap[Protocol]['response']> | undefined)[]>;

  // Leaky abstraction: fix https://github.com/AztecProtocol/aztec-packages/issues/7963
  registerBlockReceivedCallback(callback: P2PBlockReceivedCallback): void;

  getEnr(): ENR | undefined;

  getPeers(includePending?: boolean): PeerInfo[];

  validate(txs: Tx[]): Promise<void>;

  addReqRespSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void>;

  shouldTrustWithIdentity(peerId: PeerId): boolean;
}

/**
 * The interface for a peer discovery service implementation.
 */
export interface PeerDiscoveryService extends EventEmitter {
  /**
   * Starts the service.
   * */
  start(): Promise<void>;

  /**
   * Stops the service.
   * */
  stop(): Promise<void>;

  /**
   * Gets all KadValues.
   * @returns An array of ENRs.
   */
  getKadValues(): ENR[];

  /**
   * Runs findRandomNode query.
   */
  runRandomNodesQuery(): Promise<void>;

  /**
   * Checks if the given peer is a bootstrap peer.
   * @param peerId - The peer ID to check.
   * @returns True if the peer is a bootstrap peer.
   */
  isBootstrapPeer(peerId: PeerId): boolean;

  /**
   * Event emitted when a new peer is discovered.
   */
  on(event: 'peer:discovered', listener: (enr: ENR) => void): this;
  emit(event: 'peer:discovered', enr: ENR): boolean;

  getStatus(): PeerDiscoveryState;

  getEnr(): ENR | undefined;

  bootstrapNodeEnrs: ENR[];
}
