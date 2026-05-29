import type { EthAddress } from '@aztec/foundation/eth-address';
import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { CheckpointProposalCore, Gossipable, PeerErrorSeverity, TopicType } from '@aztec/stdlib/p2p';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import type { ENR } from '@nethermindeth/enr';
import EventEmitter from 'events';

import type { PeerManagerInterface } from './peer-manager/interface.js';
import type { BatchTxRequesterLibP2PService } from './reqresp/batch-tx-requester/interface.js';
import type { P2PReqRespConfig } from './reqresp/config.js';
import type { ConnectionSampler } from './reqresp/connection-sampler/connection_sampler.js';
import { type AuthRequest, StatusMessage } from './reqresp/index.js';
import type {
  ReqRespInterface,
  ReqRespResponse,
  ReqRespSubProtocol,
  ReqRespSubProtocolHandler,
  ReqRespSubProtocolHandlers,
  SubProtocolMap,
} from './reqresp/interface.js';
import type { GoodByeReason } from './reqresp/protocols/goodbye.js';
import { ReqRespStatus } from './reqresp/status.js';
import {
  type P2PBlockReceivedCallback,
  type P2PCheckpointAttestationCallback,
  type P2PCheckpointReceivedCallback,
  type P2PDuplicateAttestationCallback,
  type P2PDuplicateProposalCallback,
  type P2PService,
  type PeerDiscoveryService,
  PeerDiscoveryState,
} from './service.js';

/**
 * A dummy implementation of the P2P Service.
 */
export class DummyP2PService implements P2PService {
  private allNodesCheckpointReceivedCallback?: P2PCheckpointReceivedCallback;

  updateConfig(_config: Partial<P2PReqRespConfig>): void {}

  /** Returns an empty array for peers. */
  getPeers(): PeerInfo[] {
    return [];
  }

  getGossipMeshPeerCount(_topicType: TopicType): number {
    return 0;
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
   * Register a callback into the validator client for when a checkpoint proposal is received
   */
  public registerValidatorCheckpointReceivedCallback(_callback: P2PCheckpointReceivedCallback) {}
  public registerAllNodesCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback) {
    this.allNodesCheckpointReceivedCallback = callback;
  }

  // Mirror libp2p's own-proposal loopback so the proposer's pipelined `canProposeAt` override sees its own
  // in-flight parent checkpoint when running in p2p-disabled (single-node e2e) mode.
  public async notifyOwnCheckpointProposal(checkpoint: CheckpointProposalCore): Promise<void> {
    await this.allNodesCheckpointReceivedCallback?.(checkpoint, undefined as unknown as PeerId);
  }

  /**
   * Register a callback for when a duplicate proposal is detected
   */
  public registerDuplicateProposalCallback(_callback: P2PDuplicateProposalCallback): void {}

  /**
   * Register a callback for when a duplicate attestation is detected
   */
  public registerDuplicateAttestationCallback(_callback: P2PDuplicateAttestationCallback): void {}

  public registerCheckpointAttestationCallback(_callback: P2PCheckpointAttestationCallback): void {}

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

  public sendRequestToPeer(
    _peerId: PeerId,
    _subProtocol: ReqRespSubProtocol,
    _payload: Buffer,
    _dialTimeout?: number,
  ): Promise<ReqRespResponse> {
    return Promise.resolve({ status: ReqRespStatus.SUCCESS, data: Buffer.from([]) });
  }

  /**
   * Returns the ENR of the peer.
   * @returns The ENR of the peer, otherwise undefined.
   */
  public getEnr(): undefined {
    return undefined;
  }

  validateTxsReceivedInBlockProposal(_txs: Tx[]): Promise<void> {
    return Promise.resolve();
  }

  addReqRespSubProtocol(_subProtocol: ReqRespSubProtocol, _handler: ReqRespSubProtocolHandler): Promise<void> {
    return Promise.resolve();
  }

  handleAuthRequestFromPeer(_authRequest: AuthRequest, _peerId: PeerId): Promise<StatusMessage> {
    return Promise.resolve(StatusMessage.random());
  }

  //this is no-op
  registerThisValidatorAddresses(_address: EthAddress[]): void {}

  /**
   * Get dummy BatchTxRequesterLibP2PService for testing
   */
  getBatchTxRequesterService(): BatchTxRequesterLibP2PService {
    return {
      reqResp: this, // The dummy service implements ReqRespInterface
      connectionSampler: new DummyReqResp().getConnectionSampler(),
      txValidatorConfig: {
        l1ChainId: 1,
        rollupVersion: 1,
        proofVerifier: {
          verifyProof: () => Promise.resolve({ valid: true, durationMs: 0, totalDurationMs: 0 }),
          stop: () => Promise.resolve(),
        },
      },
      peerScoring: {
        penalizePeer: (_peerId, _penalty) => {},
      },
      validateRequestedBlockTxsConsistency: () => Promise.resolve(true),
    };
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

  public shouldDisableP2PGossip(_peerId: string): boolean {
    return false;
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }
  public heartbeat(): Promise<void> {
    return Promise.resolve();
  }
  public addTrustedPeer(_peerId: PeerId): void {}
  public addPrivatePeer(_peerId: PeerId): void {}
  public goodbyeReceived(_peerId: PeerId, _reason: GoodByeReason): void {}
  public penalizePeer(_peerId: PeerId, _penalty: PeerErrorSeverity): void {}
  public addPreferredPeer(_peerId: PeerId): void {}
  public handleAuthRequestFromPeer(_authRequest: AuthRequest, _peerId: PeerId): Promise<StatusMessage> {
    return Promise.resolve(StatusMessage.random());
  }

  //this is no-op
  registerThisValidatorAddresses(_address: EthAddress[]): void {}
}

export class DummyReqResp implements ReqRespInterface {
  updateConfig(_config: Partial<P2PReqRespConfig>): void {}
  setShouldRejectPeer(): void {}
  start(_subProtocolHandlers: ReqRespSubProtocolHandlers): Promise<void> {
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
  public sendRequestToPeer(
    _peerId: PeerId,
    _subProtocol: ReqRespSubProtocol,
    _payload: Buffer,
    _dialTimeout?: number,
  ): Promise<ReqRespResponse> {
    return Promise.resolve({ status: ReqRespStatus.SUCCESS, data: Buffer.from([]) });
  }

  /**
   * Get dummy connection sampler for testing
   */
  getConnectionSampler(): Pick<ConnectionSampler, 'getPeerListSortedByConnectionCountAsc'> {
    return {
      getPeerListSortedByConnectionCountAsc: () => [],
    };
  }

  addSubProtocol(_subProtocol: ReqRespSubProtocol, _handler: ReqRespSubProtocolHandler): Promise<void> {
    return Promise.resolve();
  }
}
