import type { DateProvider } from '@aztec/foundation/timer';
import type { PeerErrorSeverity } from '@aztec/stdlib/p2p';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { ConnectionSampler } from '../connection-sampler/connection_sampler.js';
import { DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD } from './config.js';
import type { IPeerPenalizer } from './interface.js';

export const RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL = 1000; // 1s

export interface IPeerCollection {
  markPeerSmart(peerId: PeerId): void;
  markPeerDumb(peerId: PeerId): void;

  /** Sample next peer in round-robin fashion. No smart peers if returns undefined */
  nextSmartPeerToQuery(): PeerId | undefined;
  /** Sample next peer in round-robin fashion. No dumb peers if returns undefined */
  nextDumbPeerToQuery(): PeerId | undefined;

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
  private readonly smartPeers = new Set<string>();
  private readonly inFlightPeers = new Set<string>();
  private readonly rateLimitExceededPeers = new Map<string, number>();
  private readonly peerPenaltyCounters = new Map<string, number>();
  private readonly badPeers = new Set<string>();

  constructor(
    private readonly connectionSampler: Pick<ConnectionSampler, 'getPeerListSortedByConnectionCountAsc'>,
    private readonly pinnedPeerId: PeerId | undefined,
    private readonly dateProvider: DateProvider,
    private readonly badPeerThreshold: number = DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD,
    private readonly peerPenalizer?: IPeerPenalizer,
  ) {
    // Pinned peer is treated specially, always mark it as in-flight
    // and never return it as part of smart/dumb peers
    if (this.pinnedPeerId) {
      const peerIdStr = this.pinnedPeerId.toString();
      this.inFlightPeers.add(peerIdStr);
    }
  }

  public markPeerSmart(peerId: PeerId): void {
    this.smartPeers.add(peerId.toString());
  }

  public markPeerDumb(peerId: PeerId): void {
    this.smartPeers.delete(peerId.toString());
  }

  // We keep track of all peers that are queried for peer sampling algorithm
  private queriedSmartPeers: Set<string> = new Set<string>();
  private queriedDumbPeers: Set<string> = new Set<string>();

  private static nextPeer(allPeers: Set<string>, queried: Set<string>): PeerId | undefined {
    if (allPeers.size === 0) {
      return undefined;
    }
    const availablePeers = allPeers.difference(queried);
    let [first] = availablePeers;
    if (first === undefined) {
      // We queried all peers. Start over
      [first] = allPeers;
      queried.clear();
    }
    queried.add(first);
    return peerIdFromString(first);
  }

  public nextSmartPeerToQuery(): PeerId | undefined {
    return PeerCollection.nextPeer(this.availableSmartPeers, this.queriedSmartPeers);
  }

  public nextDumbPeerToQuery(): PeerId | undefined {
    return PeerCollection.nextPeer(this.availableDumbPeers, this.queriedDumbPeers);
  }

  private get availableSmartPeers(): Set<string> {
    return this.peers.intersection(
      this.smartPeers.difference(this.getBadPeers().union(this.inFlightPeers).union(this.getRateLimitExceededPeers())),
    );
  }

  private get availableDumbPeers(): Set<string> {
    return this.peers.difference(
      this.smartPeers.union(this.getBadPeers()).union(this.inFlightPeers).union(this.getRateLimitExceededPeers()),
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

  private orderedPeers: Set<string> = new Set();

  private get peers(): Set<string> {
    const pinnedStr = this.pinnedPeerId?.toString();
    const currentlyConnected = new Set(
      this.connectionSampler
        .getPeerListSortedByConnectionCountAsc()
        .map(p => p.toString())
        .filter(p => p !== pinnedStr),
    );

    // Remove disconnected peers, preserving order of the rest.
    this.orderedPeers = this.orderedPeers.intersection(currentlyConnected);

    // Append newly connected peers at the end (lowest priority).
    for (const peer of currentlyConnected) {
      if (!this.orderedPeers.has(peer)) {
        this.orderedPeers.add(peer);
      }
    }
    return this.orderedPeers;
  }
}
