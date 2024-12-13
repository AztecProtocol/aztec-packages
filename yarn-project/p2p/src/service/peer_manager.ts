import { type PeerInfo } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { type ENR } from '@chainsafe/enr';
import { type PeerId } from '@libp2p/interface';
import { type Multiaddr } from '@multiformats/multiaddr';
import { inspect } from 'util';

import { type P2PConfig } from '../config.js';
import { type PubSubLibp2p } from '../util.js';
import { type PeerErrorSeverity, PeerScoring } from './peer_scoring.js';
import { type PeerDiscoveryService } from './service.js';

const MAX_DIAL_ATTEMPTS = 3;
const MAX_CACHED_PEERS = 100;

type CachedPeer = {
  peerId: PeerId;
  enr: ENR;
  multiaddrTcp: Multiaddr;
  dialAttempts: number;
};

export class PeerManager implements Traceable {
  private cachedPeers: Map<string, CachedPeer> = new Map();
  private peerScoring: PeerScoring;
  private heartbeatCounter: number = 0;

  constructor(
    private libP2PNode: PubSubLibp2p,
    private peerDiscoveryService: PeerDiscoveryService,
    private config: P2PConfig,
    public readonly tracer: Tracer,
    private logger = createLogger('p2p:peer-manager'),
  ) {
    this.peerScoring = new PeerScoring(config);
    // Handle new established connections
    this.libP2PNode.addEventListener('peer:connect', evt => {
      const peerId = evt.detail;
      if (this.peerDiscoveryService.isBootstrapPeer(peerId)) {
        this.logger.verbose(`Connected to bootstrap peer ${peerId.toString()}`);
      } else {
        this.logger.verbose(`Connected to transaction peer ${peerId.toString()}`);
      }
    });

    // Handle lost connections
    this.libP2PNode.addEventListener('peer:disconnect', evt => {
      const peerId = evt.detail;
      if (this.peerDiscoveryService.isBootstrapPeer(peerId)) {
        this.logger.verbose(`Disconnected from bootstrap peer ${peerId.toString()}`);
      } else {
        this.logger.verbose(`Disconnected from transaction peer ${peerId.toString()}`);
      }
    });

    // Handle Discovered peers
    this.peerDiscoveryService.on('peer:discovered', async (enr: ENR) => {
      await this.handleDiscoveredPeer(enr);
    });
  }

  @trackSpan('PeerManager.heartbeat')
  public heartbeat() {
    this.heartbeatCounter++;
    this.discover();
    this.peerScoring.decayAllScores();
  }

  public penalizePeer(peerId: PeerId, penalty: PeerErrorSeverity) {
    const id = peerId.toString();
    const penaltyValue = this.peerScoring.peerPenalties[penalty];
    const newScore = this.peerScoring.updateScore(id, -penaltyValue);
    this.logger.verbose(`Penalizing peer ${id} with ${penalty} (new score is ${newScore})`);
  }

  public getPeerScore(peerId: string): number {
    return this.peerScoring.getScore(peerId);
  }

  public getPeers(includePending = false): PeerInfo[] {
    const connected = this.libP2PNode
      .getPeers()
      .map(peer => ({ id: peer.toString(), score: this.getPeerScore(peer.toString()), status: 'connected' as const }));

    if (!includePending) {
      return connected;
    }

    const dialQueue = this.libP2PNode
      .getDialQueue()
      .filter(peer => !!peer.peerId)
      .map(peer => ({
        id: peer.peerId!.toString(),
        status: 'dialing' as const,
        dialStatus: peer.status,
        addresses: peer.multiaddrs.map(m => m.toString()),
      }));

    const cachedPeers = Array.from(this.cachedPeers.values())
      .filter(peer => !dialQueue.some(dialPeer => dialPeer.id && peer.peerId.toString() === dialPeer.id.toString()))
      .filter(peer => !connected.some(connPeer => connPeer.id.toString() === peer.peerId.toString()))
      .map(peer => ({
        status: 'cached' as const,
        id: peer.peerId.toString(),
        addresses: [peer.multiaddrTcp.toString()],
        dialAttempts: peer.dialAttempts,
        enr: peer.enr.encodeTxt(),
      }));

    return [...connected, ...dialQueue, ...cachedPeers];
  }

