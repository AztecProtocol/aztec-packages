import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { recoverAddress } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { bufferToHex } from '@aztec/foundation/string';
import type { PeerInfo, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { type TelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { ENR } from '@chainsafe/enr';
import type { Connection, PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import type { Multiaddr } from '@multiformats/multiaddr';
import type { Libp2p } from 'libp2p';
import { inspect } from 'util';

import type { P2PConfig } from '../../config.js';
import { PeerEvent } from '../../types/index.js';
import { ReqRespSubProtocol } from '../reqresp/interface.js';
import { AuthRequest, AuthResponse } from '../reqresp/protocols/auth.js';
import { GoodByeReason, prettyGoodbyeReason } from '../reqresp/protocols/goodbye.js';
import { StatusMessage } from '../reqresp/protocols/status.js';
import type { ReqResp } from '../reqresp/reqresp.js';
import { ReqRespStatus } from '../reqresp/status.js';
import type { PeerDiscoveryService } from '../service.js';
import type { PeerManagerInterface } from './interface.js';
import { PeerManagerMetrics } from './metrics.js';
import { PeerScoreState, type PeerScoring } from './peer_scoring.js';

const MAX_DIAL_ATTEMPTS = 3;
const MAX_CACHED_PEERS = 100;
const MAX_CACHED_PEER_AGE_MS = 5 * 60 * 1000; // 5 minutes
const FAILED_PEER_BAN_TIME_MS = 5 * 60 * 1000; // 5 minutes timeout after failing MAX_DIAL_ATTEMPTS
const GOODBYE_DIAL_TIMEOUT_MS = 1000;

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

export class PeerManager implements PeerManagerInterface {
  private cachedPeers: Map<string, CachedPeer> = new Map();
  private heartbeatCounter: number = 0;
  private displayPeerCountsPeerHeartbeat: number = 0;
  private timedOutPeers: Map<string, TimedOutPeer> = new Map();
  private trustedPeers: Set<string> = new Set();
  private trustedPeersInitialized: boolean = false;
  private privatePeers: Set<string> = new Set();
  private privatePeersInitialized: boolean = false;
  private preferredPeers: Set<string> = new Set();
  private authenticatedPeerIdToValidatorAddress: Map<string, EthAddress> = new Map();
  private authenticatedValidatorAddressToPeerId: Map<string, PeerId> = new Map();

  private metrics: PeerManagerMetrics;
  private handlers: {
    handleConnectedPeerEvent: (e: CustomEvent<PeerId>) => void;
    handleDisconnectedPeerEvent: (e: CustomEvent<PeerId>) => void;
    handleDiscoveredPeer: (enr: ENR) => Promise<void>;
  };

  constructor(
    private libP2PNode: Libp2p,
    private peerDiscoveryService: PeerDiscoveryService,
    private config: P2PConfig,
    telemetryClient: TelemetryClient,
    private logger = createLogger('p2p:peer-manager'),
    private peerScoring: PeerScoring,
    private reqresp: ReqResp,
    private readonly worldStateSynchronizer: WorldStateSynchronizer,
    private readonly protocolVersion: string,
    private readonly epochCache: EpochCacheInterface,
  ) {
    if (this.config.p2pDisableStatusHandshake && this.config.p2pAllowOnlyValidators) {
      throw new Error('Status handshake disabled but is required to allow only validators to connect.');
    }
    this.metrics = new PeerManagerMetrics(telemetryClient, 'PeerManager');

    // Handle Discovered peers
    this.handlers = {
      handleConnectedPeerEvent: this.handleConnectedPeerEvent.bind(this),
      handleDisconnectedPeerEvent: this.handleDisconnectedPeerEvent.bind(this),
      handleDiscoveredPeer: (enr: ENR) =>
        this.handleDiscoveredPeer(enr).catch(e => this.logger.error('Error handling discovered peer', e)),
    };

    // Handle new established connections
    this.libP2PNode.addEventListener(PeerEvent.CONNECTED, this.handlers.handleConnectedPeerEvent);
    // Handle lost connections
    this.libP2PNode.addEventListener(PeerEvent.DISCONNECTED, this.handlers.handleDisconnectedPeerEvent);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.peerDiscoveryService?.on(PeerEvent.DISCOVERED, this.handlers.handleDiscoveredPeer);

    // Display peer counts every 60 seconds
    this.displayPeerCountsPeerHeartbeat = Math.floor(60_000 / this.config.peerCheckIntervalMS);
  }
  /**
   * Initializes the trusted peers.
   *
   * This function is called when the peer manager is initialized.
   */
  async initializePeers() {
    if (this.config.trustedPeers) {
      const trustedPeersEnrs: ENR[] = this.config.trustedPeers.map(enr => ENR.decodeTxt(enr));
      await Promise.all(trustedPeersEnrs.map(enr => enr.peerId()))
        .then(peerIds => peerIds.forEach(peerId => this.trustedPeers.add(peerId.toString())))
        .finally(() => {
          this.trustedPeersInitialized = true;
        })
        .catch(e => this.logger.error('Error initializing trusted peers', e));
    }

    if (this.config.privatePeers) {
      const privatePeersEnrs: ENR[] = this.config.privatePeers.map(enr => ENR.decodeTxt(enr));
      await Promise.all(privatePeersEnrs.map(enr => enr.peerId()))
        .then(peerIds =>
          peerIds.forEach(peerId => {
            this.trustedPeers.add(peerId.toString());
            this.privatePeers.add(peerId.toString());
          }),
        )
        .finally(() => {
          if (!this.config.trustedPeers) {
            this.trustedPeersInitialized = true;
          }
          this.privatePeersInitialized = true;
        })
        .catch(e => this.logger.error('Error initializing private peers', e));
    }

    if (this.config.preferredPeers) {
      const preferredPeersEnrs: ENR[] = this.config.preferredPeers.map(enr => ENR.decodeTxt(enr));
      await Promise.all(preferredPeersEnrs.map(enr => enr.peerId()))
        .then(peerIds => peerIds.forEach(peerId => this.preferredPeers.add(peerId.toString())))
        .catch(e => this.logger.error('Error initializing preferred peers', e));
    }
  }

  get tracer() {
    return this.metrics.tracer;
  }

  @trackSpan('PeerManager.heartbeat')
  public async heartbeat() {
    this.heartbeatCounter++;
    this.peerScoring.decayAllScores();
    await this.updateAuthenticatedPeers();

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
   * Performs Status Handshake with a connected peer.
   * @param e - The connected peer event.
   */
  private handleConnectedPeerEvent(e: CustomEvent<PeerId>) {
    const peerId = e.detail;
    this.logger.verbose(`Connected to peer ${peerId.toString()}`);
    if (this.config.p2pDisableStatusHandshake) {
      return;
    }
    // If we are not configured to only allow validators then perform a status handshake
    if (!this.config.p2pAllowOnlyValidators) {
      void this.exchangeStatusHandshake(peerId);
      return;
    }

    // We are configured to only allow validators, but this doesn't apply to trusted, private peers or preferred peers
    if (this.isProtectedPeer(peerId)) {
      void this.exchangeStatusHandshake(peerId);
      return;
    }

    // Initiate auth handshake
    void this.exchangeAuthHandshake(peerId);
  }

  /**
   * Simply logs the type of disconnected peer.
   * @param e - The disconnected peer event.
   */
  private handleDisconnectedPeerEvent(e: CustomEvent<PeerId>) {
    const peerId = e.detail;
    this.logger.verbose(`Disconnected from peer ${peerId.toString()}`);
    const validatorAddress = this.authenticatedPeerIdToValidatorAddress.get(peerId.toString());
    if (validatorAddress !== undefined) {
      this.logger.info(
        `Removing authentication for validator ${validatorAddress} at peer id ${peerId.toString()} due to disconnection`,
      );
      this.authenticatedValidatorAddressToPeerId.delete(validatorAddress.toString());
      this.authenticatedPeerIdToValidatorAddress.delete(peerId.toString());
    }
  }

  /**
   * Checks if a peer is trusted.
   * @param peerId - The peer ID.
   * @returns True if the peer is trusted, false otherwise.
   * Note: This function will return false and log a warning if the trusted peers are not initialized.
   */
  private isTrustedPeer(peerId: PeerId): boolean {
    if (!this.trustedPeersInitialized) {
      this.logger.warn('Trusted peers not initialized, returning false');
      return false;
    }
    return this.trustedPeers.has(peerId.toString());
  }

  /**
   * Adds a peer to the trusted peers set.
   * @param peerId - The peer ID to add to trusted peers.
   */
  public addTrustedPeer(peerId: PeerId): void {
    const peerIdStr = peerId.toString();

    this.trustedPeers.add(peerIdStr);
    this.trustedPeersInitialized = true;
    this.logger.verbose(`Added trusted peer ${peerIdStr}`);
  }

  /**
   * Adds a peer to the private peers set.
   * @param peerId - The peer ID to add to private peers.
   */
  public addPrivatePeer(peerId: PeerId): void {
    const peerIdStr = peerId.toString();

    this.trustedPeers.add(peerIdStr);
    this.privatePeers.add(peerIdStr);
    this.trustedPeersInitialized = true;
    this.privatePeersInitialized = true;
    this.logger.verbose(`Added private peer ${peerIdStr}`);
  }

  /**
   * Checks if a peer is private.
   * @param peerId - The peer ID.
   * @returns True if the peer is private, false otherwise.
   */
  private isPrivatePeer(peerId: PeerId): boolean {
    if (!this.privatePeersInitialized) {
      this.logger.warn('Private peers not initialized, returning false');
      return false;
    }
    return this.privatePeers.has(peerId.toString());
  }

  /**
   * Adds a peer to the preferred peers set.
   * @param peerId - The peer ID to add to preferred peers.
   */
  public addPreferredPeer(peerId: PeerId): void {
    const peerIdStr = peerId.toString();

    this.preferredPeers.add(peerIdStr);
    this.logger.verbose(`Added preferred peer ${peerIdStr}`);
  }

  /**
   * Checks if a peer is preferred.
   * @param peerId - The peer ID.
   * @returns True if the peer is preferred, false otherwise.
   */
  private isPreferredPeer(peerId: PeerId): boolean {
    return this.preferredPeers.has(peerId.toString());
  }

  /**
   * Checks if a peer is protected (either trusted or private).
   * @param peerId - The peer ID.
   * @returns True if the peer is protected, false otherwise.
   */
  private isProtectedPeer(peerId: PeerId): boolean {
    return this.isTrustedPeer(peerId) || this.isPrivatePeer(peerId) || this.isPreferredPeer(peerId);
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

  public shouldDisableP2PGossip(peerId: string): boolean {
    const isAuthenticated = this.isAuthenticatedPeer(peerIdFromString(peerId));
    return (this.config.p2pAllowOnlyValidators ?? false) && !isAuthenticated;
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

  public isAuthenticatedPeer(peerId: PeerId): boolean {
    const peerIdAsString = peerId.toString();
    return (
      this.privatePeers.has(peerIdAsString) ||
      this.trustedPeers.has(peerIdAsString) ||
      this.preferredPeers.has(peerIdAsString) ||
      this.authenticatedPeerIdToValidatorAddress.has(peerIdAsString)
    );
  }
  /**
   * Discovers peers.
   */
  private discover() {
    const connections = this.libP2PNode.getConnections();

    const healthyConnections = this.prioritizePeers(
      this.pruneUnhealthyPeers(this.getNonProtectedPeers(this.pruneDuplicatePeers(connections))),
    );

    // Calculate how many connections we're looking to make
    const protectedPeerCount = this.getProtectedPeerCount();
    const peersToConnect = this.config.maxPeerCount - healthyConnections.length - protectedPeerCount;

    const logLevel = this.heartbeatCounter % this.displayPeerCountsPeerHeartbeat === 0 ? 'info' : 'debug';
    this.logger[logLevel](`Connected to ${healthyConnections.length + this.trustedPeers.size} peers`, {
      discoveredConnections: healthyConnections.length,
      protectedConnections: protectedPeerCount,
      maxPeerCount: this.config.maxPeerCount,
      cachedPeers: this.cachedPeers.size,
      ...this.peerScoring.getStats(),
    });

    this.metrics.recordPeerCount(healthyConnections.length);

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

  private getNonProtectedPeers(connections: Connection[]): Connection[] {
    return connections.filter(conn => !this.isProtectedPeer(conn.remotePeer));
  }

  private getProtectedPeerCount(): number {
    return this.trustedPeers.size + this.privatePeers.size + this.preferredPeers.size;
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
          void this.goodbyeAndDisconnectPeer(peer.remotePeer, GoodByeReason.LOW_SCORE);
          break;
        case PeerScoreState.Healthy:
          connectedHealthyPeers.push(peer);
      }
    }

    return connectedHealthyPeers;
  }

  /**
   * If the max peer count is reached, the lowest scoring peers will be pruned to satisfy the max peer count.
   *
   * @param connections - The list of connections to prune low scoring peers above the max peer count from.
   * @returns The pruned list of connections.
   */
  private prioritizePeers(connections: Connection[]): Connection[] {
    const protectedPeerCount = this.getProtectedPeerCount();
    if (connections.length > this.config.maxPeerCount - protectedPeerCount) {
      // Sort the regular peer scores from highest to lowest
      const prioritizedConnections = connections.sort((connectionA, connectionB) => {
        const connectionScoreA = this.peerScoring.getScore(connectionA.remotePeer.toString());
        const connectionScoreB = this.peerScoring.getScore(connectionB.remotePeer.toString());
        return connectionScoreB - connectionScoreA;
      });

      // Calculate how many regular peers we can keep
      const peersToKeep = Math.max(0, this.config.maxPeerCount - protectedPeerCount);

      // Disconnect from the lowest scoring regular connections that exceed our limit
      for (const conn of prioritizedConnections.slice(peersToKeep)) {
        void this.goodbyeAndDisconnectPeer(conn.remotePeer, GoodByeReason.MAX_PEERS);
      }

      // Return trusted connections plus the highest scoring regular connections up to the max peer count
      return prioritizedConnections.slice(0, peersToKeep);
    } else {
      return connections;
    }
  }

  /**
   * If multiple connections to the same peer are found, the oldest connection is kept and the duplicates are pruned.
   *
   * This is necessary to resolve a race condition where multiple connections to the same peer are established if
   * they are discovered at the same time.
   *
   * @param connections - The list of connections to prune duplicate peers from.
   * @returns The pruned list of connections.
   */
  private pruneDuplicatePeers(connections: Connection[]): Connection[] {
    const peerConnections = new Map<string, Connection>();

    for (const conn of connections) {
      const peerId = conn.remotePeer.toString();
      const existingConnection = peerConnections.get(peerId);
      if (!existingConnection) {
        peerConnections.set(peerId, conn);
      } else {
        // Keep the oldest connection for each peer
        this.logger.debug(`Found duplicate connection to peer ${peerId}, keeping oldest connection`);
        if (conn.timeline.open < existingConnection.timeline.open) {
          peerConnections.set(peerId, conn);
          void existingConnection.close();
        } else {
          void conn.close();
        }
      }
    }

    return [...peerConnections.values()];
  }

  private async goodbyeAndDisconnectPeer(peer: PeerId, reason: GoodByeReason) {
    this.logger.debug(`Disconnecting peer ${peer.toString()} with reason ${prettyGoodbyeReason(reason)}`);

    this.metrics.recordGoodbyeSent(reason);

    try {
      const resp = await this.reqresp.sendRequestToPeer(
        peer,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([reason]),
        GOODBYE_DIAL_TIMEOUT_MS,
      );

      if (resp.status === ReqRespStatus.FAILURE) {
        this.logger.debug(`Failed to send goodbye to peer ${peer.toString()}`);
      } else if (resp.status === ReqRespStatus.SUCCESS) {
        this.logger.verbose(`Sent goodbye to peer ${peer.toString()}`);
      } else {
        this.logger.debug(
          `Unexpected status sending goodbye to peer ${peer.toString()}: ${ReqRespStatus[resp.status]}`,
        );
      }
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
    for (const [key, value] of this.cachedPeers.entries()) {
      if (this.isProtectedPeer(value.peerId)) {
        this.logger.debug(`Not pruning trusted peer ${key}`);
        continue;
      }

      this.cachedPeers.delete(key);
      this.logger.trace(`Pruning peer ${key} from cache`);
      peersToDelete--;
      if (peersToDelete <= 0) {
        break;
      }
    }
  }

  private async createStatusMessage() {
    const syncSummary = (await this.worldStateSynchronizer.status()).syncSummary;
    return StatusMessage.fromWorldStateSyncStatus(this.protocolVersion, syncSummary);
  }

  /**
   * Performs status Handshake with the Peer
   * The way the protocol is designed is that each peer will call this method on newly established p2p connection.
   * Both peers request Status message and both peers perform validation of the received Status message.
   * If this validation fails on any end that peer will initiate disconnect.
   *  Note: It's important for both peers to request and perform Status validation,
   *  Because one of the peers can be _bad peer_ and this peer can simply skip the check.
   *  If we don't implement validation on both ends the _bad peer_ remains connected.
   * @param: peerId The Id of the peer to request the Status from.
   * */
  private async exchangeStatusHandshake(peerId: PeerId) {
    try {
      const ourStatus = await this.createStatusMessage();
      //Note: Technically we don't have to send out status to peer as well, but we do.
      //It will be easier to update protocol in the future this way if need be.
      this.logger.trace(`Initiating status handshake with peer ${peerId}`);
      const response = await this.reqresp.sendRequestToPeer(peerId, ReqRespSubProtocol.STATUS, ourStatus.toBuffer());
      const { status } = response;
      if (status !== ReqRespStatus.SUCCESS) {
        //TODO: maybe hard ban these peers in the future.
        //We could allow this to happen up to N times, and then hard ban?
        //Hard ban: Disallow connection via e.g. libp2p's Gater
        this.logger.warn(`Disconnecting peer ${peerId} who failed to respond status handshake`, {
          peerId,
          status: ReqRespStatus[status],
        });
        await this.disconnectPeer(peerId);
        return;
      }

      const { data } = response;
      const logData = { peerId, status: ReqRespStatus[status], data: data ? bufferToHex(data) : undefined };
      const peerStatusMessage = StatusMessage.fromBuffer(data);
      if (!ourStatus.validate(peerStatusMessage)) {
        this.logger.warn(`Disconnecting peer ${peerId} due to failed status handshake.`, logData);
        await this.disconnectPeer(peerId);
        return;
      }
      this.logger.debug(`Successfully completed status handshake with peer ${peerId}`, logData);
    } catch (err: any) {
      //TODO: maybe hard ban these peers in the future
      this.logger.warn(`Disconnecting peer ${peerId} due to error during status handshake: ${err.message ?? err}`, {
        peerId,
      });
      await this.disconnectPeer(peerId);
    }
  }

  /**
   * Performs auth Handshake with the Peer
   * A superset of the status handshake. Also includes a challenge that needs to be signed by the peer's validator key.
   * @param: peerId The Id of the peer to request the Status from.
   * */
  private async exchangeAuthHandshake(peerId: PeerId) {
    try {
      const ourStatus = await this.createStatusMessage();
      const authRequest = new AuthRequest(ourStatus, Fr.random());

      // Note: Technically we don't have to send our status to peer as well, but we do.
      // It will be easier to update protocol in the future this way if need be.
      // We also need to send the challenge at least, so that the peer can sign it.
      this.logger.debug(`Initiating auth handshake with peer ${peerId}`);
      const response = await this.reqresp.sendRequestToPeer(peerId, ReqRespSubProtocol.AUTH, authRequest.toBuffer());
      const { status } = response;
      if (status !== ReqRespStatus.SUCCESS) {
        this.logger.warn(`Disconnecting peer ${peerId} who failed to respond auth handshake`, {
          peerId,
          status: ReqRespStatus[status],
        });
        await this.disconnectPeer(peerId);
        return;
      }

      const { data } = response;
      const logData = { peerId, status: ReqRespStatus[status], data: data ? bufferToHex(data) : undefined };

      const peerAuthResponse = AuthResponse.fromBuffer(data);

      const peerStatusMessage = peerAuthResponse.status;
      if (!ourStatus.validate(peerStatusMessage)) {
        this.logger.warn(`Disconnecting peer ${peerId} due to failed status handshake as part of auth.`, logData);
        await this.disconnectPeer(peerId);
        return;
      }

      const hashToRecover = authRequest.getPayloadToSign();
      const sender = recoverAddress(hashToRecover, peerAuthResponse.signature);
      const registeredValidators = await this.epochCache.getRegisteredValidators();
      const found = registeredValidators.find(v => v.toString() === sender.toString()) !== undefined;
      if (!found) {
        this.logger.debug(
          `Disconnecting peer ${peerId} due to failed auth handshake, peer is not a registered validator.`,
          {
            peerId,
            address: sender.toString(),
          },
        );
        await this.disconnectPeer(peerId);
        return;
      }

      const peerIdString = peerId.toString();

      // Check to see that this validator address isn't already allocated to a different peer
      const peerForAddress = this.authenticatedValidatorAddressToPeerId.get(sender.toString());
      if (peerForAddress !== undefined && peerForAddress.toString() !== peerIdString) {
        this.logger.warn(
          `Received auth for validator ${sender.toString()} from peer ${peerIdString}, but this validator is already authenticated to peer ${peerForAddress.toString()}`,
        );
        return;
      }

      this.authenticatedPeerIdToValidatorAddress.set(peerIdString, sender);
      this.authenticatedValidatorAddressToPeerId.set(sender.toString(), peerId);
      this.logger.info(
        `Successfully completed auth handshake with peer ${peerId}, validator address ${sender.toString()}`,
        logData,
      );
    } catch (err: any) {
      //TODO: maybe hard ban these peers in the future
      this.logger.warn(`Disconnecting peer ${peerId} due to error during auth handshake: ${err.message ?? err}`, {
        peerId,
      });
      await this.disconnectPeer(peerId);
    }
  }

  /**
   * Stops the peer manager.
   * Removing all event listeners.
   */
  public async stop() {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.peerDiscoveryService.off(PeerEvent.DISCOVERED, this.handlers.handleDiscoveredPeer);

    // Send goodbyes to all peers
    await Promise.all(
      this.libP2PNode.getPeers().map(peer => this.goodbyeAndDisconnectPeer(peer, GoodByeReason.SHUTDOWN)),
    );

    this.libP2PNode.removeEventListener(PeerEvent.CONNECTED, this.handlers.handleConnectedPeerEvent);
    this.libP2PNode.removeEventListener(PeerEvent.DISCONNECTED, this.handlers.handleDisconnectedPeerEvent);
  }

  private shouldTrustWithIdentity(peerId: PeerId): boolean {
    return this.isProtectedPeer(peerId);
  }

  /**
   * Performs auth request verification from peer. An auth request is valid if requested by an authorized peer (a peer we trust).
   *
   * @param: _authRequest - Auth request (unused)
   * @param: peerId - The ID of the peer that requested the auth handshake
   *
   * @returns: StatusMessage if peer is trusted
   *
   * @throws: If peer is unauthorized
   * */
  public async handleAuthRequestFromPeer(_authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage> {
    if (!this.shouldTrustWithIdentity(peerId)) {
      this.logger.warn(`Received auth request from untrusted peer ${peerId.toString()}`);
      throw new Error('Unauthorised');
    }
    this.logger.debug(`Received auth request from trusted peer ${peerId.toString()}`);
    return await this.createStatusMessage();
  }

  private async updateAuthenticatedPeers(): Promise<void> {
    const registeredValidators = await this.epochCache.getRegisteredValidators();
    const validatorSet = new Set(registeredValidators.map(v => v.toString()));

    const peersToDelete: Set<string> = new Set();
    const addressesToDelete: Set<string> = new Set();
    for (const [peer, address] of this.authenticatedPeerIdToValidatorAddress.entries()) {
      const addressString = address.toString();
      if (!validatorSet.has(addressString)) {
        peersToDelete.add(peer);
        addressesToDelete.add(addressString);
        this.logger.info(
          `Removing authentication for peer ${peer.toString()} at address ${addressString} due to no longer being a registered validator`,
        );
      }
    }

    for (const peer of peersToDelete) {
      this.authenticatedPeerIdToValidatorAddress.delete(peer);
    }
    for (const address of addressesToDelete) {
      this.authenticatedValidatorAddressToPeerId.delete(address);
    }
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
