import type { DateProvider } from '@aztec/foundation/timer';

import type { PeerId } from '@libp2p/interface';

export const BAD_PEER_THRESHOLD = 3;
export const RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL = 1000; // 1s

export interface IPeerCollection {
  getAllPeers(): Set<string>;
  getSmartPeers(): Set<string>;
  markPeerSmart(peerId: PeerId): void;
  getSmartPeersToQuery(): Array<string>;
  getDumbPeersToQuery(): Array<string>;
  thereAreSomeDumbRatelimitExceededPeers(): boolean;
  markPeerAsBad(peerId: PeerId): void;
  unMarkPeerAsBad(peerId: PeerId): void;
  getBadPeers(): Set<string>;
  markPeerInFlight(peerId: PeerId): void;
  unMarkPeerInFlight(peerId: PeerId): void;
  markPeerRateLimitExceeded(peerId: PeerId): void;
  getRateLimitExceededPeers(): Set<string>;
}

export class PeerCollection implements IPeerCollection {
  private readonly peers;

  private readonly smartPeers = new Set<string>();
  private readonly inFlightPeers = new Set<string>();
  private readonly rateLimitExceededPeers = new Map<string, number>();
  private readonly badPeers = new Map<string, number>();

  constructor(
    initialPeers: PeerId[],
    private readonly pinnedPeerId: PeerId | undefined,
    private readonly dateProvider: DateProvider,
  ) {
    this.peers = new Set(initialPeers.map(peer => peer.toString()));

    // Pinned peer is treaded specially, always mark it as in-flight
    // and never return it as part of smart/dumb peers
    if (this.pinnedPeerId) {
      const peerIdStr = this.pinnedPeerId.toString();
      this.inFlightPeers.add(peerIdStr);
      this.peers.delete(peerIdStr);
    }
  }

  public getAllPeers(): Set<string> {
    return this.peers;
  }

  public getSmartPeers(): Set<string> {
    return this.smartPeers;
  }

  public markPeerSmart(peerId: PeerId): void {
    this.smartPeers.add(peerId.toString());
  }

  public getSmartPeersToQuery(): Array<string> {
    return Array.from(
      this.smartPeers.difference(this.getBadPeers().union(this.inFlightPeers).union(this.getRateLimitExceededPeers())),
    );
  }

  public getDumbPeersToQuery(): Array<string> {
    return Array.from(
      this.peers.difference(
        this.smartPeers.union(this.getBadPeers()).union(this.inFlightPeers).union(this.getRateLimitExceededPeers()),
      ),
    );
  }

  public thereAreSomeDumbRatelimitExceededPeers(): boolean {
    return (
      this.getRateLimitExceededPeers().difference(this.smartPeers.union(this.badPeers).union(this.inFlightPeers)).size >
      0
    );
  }

  public markPeerInFlight(peerId: PeerId) {
    this.inFlightPeers.add(peerId.toString());
  }

  public unMarkPeerInFlight(peerId: PeerId) {
    // Never unmark the pinned peer as in-flight
    if (this.pinnedPeerId && this.pinnedPeerId.toString() === peerId.toString()) {
      return;
    }
    this.inFlightPeers.delete(peerId.toString());
  }

  public markPeerRateLimitExceeded(peerId: PeerId) {
    const ttl = this.dateProvider.now() + RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL;
    this.rateLimitExceededPeers.set(peerId.toString(), ttl);
  }

  public getRateLimitExceededPeers(): Set<string> {
    const now = this.dateProvider.now();
    const rateLimitedPeers = new Set<string>();

    for (const [peerId, expirationTime] of this.rateLimitExceededPeers) {
      if (expirationTime < now) {
        this.rateLimitExceededPeers.delete(peerId);
      } else {
        rateLimitedPeers.add(peerId);
      }
    }

    return rateLimitedPeers;
  }

  public markPeerAsBad(peerId: PeerId) {
    this.badPeers.set(peerId.toString(), (this.badPeers.get(peerId.toString()) ?? 0) + 1);
  }

  public unMarkPeerAsBad(peerId: PeerId) {
    this.badPeers.delete(peerId.toString());
  }

  public getBadPeers(): Set<string> {
    return new Set(
      this.badPeers
        .entries()
        .filter(([_k, v]) => v > BAD_PEER_THRESHOLD)
        .map(([k]) => k),
    );
  }
}
