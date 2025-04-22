import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { BlockAttestation, BlockProposal, Gossipable } from '@aztec/stdlib/p2p';
import { TxHash } from '@aztec/stdlib/tx';

import type { ENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import EventEmitter from 'events';

import type { ReqRespSubProtocol, SubProtocolMap } from './reqresp/interface.js';
import { type P2PService, type PeerDiscoveryService, PeerDiscoveryState } from './service.js';

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
  public propagate<T extends Gossipable>(_: T) {}

  /**
   * Called upon receipt of settled transactions.
   * @param _ - The hashes of the settled transactions.
   */
  public settledTxs(_: TxHash[]) {}

  /**
   * Register a callback into the validator client for when a block proposal is received
   */
  public registerBlockReceivedCallback(_: (block: BlockProposal) => Promise<BlockAttestation>) {}

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
