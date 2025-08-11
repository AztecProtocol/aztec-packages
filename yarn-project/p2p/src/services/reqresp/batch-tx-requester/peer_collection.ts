import type { PeerId } from '@libp2p/interface';

const BAD_PEER_THRESHOLD = 3;

export class PeerCollection {
  private readonly peers;

  private readonly smartPeers = new Set<string>();
  private readonly badPeers = new Map<string, number>();
  private readonly inFlightPeers = new Set<string>();

  constructor(initialPeers: PeerId[]) {
    this.peers = new Set(initialPeers.map(peer => peer.toString()));
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
    return Array.from(this.smartPeers.difference(this.getBadPeers().union(this.inFlightPeers)));
  }

  public getDumbPeersToQuery(): Array<string> {
    return Array.from(this.peers.difference(this.smartPeers.union(this.getBadPeers()).union(this.inFlightPeers)));
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

  public markPeerInFlight(peerId: PeerId) {
    this.inFlightPeers.add(peerId.toString());
  }

  public unMarkPeerInFlight(peerId: PeerId) {
    this.inFlightPeers.delete(peerId.toString());
  }
}
