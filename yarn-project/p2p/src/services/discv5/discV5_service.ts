import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { type ComponentsVersions, checkCompressedComponentVersion } from '@aztec/stdlib/versioning';
import { OtelMetricsAdapter, type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';
import { type Multiaddr, multiaddr } from '@multiformats/multiaddr';
import { Discv5, type Discv5EventEmitter, type IDiscv5CreateOptions } from '@nethermindeth/discv5';
import { ENR, SignableENR } from '@nethermindeth/enr';
import EventEmitter from 'events';

import type { P2PConfig } from '../../config.js';
import { createNodeENR } from '../../enr/generate-enr.js';
import { AZTEC_ENR_KEY, Discv5Event, PeerEvent } from '../../types/index.js';
import { convertToMultiaddr } from '../../util.js';
import { type PeerDiscoveryService, PeerDiscoveryState } from '../service.js';
import { PersistedEnrStore } from './persisted_enr_store.js';

const delayBeforeStart = 2000; // 2sec

/** Upper bound on persisted peer ENRs, to keep the store bounded as peers churn. */
const MAX_PERSISTED_PEER_ENRS = 100;

/**
 * Peer discovery service using Discv5.
 */
export class DiscV5Service extends EventEmitter implements PeerDiscoveryService {
  /** The Discv5 instance */
  private discv5: Discv5EventEmitter;

  /** This instance's ENR */
  private enr: SignableENR;

  /** Version identifiers. */
  private versions: ComponentsVersions;

  private currentState = PeerDiscoveryState.STOPPED;

  private bootstrapNodePeerIds: PeerId[] = [];
  public bootstrapNodeEnrs: ENR[] = [];
  private trustedPeerEnrs: ENR[] = [];
  /** Node IDs of all config-provided peers (bootstrap, trusted, private); these are never persisted. */
  private readonly configProvidedNodeIds: Set<string>;

  private startTime = 0;

  private currentIp: string | undefined;

  /** Persistent store of discovered peer ENRs, used to re-seed discovery after a restart. */
  private readonly persistedEnrs?: PersistedEnrStore;

  private handlers = {
    onMultiaddrUpdated: this.onMultiaddrUpdated.bind(this),
    onPeerDiscovered: this.onPeerDiscovered.bind(this),
    onEnrAdded: this.onEnrAdded.bind(this),
  };

  constructor(
    private peerId: PeerId,
    private config: P2PConfig,
    private readonly packageVersion: string,
    telemetry: TelemetryClient = getTelemetryClient(),
    private logger = createLogger('p2p:discv5_service'),
    store?: AztecAsyncKVStore,
    configOverrides: Partial<IDiscv5CreateOptions> = {},
    private readonly dateProvider: DateProvider = new DateProvider(),
  ) {
    super();

    this.persistedEnrs = store
      ? new PersistedEnrStore(store, MAX_PERSISTED_PEER_ENRS, createLogger(`${this.logger.module}:enr-store`))
      : undefined;

    const { p2pIp, p2pPort, p2pBroadcastPort, bootstrapNodes, trustedPeers, privatePeers } = config;

    this.currentIp = p2pIp;
    this.bootstrapNodeEnrs = bootstrapNodes.map(x => ENR.decodeTxt(x));
    const privatePeerEnrs = new Set(privatePeers);
    this.trustedPeerEnrs = trustedPeers.filter(x => !privatePeerEnrs.has(x)).map(x => ENR.decodeTxt(x));
    // Peers supplied via config are re-injected from config on every start, so they must never end up
    // in the persisted (discovered-peer) store — private peers especially must not be written there.
    this.configProvidedNodeIds = new Set(
      [...bootstrapNodes, ...trustedPeers, ...privatePeers].map(x => ENR.decodeTxt(x).nodeId),
    );

    // If no overridden broadcast port is provided, use the p2p port as the broadcast port
    if (!p2pBroadcastPort) {
      this.logger.warn('No p2pBroadcastPort provided, using p2pPort as broadcast port');
      config.p2pBroadcastPort = p2pPort;
    }

    const bindAddrs: any = {
      ip4: multiaddr(convertToMultiaddr(config.listenAddress, p2pPort, 'udp')),
    };

    let multiAddrUdp, multiAddrTcp;
    if (p2pIp) {
      multiAddrTcp = multiaddr(
        `${convertToMultiaddr(p2pIp!, config.p2pBroadcastPort!, 'tcp')}/p2p/${peerId.toString()}`,
      );
      multiAddrUdp = multiaddr(
        `${convertToMultiaddr(p2pIp!, config.p2pBroadcastPort!, 'udp')}/p2p/${peerId.toString()}`,
      );
    }

    ({ enr: this.enr, versions: this.versions } = createNodeENR(
      peerId,
      multiAddrUdp,
      multiAddrTcp,
      config,
      this.packageVersion,
    ));

    const metricsRegistry = new OtelMetricsAdapter(telemetry, this.logger.getBindings());
    this.discv5 = Discv5.create({
      enr: this.enr,
      peerId,
      bindAddrs,
      config: {
        lookupTimeout: 2000,
        requestTimeout: 2000,
        allowUnverifiedSessions: true,
        enrUpdate: config.queryForIp || !p2pIp,
        pingInterval: config.queryForIp ? 10_000 : 300_000,
        ...configOverrides.config,
      },
      metricsRegistry,
    });

    // Hook onto the onEstablished method to check the peer's version from the ENR,
    // so we don't add it to our dht if it doesn't have the correct version.
    // In addition, we'll hook onto onDiscovered to to repeat the same check there,
    // just in case. Note that not adding the peer to the dht could lead to it
    // being "readded" constantly, we'll need to keep an eye on whether this
    // turns out to be a problem or not.
    const origOnEstablished = this.discv5.onEstablished.bind(this.discv5);
    this.discv5.onEstablished = (...args: unknown[]) => {
      const enr = args[1] as ENR;
      // A special case is for bootnodes. If this is a bootnode and we have been told to skip version checks
      // then proceed straight to handling the event
      if (!this.config.bootstrapNodeEnrVersionCheck && this.isOurBootnode(enr)) {
        return origOnEstablished(...args);
      }
      if (this.validateEnr(enr)) {
        return origOnEstablished(...args);
      }
    };

    this.discv5.on(Discv5Event.DISCOVERED, this.handlers.onPeerDiscovered);
    this.discv5.on(Discv5Event.ENR_ADDED, this.handlers.onEnrAdded);
    this.discv5.on(Discv5Event.MULTIADDR_UPDATED, this.handlers.onMultiaddrUpdated);
  }

  private onMultiaddrUpdated(m: Multiaddr) {
    const newIp = m.nodeAddress().address;
    const previousIp = this.currentIp;

    if (newIp === previousIp) {
      this.logger.debug('Discv5 confirmed current IP (no change)', { ip: newIp });
      return;
    }

    const multiAddrTcp = multiaddr(convertToMultiaddr(newIp, this.config.p2pBroadcastPort!, 'tcp'));
    this.enr.setLocationMultiaddr(multiAddrTcp);
    this.currentIp = newIp;

    if (previousIp) {
      this.logger.info('IP address changed, ENR updated', {
        previousIp,
        newIp,
        multiaddr: multiAddrTcp.toString(),
        enr: this.enr.encodeTxt(),
      });
    } else {
      this.logger.info('Initial IP discovered via discv5, ENR updated', {
        ip: newIp,
        multiaddr: multiAddrTcp.toString(),
        enr: this.enr.encodeTxt(),
      });
    }

    this.emit('ip:changed', newIp);
  }

  public async start(): Promise<void> {
    if (this.currentState === PeerDiscoveryState.RUNNING) {
      throw new Error('DiscV5Service already started');
    }
    this.logger.debug('Starting DiscV5');
    await this.discv5.start();
    this.startTime = this.dateProvider.now();

    const enrUpdateEnabled = this.config.queryForIp || !this.config.p2pIp;
    this.logger.info(`DiscV5 service started`, {
      nodeId: this.enr.nodeId,
      peerId: this.peerId,
      enrUdp: await this.enr.getFullMultiaddr('udp'),
      enrTcp: await this.enr.getFullMultiaddr('tcp'),
      versions: this.versions,
      enrUpdateEnabled,
      queryForIp: this.config.queryForIp,
      configuredIp: this.config.p2pIp ?? 'none',
      pingIntervalMs: this.config.queryForIp ? 10_000 : 300_000,
    });
    this.currentState = PeerDiscoveryState.RUNNING;

    // Add bootnode ENR if provided
    if (this.bootstrapNodeEnrs?.length) {
      // Do this conversion once since it involves an async function call
      this.bootstrapNodePeerIds = await Promise.all(this.bootstrapNodeEnrs.map(enr => enr.peerId()));
      this.logger.info(
        `Adding ${this.bootstrapNodeEnrs.length} bootstrap nodes ENRs: ${this.bootstrapNodeEnrs
          .map(enr => enr.encodeTxt())
          .join(', ')}`,
      );
      for (const enr of this.bootstrapNodeEnrs) {
        try {
          if (this.config.bootstrapNodeEnrVersionCheck) {
            const value = enr.kvs.get(AZTEC_ENR_KEY);
            if (!value) {
              throw new Error('ENR does not contain aztec key');
            }
            checkCompressedComponentVersion(Buffer.from(value).toString(), this.versions);
          }
          this.discv5.addEnr(enr);
        } catch (e) {
          this.logger.error(`Error adding bootratrap node ${enr.encodeTxt()}`, e);
        }
      }
    }

    // Add trusted peer ENRs if provided
    if (this.trustedPeerEnrs?.length) {
      this.logger.info(
        `Adding ${this.trustedPeerEnrs.length} trusted peer ENRs: ${this.trustedPeerEnrs
          .map(enr => enr.encodeTxt())
          .join(', ')}`,
      );
      for (const enr of this.trustedPeerEnrs) {
        this.discv5.addEnr(enr);
      }
    }

    // Re-seed discovery from peers persisted on previous runs. This lets a node rejoin the network
    // after a restart even when no bootstrap node is reachable: discv5 has no on-disk routing table,
    // so without this its DHT would start empty and rediscovery would depend on inbound dials alone.
    if (this.persistedEnrs) {
      // Drop peers that are now config-provided (re-injected above) or fail version checks.
      const enrs = await this.persistedEnrs.load(
        enr => this.validateEnr(enr) && !this.configProvidedNodeIds.has(enr.nodeId),
      );
      for (const enr of enrs) {
        try {
          this.discv5.addEnr(enr);
        } catch (err) {
          this.logger.debug(`Error re-seeding persisted ENR ${enr.nodeId}`, err);
        }
      }
      if (enrs.length > 0) {
        this.logger.info(`Re-seeded discovery with ${enrs.length} persisted peer ENRs`);
      }
    }
  }

  public async runRandomNodesQuery(): Promise<void> {
    if (this.currentState !== PeerDiscoveryState.RUNNING) {
      return;
    }

    // First, wait some time before starting the peer discovery
    // reference: https://github.com/ChainSafe/lodestar/issues/3423
    const msSinceStart = this.dateProvider.now() - this.startTime;
    if (this.dateProvider.now() - this.startTime <= delayBeforeStart) {
      await sleep(delayBeforeStart - msSinceStart);
    }

    try {
      await this.discv5.findRandomNode();
    } catch (err) {
      this.logger.error(`Error running discV5 random node query: ${err}`);
    }
  }

  public getKadValues(): ENR[] {
    return this.discv5.kadValues();
  }

  public getEnr(): ENR {
    return this.enr.toENR();
  }

  public getPeerId(): PeerId {
    return this.peerId;
  }

  public getStatus(): PeerDiscoveryState {
    return this.currentState;
  }

  public isBootstrapPeer(peerId: PeerId): boolean {
    return this.bootstrapNodePeerIds.some(node => node.equals(peerId));
  }

  public async stop(): Promise<void> {
    if (this.currentState !== PeerDiscoveryState.RUNNING) {
      return;
    }
    await this.discv5.off(Discv5Event.DISCOVERED, this.handlers.onPeerDiscovered);
    await this.discv5.off(Discv5Event.ENR_ADDED, this.handlers.onEnrAdded);
    await this.discv5.off(Discv5Event.MULTIADDR_UPDATED, this.handlers.onMultiaddrUpdated);

    await this.discv5.stop();

    this.currentState = PeerDiscoveryState.STOPPED;
  }

  private async onEnrAdded(enr: ENR) {
    try {
      const multiAddrTcp = await enr.getFullMultiaddr('tcp');
      const multiAddrUdp = await enr.getFullMultiaddr('udp');
      this.logger.debug(`Added ENR ${enr.encodeTxt()}`, { multiAddrTcp, multiAddrUdp, nodeId: enr.nodeId });
      // A peer just entered the routing table — persist it so we can re-seed discovery after a restart.
      if (this.persistedEnrs && this.shouldPersist(enr)) {
        await this.persistedEnrs.persist(enr);
      }
      this.onDiscovered(enr);
    } catch (err) {
      // A malformed ENR address field (e.g. a 3-byte TCP port) makes @nethermindeth/enr throw while
      // parsing the multiaddr. This is an async event listener, so an unhandled rejection would crash
      // the process — catch, log, and drop the ENR instead.
      this.logger.warn(`Dropping ENR with unparseable address`, { nodeId: enr.nodeId, err });
    }
  }

  private async onPeerDiscovered(enr: ENR) {
    // discv5 updates an existing routing-table entry on an ENR sequence bump without emitting enrAdded,
    // so DISCOVERED is our only signal that a peer we already track may have changed address. Refresh
    // the persisted copy (a no-op for peers we don't already store) so we don't keep dialing a stale ENR.
    if (this.persistedEnrs && this.shouldPersist(enr)) {
      await this.persistedEnrs.refresh(enr);
    }
    this.onDiscovered(enr);
  }

  /** Whether an ENR belongs in the persisted store: a validated, non-config peer that isn't ourselves. */
  private shouldPersist(enr: ENR): boolean {
    return !this.configProvidedNodeIds.has(enr.nodeId) && enr.nodeId !== this.enr.nodeId && this.validateEnr(enr);
  }

  private isOurBootnode(enr: ENR) {
    return this.bootstrapNodeEnrs.some(x => x.nodeId === enr.nodeId);
  }

  private onDiscovered(enr: ENR) {
    // Find out if this is one of our bootnodes
    if (this.isOurBootnode(enr)) {
      // it is, what we do here depends
      if (!this.config.bootstrapNodesAsFullPeers) {
        // we don't consider bootnodes as full peers, don't perform any checks and don't emit anything
        return;
      }
      if (!this.config.bootstrapNodeEnrVersionCheck) {
        // we do consider bootnodes to be full peers and we have been told to NOT version check them, so emit
        this.logger.trace(`Skipping version check for bootnode ${enr.nodeId}`);
        this.emit(PeerEvent.DISCOVERED, enr);
        return;
      }
      // here, we do consider bootnodes as full peers and we must version check so we continue to regular validation
    }
    if (this.validateEnr(enr)) {
      this.emit(PeerEvent.DISCOVERED, enr);
    }
  }

  private validateEnr(enr: ENR): boolean {
    // Check the peer is an aztec peer
    const value = enr.kvs.get(AZTEC_ENR_KEY);
    if (!value) {
      this.logger.debug(`Peer node ${enr.nodeId} does not have aztec key in ENR`);
      return false;
    }

    // A malformed TCP field (e.g. a non-2-byte port) makes @nethermindeth/enr throw while building the
    // multiaddr. Reject such an ENR here so it's never emitted as a full peer or re-parsed by an
    // unguarded listener (which would crash the process). A missing TCP addr is allowed — those peers
    // are simply skipped at dial time.
    try {
      enr.getLocationMultiaddr('tcp');
    } catch (err) {
      this.logger.debug(`Peer node ${enr.nodeId} has an unparseable TCP address`, { err });
      return false;
    }

    // And check it has the correct version
    let compressedVersion;
    try {
      compressedVersion = Buffer.from(value).toString();
      checkCompressedComponentVersion(compressedVersion, this.versions);
      return true;
    } catch (err: any) {
      if (err.name === 'ComponentsVersionsError') {
        this.logger.debug(`Peer node ${enr.nodeId} has incorrect version: ${err.message}`, {
          compressedVersion,
          expected: this.versions,
        });
      } else {
        this.logger.error(`Error checking peer version`, err);
      }
    }
    return false;
  }
}
