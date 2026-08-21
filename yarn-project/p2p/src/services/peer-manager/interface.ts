import type { EthAddress } from '@aztec/foundation/eth-address';
import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { PeerErrorSeverity } from '@aztec/stdlib/p2p';

import type { PeerId } from '@libp2p/interface';

import type { AuthRequest, StatusMessage } from '../reqresp/index.js';
import type { GoodByeReason } from '../reqresp/protocols/goodbye.js';

export interface PeerManagerInterface {
  getPeers(_includePending?: boolean): PeerInfo[];

  initializePeers(): Promise<void>;
  heartbeat(): Promise<void>;
  addTrustedPeer(peerId: PeerId): void;
  addPrivatePeer(peerId: PeerId): void;
  addPreferredPeer(peerId: PeerId): void;

  /**
   * Replaces the set of preferred peers with the ones encoded in the given ENRs, adding the new peers to the
   * gossipsub direct-peer set and dropping the ones no longer preferred.
   * @param enrs - The ENRs of the peers that should be preferred from now on.
   * @throws If any of the given ENRs is malformed or carries no TCP address; no state is mutated in that case.
   */
  updatePreferredPeers(enrs: string[]): Promise<void>;

  goodbyeReceived(peerId: PeerId, reason: GoodByeReason): void;
  penalizePeer(peerId: PeerId, penalty: PeerErrorSeverity): void;
  handleAuthRequestFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage>;

  getPeerScore(peerId: string): number;
  shouldDisableP2PGossip(peerId: string): boolean;

  stop(): Promise<void>;

  /** If node running this P2P stack is validator, passes in validator address to P2P layer */
  registerThisValidatorAddresses(address: EthAddress[]): void;
}
