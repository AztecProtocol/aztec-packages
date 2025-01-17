import { type PeerErrorSeverity, type PeerInfo } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { type TelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { type ENR } from '@chainsafe/enr';
import { type Connection, type PeerId } from '@libp2p/interface';
import { type Multiaddr } from '@multiformats/multiaddr';
import { inspect } from 'util';

import { type P2PConfig } from '../../config.js';
import { type PubSubLibp2p } from '../../util.js';
import { ReqRespSubProtocol } from '../reqresp/interface.js';
import { GoodByeReason, prettyGoodbyeReason } from '../reqresp/protocols/goodbye.js';
import { type ReqResp } from '../reqresp/reqresp.js';
import { type PeerDiscoveryService } from '../service.js';
import { PeerEvent } from '../types.js';
import { PeerManagerMetrics } from './metrics.js';
import { PeerScoreState, type PeerScoring } from './peer_scoring.js';

const MAX_DIAL_ATTEMPTS = 3;
const MAX_CACHED_PEERS = 100;
const MAX_CACHED_PEER_AGE_MS = 5 * 60 * 1000; // 5 minutes
const FAILED_PEER_BAN_TIME_MS = 5 * 60 * 1000; // 5 minutes timeout after failing MAX_DIAL_ATTEMPTS

type CachedPeer = {
  peerId: PeerId;
  enr: ENR;
  multiaddrTcp: Multiaddr;
  dialAttempts: number;
  addedUnixMs: number;
};

type TimedOutPeer = {
  peerId: string;
  timeoutUntilMs: number;
};

export class PeerManager {
  private cachedPeers: Map<string, CachedPeer> = new Map();
  private heartbeatCounter: number = 0;
  private displayPeerCountsPeerHeartbeat: number = 0;
  private timedOutPeers: Map<string, TimedOutPeer> = new Map();

  private metrics: PeerManagerMetrics;

  constructor(
    private libP2PNode: PubSubLibp2p,
    private peerDiscoveryService: PeerDiscoveryService,
    private config: P2PConfig,
    telemetryClient: TelemetryClient,
    private logger = createLogger('p2p:peer-manager'),
    private peerScoring: PeerScoring,
    private reqresp: ReqResp,
  ) {
    this.metrics = new PeerManagerMetrics(telemetryClient, 'PeerManager');

    // Handle new established connections
    this.libP2PNode.addEventListener(PeerEvent.CONNECTED, this.handleConnectedPeerEvent.bind(this));
    // Handle lost connections
    this.libP2PNode.addEventListener(PeerEvent.DISCONNECTED, this.handleDisconnectedPeerEvent.bind(this));

    // Handle Discovered peers
    this.peerDiscoveryService.on(PeerEvent.DISCOVERED, this.handleDiscoveredPeer.bind(this));

    // Display peer counts every 60 seconds
    this.displayPeerCountsPeerHeartbeat = Math.floor(60_000 / this.config.peerCheckIntervalMS);
  }

  get tracer() {
    return this.metrics.tracer;
  }

  @trackSpan('PeerManager.heartbeat')
  public heartbeat() {
    this.heartbeatCounter++;
    this.peerScoring.decayAllScores();

    this.cleanupExpiredTimeouts();

    this.discover();
  }

  /**
   * Cleans up expired timeouts.
   *
   * When peers fail to dial after a number of retries, they are temporarily timed out.
   * This function removes any peers that have been in the timed out state for too long.
   * To give them a chance to reconnect.
   */
  private cleanupExpiredTimeouts() {
    // Clean up expired timeouts
    const now = Date.now();
    for (const [peerId, timedOutPeer] of this.timedOutPeers.entries()) {
      if (now >= timedOutPeer.timeoutUntilMs) {
        this.timedOutPeers.delete(peerId);
      }
    }
  }

  /**
   * Simply logs the type of connected peer.
   * @param e - The connected peer event.
   */
  private handleConnectedPeerEvent(e: CustomEvent<PeerId>) {
    const peerId = e.detail;
    if (this.peerDiscoveryService.isBootstrapPeer(peerId)) {
      this.logger.verbose(`Connected to bootstrap peer ${peerId.toString()}`);
    } else {
      this.logger.verbose(`Connected to transaction peer ${peerId.toString()}`);
    }
  }

  /**
   * Simply logs the type of disconnected peer.
   * @param e - The disconnected peer event.
   */
  private handleDisconnectedPeerEvent(e: CustomEvent<PeerId>) {
    const peerId = e.detail;
    if (this.peerDiscoveryService.isBootstrapPeer(peerId)) {
      this.logger.verbose(`Disconnected from bootstrap peer ${peerId.toString()}`);
    } else {
      this.logger.verbose(`Disconnected from transaction peer ${peerId.toString()}`);
    }
  }

  /**
   * Handles a goodbye received from a peer.
   *
   * Used as the reqresp handler when a peer sends us goodbye message.
   * @param peerId - The peer ID.
   * @param reason - The reason for the goodbye.
   */
  public goodbyeReceived(peerId: PeerId, reason: GoodByeReason) {
    this.logger.debug(`Goodbye received from peer ${peerId.toString()} with reason ${prettyGoodbyeReason(reason)}`);

    this.metrics.recordGoodbyeReceived(reason);

    void this.disconnectPeer(peerId);
  }

  public penalizePeer(peerId: PeerId, penalty: PeerErrorSeverity) {
    this.peerScoring.penalizePeer(peerId, penalty);
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
    const connections = this.libP2PNode.getConnections();

    const healthyConnections = this.pruneUnhealthyPeers(connections);

    // Calculate how many connections we're looking to make
    const peersToConnect = this.config.maxPeerCount - healthyConnections.length;

    const logLevel = this.heartbeatCounter % this.displayPeerCountsPeerHeartbeat === 0 ? 'info' : 'debug';
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
      if (
        pendingDials.has(id) ||
        healthyConnections.some(conn => conn.remotePeer.equals(peerData.peerId)) ||
        // if peer has been in cache for the max cache age, remove from cache
        Date.now() - peerData.addedUnixMs > MAX_CACHED_PEER_AGE_MS
      ) {
        this.cachedPeers.delete(id);
      } else {
        // cachedPeersToDial.set(id, enr);
        cachedPeersToDial.push(peerData);
      }
    }

    // reverse to dial older entries first
    cachedPeersToDial.reverse();

    for (const peer of cachedPeersToDial) {
      // We remove from the cache before, as dialling will add it back if it fails
      this.cachedPeers.delete(peer.peerId.toString());
      void this.dialPeer(peer);
    }

    // if we need more peers, start randomNodesQuery
    if (peersToConnect > 0) {
      this.logger.trace(`Running random nodes query to connect to ${peersToConnect} peers`);
      void this.peerDiscoveryService.runRandomNodesQuery();
    }
  }

  private pruneUnhealthyPeers(connections: Connection[]): Connection[] {
    const connectedHealthyPeers: Connection[] = [];

    for (const peer of connections) {
      const score = this.peerScoring.getScoreState(peer.remotePeer.toString());
      switch (score) {
        case PeerScoreState.Banned:
          void this.goodbyeAndDisconnectPeer(peer.remotePeer, GoodByeReason.BANNED);
          break;
        case PeerScoreState.Disconnect:
          void this.goodbyeAndDisconnectPeer(peer.remotePeer, GoodByeReason.DISCONNECTED);
          break;
        case PeerScoreState.Healthy:
          connectedHealthyPeers.push(peer);
      }
    }

    return connectedHealthyPeers;
  }

  private async goodbyeAndDisconnectPeer(peer: PeerId, reason: GoodByeReason) {
    this.logger.debug(`Disconnecting peer ${peer.toString()} with reason ${prettyGoodbyeReason(reason)}`);

    this.metrics.recordGoodbyeSent(reason);

    try {
      await this.reqresp.sendRequestToPeer(peer, ReqRespSubProtocol.GOODBYE, Buffer.from([reason]));
    } catch (error) {
      this.logger.debug(`Failed to send goodbye to peer ${peer.toString()}: ${error}`);
    } finally {
      await this.disconnectPeer(peer);
    }
  }

  private async disconnectPeer(peer: PeerId) {
    try {
      await this.libP2PNode.hangUp(peer);
    } catch (error) {
      this.logger.debug(`Failed to disconnect peer ${peer.toString()}`, { error: inspect(error) });
    }
  }

  /**
   *  Handles a discovered peer.
   * @param enr - The discovered peer's ENR.
   */
  private async handleDiscoveredPeer(enr: ENR) {
    // Check that the peer has not already been banned
    const peerId = await enr.peerId();
    const peerIdString = peerId.toString();

    // Check if peer is temporarily timed out
    const timedOutPeer = this.timedOutPeers.get(peerIdString);
    if (timedOutPeer) {
      if (Date.now() < timedOutPeer.timeoutUntilMs) {
        this.logger.trace(`Skipping timed out peer ${peerId}`);
        return;
      }
      // Timeout period expired, remove from timed out peers
      this.timedOutPeers.delete(peerIdString);
    }

    if (this.peerScoring.getScoreState(peerIdString) != PeerScoreState.Healthy) {
      return;
    }

    const [multiaddrTcp] = await Promise.all([enr.getFullMultiaddr('tcp')]);

    this.logger.trace(`Handling discovered peer ${peerId} at ${multiaddrTcp?.toString() ?? 'undefined address'}`);

    // stop if no tcp addr in multiaddr
    if (!multiaddrTcp) {
      this.logger.debug(`No TCP address in discovered node's multiaddr ${enr.encodeTxt()}`);
      return;
    }
    // check if peer is already connected
    const connections = this.libP2PNode.getConnections();
    if (connections.some((conn: Connection) => conn.remotePeer.equals(peerId))) {
      this.logger.trace(`Already connected to peer ${peerId}`);
      return;
    }

    // check if peer is already in cache
    if (this.cachedPeers.has(peerIdString)) {
      this.logger.trace(`Peer already in cache ${peerIdString}`);
      return;
    }

    // create cached peer object
    const cachedPeer: CachedPeer = {
      peerId,
      enr,
      multiaddrTcp,
      dialAttempts: 0,
      addedUnixMs: Date.now(),
    };

    // Determine if we should dial immediately or not
    if (this.shouldDialPeer()) {
      void this.dialPeer(cachedPeer);
    } else {
      this.logger.trace(`Caching peer ${peerIdString}`);
      this.cachedPeers.set(peerIdString, cachedPeer);
      // Prune set of cached peers
      this.pruneCachedPeers();
    }
  }

  private async dialPeer(peer: CachedPeer) {
    const id = peer.peerId.toString();

    // Add to the address book before dialing
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
        formatLibp2pDialError(error as Error);
        this.logger.debug(`Failed to dial peer ${id} (dropping)`, { error: inspect(error) });
        this.cachedPeers.delete(id);
        // Add to timed out peers
        this.timedOutPeers.set(id, {
          peerId: id,
          timeoutUntilMs: Date.now() + FAILED_PEER_BAN_TIME_MS,
        });
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

  /**
   * Stops the peer manager.
   * Removing all event listeners.
   */
  public async stop() {
    this.peerDiscoveryService.off(PeerEvent.DISCOVERED, this.handleDiscoveredPeer);

    // Send goodbyes to all peers
    await Promise.all(
      this.libP2PNode.getPeers().map(peer => this.goodbyeAndDisconnectPeer(peer, GoodByeReason.SHUTDOWN)),
    );

    this.libP2PNode.removeEventListener(PeerEvent.CONNECTED, this.handleConnectedPeerEvent);
    this.libP2PNode.removeEventListener(PeerEvent.DISCONNECTED, this.handleDisconnectedPeerEvent);
  }
}

/**
 * copied from github.com/ChainSafe/lodestar
 * libp2p errors with extremely noisy errors here, which are deeply nested taking 30-50 lines.
 * Some known errors:
 * ```
 * Error: The operation was aborted
 * Error: stream ended before 1 bytes became available
 * Error: Error occurred during XX handshake: Error occurred while verifying signed payload: Peer ID doesn't match libp2p public key
 * ```
 *
 * Also the error's message is not properly formatted, where the error message is indented and includes the full stack
 * ```
 * {
 *  emessage: '\n' +
 *    '    Error: stream ended before 1 bytes became available\n' +
 *    '        at /home/lion/Code/eth2.0/lodestar/node_modules/it-reader/index.js:37:9\n' +
 *    '        at runMicrotasks (<anonymous>)\n' +
 *    '        at decoder (/home/lion/Code/eth2.0/lodestar/node_modules/it-length-prefixed/src/decode.js:113:22)\n' +
 *    '        at first (/home/lion/Code/eth2.0/lodestar/node_modules/it-first/index.js:11:20)\n' +
 *    '        at Object.exports.read (/home/lion/Code/eth2.0/lodestar/node_modules/multistream-select/src/multistream.js:31:15)\n' +
 *    '        at module.exports (/home/lion/Code/eth2.0/lodestar/node_modules/multistream-select/src/select.js:21:19)\n' +
 *    '        at Upgrader._encryptOutbound (/home/lion/Code/eth2.0/lodestar/node_modules/libp2p/src/upgrader.js:397:36)\n' +
 *    '        at Upgrader.upgradeOutbound (/home/lion/Code/eth2.0/lodestar/node_modules/libp2p/src/upgrader.js:176:11)\n' +
 *    '        at ClassIsWrapper.dial (/home/lion/Code/eth2.0/lodestar/node_modules/libp2p-tcp/src/index.js:49:18)'
 * }
 * ```
 *
 * Tracking issue https://github.com/libp2p/js-libp2p/issues/996
 */
function formatLibp2pDialError(e: Error): void {
  const errorMessage = e.message.trim();
  const newlineIndex = errorMessage.indexOf('\n');
  e.message = newlineIndex !== -1 ? errorMessage.slice(0, newlineIndex) : errorMessage;

  if (
    e.message.includes('The operation was aborted') ||
    e.message.includes('stream ended before 1 bytes became available') ||
    e.message.includes('The operation was aborted')
  ) {
    e.stack = undefined;
  }
}
