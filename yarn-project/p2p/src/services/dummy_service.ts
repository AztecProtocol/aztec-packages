import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { Gossipable, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import type { ENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import EventEmitter from 'events';

import type { PeerManagerInterface } from './peer-manager/interface.js';
import type {
  ReqRespInterface,
  ReqRespResponse,
  ReqRespSubProtocol,
  ReqRespSubProtocolHandler,
  ReqRespSubProtocolHandlers,
  ReqRespSubProtocolValidators,
  SubProtocolMap,
} from './reqresp/interface.js';
import type { GoodByeReason } from './reqresp/protocols/goodbye.js';
import { ReqRespStatus } from './reqresp/status.js';
import {
  type P2PBlockReceivedCallback,
  type P2PService,
  type PeerDiscoveryService,
  PeerDiscoveryState,
} from './service.js';

/**
 * A dummy implementation of the P2P Service.
 */
export class DummyP2PService implements P2PService {
  /** Returns an empty array for peers. */
  getPeers(): PeerInfo[] {
    return [];
  }

  /**
   * Starts the dummy implementation.
   * @returns A resolved promise.
   */
  public start() {
    return Promise.resolve();
  }

  /**
   * Stops the dummy implementation.
   * @returns A resolved promise.
   */
  public stop() {
    return Promise.resolve();
  }

  /**
   * Called to have the given message propagated through the P2P network.
   * @param _ - The message to be propagated.
   */
  public propagate<T extends Gossipable>(_: T) {
    return Promise.resolve();
  }

  /**
   * Called upon receipt of settled transactions.
   * @param _ - The hashes of the settled transactions.
   */
  public settledTxs(_: TxHash[]) {}

  /**
   * Register a callback into the validator client for when a block proposal is received
   */
  public registerBlockReceivedCallback(_callback: P2PBlockReceivedCallback) {}

  /**
   * Sends a request to a peer.
   * @param _protocol - The protocol to send the request on.
   * @param _request - The request to send.
   * @returns The response from the peer, otherwise undefined.
   */
  public sendRequest<Protocol extends ReqRespSubProtocol>(
    _protocol: Protocol,
    _request: InstanceType<SubProtocolMap[Protocol]['request']>,
  ): Promise<InstanceType<SubProtocolMap[Protocol]['response']> | undefined> {
    return Promise.resolve(undefined);
  }

  /**
   * Sends a batch request to a peer.
   * @param _protocol - The protocol to send the request on.
   * @param _requests - The requests to send.
   * @returns The responses from the peer, otherwise undefined.
   */
  public sendBatchRequest<Protocol extends ReqRespSubProtocol>(
    _protocol: Protocol,
    _requests: InstanceType<SubProtocolMap[Protocol]['request']>[],
  ): Promise<InstanceType<SubProtocolMap[Protocol]['response']>[]> {
    return Promise.resolve([]);
  }

  /**
   * Returns the ENR of the peer.
   * @returns The ENR of the peer, otherwise undefined.
   */
  public getEnr(): undefined {
    return undefined;
  }

  validate(_txs: Tx[]): Promise<void> {
    return Promise.resolve();
  }

  addReqRespSubProtocol(
    _subProtocol: ReqRespSubProtocol,
    _handler: ReqRespSubProtocolHandler,
    _validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * A dummy implementation of the Peer Discovery Service.
 */
export class DummyPeerDiscoveryService extends EventEmitter implements PeerDiscoveryService {
  private currentState = PeerDiscoveryState.STOPPED;
  public bootstrapNodeEnrs: ENR[] = [];

  /**
   * Starts the dummy implementation.
   * @returns A resolved promise.
   */
  public start() {
    this.currentState = PeerDiscoveryState.RUNNING;
    return Promise.resolve();
  }
  /**
   * Stops the dummy implementation.
   * @returns A resolved promise.
   */
  public stop() {
    this.currentState = PeerDiscoveryState.STOPPED;
    return Promise.resolve();
  }
  /**
   * Called to discover peers in the network.
   * @returns An array of Enrs.
   */
  public getKadValues() {
    return [];
  }

  public runRandomNodesQuery(): Promise<void> {
    return Promise.resolve();
  }

  public isBootstrapPeer(_: PeerId): boolean {
    return false;
  }

  public getStatus(): PeerDiscoveryState {
    return this.currentState;
  }

  public getEnr(): undefined {
    return undefined;
  }
}

export class DummyPeerManager implements PeerManagerInterface {
  constructor(
    public peerId: PeerId,
    private peersProvider?: { getPeers: () => PeerId[] },
  ) {}

  public getPeers(_includePending?: boolean): PeerInfo[] {
    if (!this.peersProvider) {
      return [];
    }
    return this.peersProvider
      .getPeers()
      .filter(peer => !peer.equals(this.peerId))
      .map(id => ({
        id: id.toString(),
        status: 'connected',
        score: 0,
      }));
  }

  public initializePeers(): Promise<void> {
    return Promise.resolve();
  }
  public getPeerScore(_peerId: string): number {
    return 0;
  }
  public stop(): Promise<void> {
    return Promise.resolve();
  }
  public heartbeat(): void {}
  public addTrustedPeer(_peerId: PeerId): void {}
  public addPrivatePeer(_peerId: PeerId): void {}
  public goodbyeReceived(_peerId: PeerId, _reason: GoodByeReason): void {}
  public penalizePeer(_peerId: PeerId, _penalty: PeerErrorSeverity): void {}
  public addPreferredPeer(_peerId: PeerId): void {}
}

export class DummyReqResp implements ReqRespInterface {
  start(
    _subProtocolHandlers: ReqRespSubProtocolHandlers,
    _subProtocolValidators: ReqRespSubProtocolValidators,
  ): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
  sendRequest<SubProtocol extends ReqRespSubProtocol>(
    _subProtocol: SubProtocol,
    _request: InstanceType<SubProtocolMap[SubProtocol]['request']>,
  ): Promise<InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined> {
    return Promise.resolve(undefined);
  }
  sendBatchRequest<SubProtocol extends ReqRespSubProtocol>(
    _subProtocol: SubProtocol,
    _requests: InstanceType<SubProtocolMap[SubProtocol]['request']>[],
    _pinnedPeer: PeerId | undefined,
    _timeoutMs?: number,
    _maxPeers?: number,
    _maxRetryAttempts?: number,
  ): Promise<InstanceType<SubProtocolMap[SubProtocol]['response']>[]> {
    return Promise.resolve([]);
  }
  public sendRequestToPeer(
    _peerId: PeerId,
    _subProtocol: ReqRespSubProtocol,
    _payload: Buffer,
    _dialTimeout?: number,
  ): Promise<ReqRespResponse> {
    return Promise.resolve({ status: ReqRespStatus.SUCCESS, data: Buffer.from([]) });
  }

  addSubProtocol(
    _subProtocol: ReqRespSubProtocol,
    _handler: ReqRespSubProtocolHandler,
    _validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void> {
    return Promise.resolve();
  }
}
