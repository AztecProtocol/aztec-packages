import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { P2PConnectivity, PeerInfo } from '@aztec/stdlib/interfaces/server';
import type {
  CheckpointAttestation,
  Gossipable,
  TopicType,
  ValidatedBlockProposal,
  ValidatedCheckpointProposalCore,
} from '@aztec/stdlib/p2p';
import type { Tx } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import type { ENR } from '@nethermindeth/enr';
import type EventEmitter from 'events';

import type { BatchTxRequesterLibP2PService } from './reqresp/batch-tx-requester/interface.js';
import type { P2PReqRespConfig } from './reqresp/config.js';
import type { StatusMessage } from './reqresp/index.js';
import type { ReqRespSubProtocol, ReqRespSubProtocolHandler } from './reqresp/interface.js';
import type { AuthRequest, AuthResponse } from './reqresp/protocols/auth.js';

export enum PeerDiscoveryState {
  RUNNING = 'running',
  STOPPED = 'stopped',
}

/**
 * Callback for when a block proposal is received.
 * Validators validate but DO NOT attest to individual blocks - attestations are only for checkpoints.
 * The proposal is passed as a ValidatedBlockProposal: it has already passed p2p ingress validation, and
 * consumers are not expected to repeat it.
 * @returns true if the proposal is valid, false otherwise
 */
export type P2PBlockReceivedCallback = (block: ValidatedBlockProposal, sender: PeerId) => Promise<boolean>;

/**
 * Callback for when a checkpoint proposal is received.
 * The checkpoint proposal is passed as ValidatedCheckpointProposalCore (without lastBlock) since
 * the lastBlock is extracted and stored separately as a BlockProposal, and the block
 * callback is invoked and awaited before this checkpoint callback. As with block proposals, it has already
 * passed p2p ingress validation.
 */
export type P2PCheckpointReceivedCallback = (
  checkpoint: ValidatedCheckpointProposalCore,
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

/** Minimal info passed to the oversized proposal callback. */
export type OversizedProposalInfo = {
  slot: SlotNumber;
  proposer: EthAddress;
};

/**
 * Callback for when a block proposal whose index lands at or beyond the consensus per-checkpoint block
 * limit is stored and re-broadcast as slashing evidence. May fire multiple times per (slot, proposer)
 * if the proposer signed several oversized proposals; consumers are expected to dedup.
 */
export type P2POversizedProposalCallback = (info: OversizedProposalInfo) => void;

/** Minimal info passed to the duplicate attestation callback. */
export type DuplicateAttestationInfo = {
  slot: SlotNumber;
  attester: EthAddress;
};

/**
 * Callback for when a duplicate attestation is detected (equivocation).
 * A validator signing attestations for different proposals at the same slot.
 * Invoked on the first duplicate (when count goes from 1 to 2).
 */
export type P2PDuplicateAttestationCallback = (info: DuplicateAttestationInfo) => void;

export type P2PCheckpointAttestationCallback = (attestation: CheckpointAttestation) => void;

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

  // Leaky abstraction: fix https://github.com/AztecProtocol/aztec-packages/issues/7963
  registerBlockReceivedCallback(callback: P2PBlockReceivedCallback): void;

  registerValidatorCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback): void;

  registerAllNodesCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback): void;

  /**
   * Registers a callback invoked when a duplicate proposal is detected (equivocation).
   * The callback is triggered on the first duplicate (when count goes from 1 to 2).
   */
  registerDuplicateProposalCallback(callback: P2PDuplicateProposalCallback): void;

  /**
   * Registers a callback invoked when an oversized block proposal (index at or beyond the consensus
   * per-checkpoint block limit) is stored and re-broadcast as slashing evidence.
   */
  registerOversizedProposalCallback(callback: P2POversizedProposalCallback): void;

  /**
   * Registers a callback invoked when a duplicate attestation is detected (equivocation).
   * A validator signing attestations for different proposals at the same slot.
   * The callback is triggered on the first duplicate (when count goes from 1 to 2).
   */
  registerDuplicateAttestationCallback(callback: P2PDuplicateAttestationCallback): void;

  registerCheckpointAttestationCallback(callback: P2PCheckpointAttestationCallback): void;

  getEnr(): ENR | undefined;

  getPeers(includePending?: boolean): PeerInfo[];

  /**
   * Returns whether this p2p service is a real p2p stack, and how many peers it is currently connected to.
   * Implementations that do not run p2p at all report `enabled: false`.
   */
  getP2PConnectivity(): P2PConnectivity;

  /** Returns the number of peers in the GossipSub mesh for a given topic type. */
  getGossipMeshPeerCount(topicType: TopicType): number;

  /**
   * Runs minimum integrity validation on txs carried in a block proposal.
   * @throws InvalidBlockProposalTxsError - If any tx fails validation.
   */
  validateTxsReceivedInBlockProposal(txs: Tx[]): Promise<void>;

  addReqRespSubProtocol(subProtocol: ReqRespSubProtocol, handler: ReqRespSubProtocolHandler): Promise<void>;

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

  on(event: 'ip:changed', listener: (ip: string) => void): this;
  emit(event: 'ip:changed', ip: string): boolean;

  getStatus(): PeerDiscoveryState;

  getEnr(): ENR | undefined;

  bootstrapNodeEnrs: ENR[];
}
