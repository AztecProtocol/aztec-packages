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
  goodbyeReceived(peerId: PeerId, reason: GoodByeReason): void;
  penalizePeer(peerId: PeerId, penalty: PeerErrorSeverity): void;
  handleAuthRequestFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage>;

  getPeerScore(peerId: string): number;
  stop(): Promise<void>;
}