  /**
   * Discovers peers.
   */
  private discover() {
    // Get current connections
    const connections = this.libP2PNode.getConnections();

    // Calculate how many connections we're looking to make
    const peersToConnect = this.config.maxPeerCount - connections.length;

    const logLevel = this.heartbeatCounter % 60 === 0 ? 'info' : 'debug';
    this.logger[logLevel](`Connected to ${connections.length} peers`, {
      connections: connections.length,
      maxPeerCount: this.config.maxPeerCount,
      cachedPeers: this.cachedPeers.size,
      ...this.peerScoring.getStats(),
    });

    // Exit if no peers to connect
    if (peersToConnect <= 0) {
      return;
    }

    const cachedPeersToDial: CachedPeer[] = [];

    const pendingDials = new Set(
      this.libP2PNode
        .getDialQueue()
        .map(pendingDial => pendingDial.peerId?.toString())
        .filter(Boolean) as string[],
    );

    for (const [id, peerData] of this.cachedPeers.entries()) {
      // if already dialling or connected to, remove from cache
      if (pendingDials.has(id) || connections.some(conn => conn.remotePeer.equals(peerData.peerId))) {
        this.cachedPeers.delete(id);
      } else {
        // cachedPeersToDial.set(id, enr);
        cachedPeersToDial.push(peerData);
      }
    }

    // reverse to dial older entries first
    cachedPeersToDial.reverse();

    for (const peer of cachedPeersToDial) {
      this.cachedPeers.delete(peer.peerId.toString());
      void this.dialPeer(peer);
    }

    // if we need more peers, start randomNodesQuery
    if (peersToConnect > 0) {
      this.logger.trace(`Running random nodes query to connect to ${peersToConnect} peers`);
      void this.peerDiscoveryService.runRandomNodesQuery();
    }
  }

  /**
   *  Handles a discovered peer.
   * @param enr - The discovered peer's ENR.
   */
  private async handleDiscoveredPeer(enr: ENR) {
    // TODO: Will be handling peer scoring here

    // check if peer is already connected
    const [peerId, multiaddrTcp] = await Promise.all([enr.peerId(), enr.getFullMultiaddr('tcp')]);

    this.logger.trace(
      `Handling discovered peer ${peerId.toString()} at ${multiaddrTcp?.toString() ?? 'undefined address'}`,
    );

    // throw if no tcp addr in multiaddr
    if (!multiaddrTcp) {
      this.logger.debug(`No TCP address in discovered node's multiaddr ${enr.encodeTxt()}`);
      return;
    }
    const connections = this.libP2PNode.getConnections();
    if (connections.some(conn => conn.remotePeer.equals(peerId))) {
      this.logger.trace(`Already connected to peer ${peerId.toString()}`);
      return;
    }

    // check if peer is already in cache
    const id = peerId.toString();
    if (this.cachedPeers.has(id)) {
      this.logger.trace(`Peer already in cache ${id}`);
      return;
    }

    // create cached peer object
    const cachedPeer: CachedPeer = {
      peerId,
      enr,
      multiaddrTcp,
      dialAttempts: 0,
    };

    // Determine if we should dial immediately or not
    if (this.shouldDialPeer()) {
      void this.dialPeer(cachedPeer);
    } else {
      this.logger.trace(`Caching peer ${id}`);
      this.cachedPeers.set(id, cachedPeer);
      // Prune set of cached peers
      this.pruneCachedPeers();
    }
  }

  private async dialPeer(peer: CachedPeer) {
    const id = peer.peerId.toString();
    await this.libP2PNode.peerStore.merge(peer.peerId, { multiaddrs: [peer.multiaddrTcp] });

    this.logger.trace(`Dialing peer ${id}`);
    try {
      await this.libP2PNode.dial(peer.multiaddrTcp);
    } catch (error) {
      peer.dialAttempts++;
      if (peer.dialAttempts < MAX_DIAL_ATTEMPTS) {
        this.logger.trace(`Failed to dial peer ${id} (attempt ${peer.dialAttempts})`, { error: inspect(error) });
        this.cachedPeers.set(id, peer);
      } else {
        this.logger.debug(`Failed to dial peer ${id} (dropping)`, { error: inspect(error) });
        this.cachedPeers.delete(id);
      }
    }
  }

  private shouldDialPeer(): boolean {
    const connections = this.libP2PNode.getConnections().length;
    if (connections >= this.config.maxPeerCount) {
      this.logger.trace(
        `Not dialing peer due to max peer count of ${this.config.maxPeerCount} reached (${connections} current connections)`,
      );
      return false;
    }
    return true;
  }

  private pruneCachedPeers() {
    let peersToDelete = this.cachedPeers.size - MAX_CACHED_PEERS;
    if (peersToDelete <= 0) {
      return;
    }

    // Remove the oldest peers
    for (const key of this.cachedPeers.keys()) {
      this.cachedPeers.delete(key);
      this.logger.trace(`Pruning peer ${key} from cache`);
      peersToDelete--;
      if (peersToDelete <= 0) {
        break;
      }
    }
  }
}
