import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal, CheckpointAttestation, CheckpointProposalCore, Gossipable } from '@aztec/stdlib/p2p';
import type { Tx } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import type { ENR } from '@nethermindeth/enr';
import type EventEmitter from 'events';

import type { BatchTxRequesterLibP2PService } from './reqresp/batch-tx-requester/interface.js';
import type { P2PReqRespConfig } from './reqresp/config.js';
import type { StatusMessage } from './reqresp/index.js';
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

/**
 * Callback for when a block proposal is received.
 * Validators validate but DO NOT attest to individual blocks - attestations are only for checkpoints.
 * @returns true if the proposal is valid, false otherwise
 */
export type P2PBlockReceivedCallback = (block: BlockProposal, sender: PeerId) => Promise<boolean>;

/**
 * Callback for when a checkpoint proposal is received.
 * The checkpoint proposal is passed as CheckpointProposalCore (without lastBlock) since
 * the lastBlock is extracted and stored separately as a BlockProposal, and the block
 * callback is invoked and awaited before this checkpoint callback.
 */
export type P2PCheckpointReceivedCallback = (
  checkpoint: CheckpointProposalCore,
  sender: PeerId,
) => Promise<CheckpointAttestation[] | undefined>;

export type AuthReceivedCallback = (peerId: PeerId, authRequest: AuthRequest) => Promise<AuthResponse | undefined>;

/** Minimal info passed to the duplicate proposal callback. */
export type DuplicateProposalInfo = {
  slot: SlotNumber;
  proposer: EthAddress;
  type: 'checkpoint' | 'block';
};

/**
 * Callback for when a duplicate proposal is detected (equivocation).
 * Invoked on the first duplicate (when count goes from 1 to 2).
 */
export type P2PDuplicateProposalCallback = (info: DuplicateProposalInfo) => void;

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
  ): Promise<InstanceType<SubProtocolMap[Protocol]['response']>[]>;

  // Leaky abstraction: fix https://github.com/AztecProtocol/aztec-packages/issues/7963
  registerBlockReceivedCallback(callback: P2PBlockReceivedCallback): void;

  registerCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback): void;

  /**
   * Registers a callback invoked when a duplicate proposal is detected (equivocation).
   * The callback is triggered on the first duplicate (when count goes from 1 to 2).
   */
  registerDuplicateProposalCallback(callback: P2PDuplicateProposalCallback): void;

  getEnr(): ENR | undefined;

  getPeers(includePending?: boolean): PeerInfo[];

  validate(txs: Tx[]): Promise<void>;

  addReqRespSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void>;

  handleAuthRequestFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage>;

  updateConfig(config: Partial<P2PReqRespConfig>): void;

  /** If node running this P2P stack is validator, passes in validator address to P2P layer */
  registerThisValidatorAddresses(address: EthAddress[]): void;

  /** Get BatchTxRequester service dependencies */
  getBatchTxRequesterService(): BatchTxRequesterLibP2PService;
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
