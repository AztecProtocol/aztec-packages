import type { DateProvider } from '@aztec/foundation/timer';
import type { PeerErrorSeverity } from '@aztec/stdlib/p2p';

import type { PeerId } from '@libp2p/interface';

import { DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD } from './config.js';
import type { IPeerPenalizer } from './interface.js';

export const RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL = 1000; // 1s

export interface IPeerCollection {
  getAllPeers(): Set<string>;
  getSmartPeers(): Set<string>;
  markPeerSmart(peerId: PeerId): void;
  getSmartPeersToQuery(): Array<string>;
  getDumbPeersToQuery(): Array<string>;
  thereAreSomeDumbRatelimitExceededPeers(): boolean;
  penalisePeer(peerId: PeerId, severity: PeerErrorSeverity): void;
  unMarkPeerAsBad(peerId: PeerId): void;
  getBadPeers(): Set<string>;
  markPeerInFlight(peerId: PeerId): void;
  unMarkPeerInFlight(peerId: PeerId): void;
  markPeerRateLimitExceeded(peerId: PeerId): void;
  getRateLimitExceededPeers(): Set<string>;
  getPeerRateLimitDelayMs(peerId: PeerId): number | undefined;
  getNextDumbPeerAvailabilityDelayMs(): number | undefined;
  getNextSmartPeerAvailabilityDelayMs(): number | undefined;
}

export class PeerCollection implements IPeerCollection {
  private readonly peers;

  private readonly smartPeers = new Set<string>();
  private readonly inFlightPeers = new Set<string>();
  private readonly rateLimitExceededPeers = new Map<string, number>();
  private readonly peerPenaltyCounters = new Map<string, number>();
  private readonly badPeers = new Set<string>();

  constructor(
    initialPeers: PeerId[],
    private readonly pinnedPeerId: PeerId | undefined,
    private readonly dateProvider: DateProvider,
    private readonly badPeerThreshold: number = DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD,
    private readonly peerPenalizer?: IPeerPenalizer,
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
      if (expirationTime <= now) {
        this.rateLimitExceededPeers.delete(peerId);
      } else {
        rateLimitedPeers.add(peerId);
      }
    }

    return rateLimitedPeers;
  }

  public penalisePeer(peerId: PeerId, severity: PeerErrorSeverity): void {
    const key = peerId.toString();
    const newPenaltyCount = (this.peerPenaltyCounters.get(key) ?? 0) + 1;
    this.peerPenaltyCounters.set(key, newPenaltyCount);
    this.peerPenalizer?.penalizePeer(peerId, severity);
    if (newPenaltyCount > this.badPeerThreshold) {
      this.badPeers.add(key);
    }
  }

  public unMarkPeerAsBad(peerId: PeerId) {
    const key = peerId.toString();
    this.badPeers.delete(key);
    this.peerPenaltyCounters.delete(key);
  }

  public getBadPeers(): Set<string> {
    return new Set(this.badPeers);
  }

  public getPeerRateLimitDelayMs(peerId: PeerId): number | undefined {
    const key = peerId.toString();
    const expiry = this.rateLimitExceededPeers.get(key);
    const peerIsNotRateLimited = expiry === undefined;
    if (peerIsNotRateLimited) {
      return undefined;
    }

    const now = this.dateProvider.now();
    const rateLimitHasExpired = expiry <= now;
    if (rateLimitHasExpired) {
      this.rateLimitExceededPeers.delete(key);
      return undefined;
    }
    return expiry - now;
  }

  public getNextDumbPeerAvailabilityDelayMs(): number | undefined {
    // Note: this _is_ suboptimal
    // (we could've tracked rate limits ) per dumb/smart peers - different collections
    // but everything is in memory and small scale so this, wile suboptimal is not slow
    return this.getNextRateLimitDelayMs(
      peerIdStr =>
        !this.smartPeers.has(peerIdStr) &&
        !this.getBadPeers().has(peerIdStr) &&
        !this.inFlightPeers.has(peerIdStr) &&
        this.peers.has(peerIdStr),
    );
  }

  public getNextSmartPeerAvailabilityDelayMs(): number | undefined {
    return this.getNextRateLimitDelayMs(
      peerIdStr =>
        this.smartPeers.has(peerIdStr) && !this.getBadPeers().has(peerIdStr) && !this.inFlightPeers.has(peerIdStr),
    );
  }

  private getNextRateLimitDelayMs(filter: (peerIdStr: string) => boolean): number | undefined {
    const now = this.dateProvider.now();
    let minExpiry: number | undefined;

    for (const [peerIdStr, expiry] of this.rateLimitExceededPeers) {
      const rateLimitHasExpired = expiry <= now;
      if (rateLimitHasExpired) {
        this.rateLimitExceededPeers.delete(peerIdStr);
        continue;
      }

      const peerDoesNotMatchFilter = !filter(peerIdStr);
      if (peerDoesNotMatchFilter) {
        continue;
      }

      minExpiry = minExpiry === undefined ? expiry : Math.min(minExpiry, expiry);
    }

    const noRateLimitedPeersMatchFilter = minExpiry === undefined;
    if (noRateLimitedPeersMatchFilter) {
      return undefined;
    }

    return minExpiry! - now;
  }
}
