import { type ComponentsVersions, checkCompressedComponentVersion } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { OtelMetricsAdapter, type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { Discv5, type Discv5EventEmitter } from '@chainsafe/discv5';
import { ENR, SignableENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import { type Multiaddr, multiaddr } from '@multiformats/multiaddr';
import EventEmitter from 'events';

import type { P2PConfig } from '../../config.js';
import { convertToMultiaddr } from '../../util.js';
import { setAztecEnrKey } from '../../versioning.js';
import { type PeerDiscoveryService, PeerDiscoveryState } from '../service.js';
import { AZTEC_ENR_KEY, Discv5Event, PeerEvent } from '../types.js';

const delayBeforeStart = 2000; // 2sec

/**
 * Peer discovery service using Discv5.
 */
export class DiscV5Service extends EventEmitter implements PeerDiscoveryService {
  /** The Discv5 instance */
  private discv5: Discv5 & Discv5EventEmitter;

  /** This instance's ENR */
  private enr: SignableENR;

  /** Version identifiers. */
  private versions: ComponentsVersions;

  /** UDP listen addr */
  private listenMultiAddrUdp: Multiaddr;

  private currentState = PeerDiscoveryState.STOPPED;

  public readonly bootstrapNodes: string[] = [];
  private bootstrapNodePeerIds: PeerId[] = [];

  private startTime = 0;

  constructor(
    private peerId: PeerId,
    private config: P2PConfig,
    telemetry: TelemetryClient = getTelemetryClient(),
    private logger = createLogger('p2p:discv5_service'),
  ) {
    super();
    const { tcpAnnounceAddress, udpAnnounceAddress, udpListenAddress, bootstrapNodes } = config;
    this.bootstrapNodes = bootstrapNodes ?? [];
    // create ENR from PeerId
    this.enr = SignableENR.createFromPeerId(peerId);
    // Add aztec identification to ENR
    this.versions = setAztecEnrKey(this.enr, config);

    if (!tcpAnnounceAddress) {
      throw new Error('You need to provide at least a TCP announce address.');
    }

    const multiAddrTcp = multiaddr(`${convertToMultiaddr(tcpAnnounceAddress, 'tcp')}/p2p/${peerId.toString()}`);
    // if no udp announce address is provided, use the tcp announce address
    const multiAddrUdp = multiaddr(
      `${convertToMultiaddr(udpAnnounceAddress || tcpAnnounceAddress, 'udp')}/p2p/${peerId.toString()}`,
    );

    this.listenMultiAddrUdp = multiaddr(convertToMultiaddr(udpListenAddress, 'udp'));

    // set location multiaddr in ENR record
    this.enr.setLocationMultiaddr(multiAddrUdp);
    this.enr.setLocationMultiaddr(multiAddrTcp);

    const metricsRegistry = new OtelMetricsAdapter(telemetry);
    this.discv5 = Discv5.create({
      enr: this.enr,
      peerId,
      bindAddrs: { ip4: this.listenMultiAddrUdp },
      config: {
        lookupTimeout: 2000,
        requestTimeout: 2000,
        allowUnverifiedSessions: true,
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
      if (this.validateEnr(enr)) {
        return origOnEstablished(...args);
      }
    };

    this.discv5.on(Discv5Event.DISCOVERED, this.onDiscovered.bind(this));
    this.discv5.on(Discv5Event.ENR_ADDED, this.onEnrAdded.bind(this));
  }

  public async start(): Promise<void> {
    if (this.currentState === PeerDiscoveryState.RUNNING) {
      throw new Error('DiscV5Service already started');
    }
    this.logger.debug('Starting DiscV5');
    await this.discv5.start();
    this.startTime = Date.now();

    this.logger.info(`DiscV5 service started`, {
      nodeId: this.enr.nodeId,
      peerId: this.peerId,
      enrUdp: await this.enr.getFullMultiaddr('udp'),
      enrTcp: await this.enr.getFullMultiaddr('tcp'),
      versions: this.versions,
    });
    this.currentState = PeerDiscoveryState.RUNNING;

    // Add bootnode ENR if provided
    if (this.bootstrapNodes?.length) {
      // Do this conversion once since it involves an async function call
      const bootstrapNodesEnrs = this.bootstrapNodes.map(enr => ENR.decodeTxt(enr));
      this.bootstrapNodePeerIds = await Promise.all(bootstrapNodesEnrs.map(enr => enr.peerId()));
      this.logger.info(`Adding ${this.bootstrapNodes} bootstrap nodes ENRs: ${this.bootstrapNodes.join(', ')}`);
      for (const enr of bootstrapNodesEnrs) {
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
  }

  public async runRandomNodesQuery(): Promise<void> {
    if (this.currentState !== PeerDiscoveryState.RUNNING) {
      throw new Error('DiscV5Service not running');
    }

    // First, wait some time before starting the peer discovery
    // reference: https://github.com/ChainSafe/lodestar/issues/3423
    const msSinceStart = Date.now() - this.startTime;
    if (Date.now() - this.startTime <= delayBeforeStart) {
      await sleep(delayBeforeStart - msSinceStart);
    }

    try {
      await this.discv5.findRandomNode();
    } catch (err) {
      this.logger.error(`Error running discV5 random node query: ${err}`);
    }
  }

  public getAllPeers(): ENR[] {
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
    await this.discv5.off(Discv5Event.DISCOVERED, this.onDiscovered);
    await this.discv5.off(Discv5Event.ENR_ADDED, this.onEnrAdded);

    await this.discv5.stop();

    this.currentState = PeerDiscoveryState.STOPPED;
  }

  private async onEnrAdded(enr: ENR) {
    const multiAddrTcp = await enr.getFullMultiaddr('tcp');
    const multiAddrUdp = await enr.getFullMultiaddr('udp');
    this.logger.debug(`Added ENR ${enr.encodeTxt()}`, { multiAddrTcp, multiAddrUdp, nodeId: enr.nodeId });
    this.onDiscovered(enr);
  }

  private onDiscovered(enr: ENR) {
    if (this.validateEnr(enr)) {
      this.emit(PeerEvent.DISCOVERED, enr);
    }
  }

  private validateEnr(enr: ENR): boolean {
    // Check if the peer is actually a bootnode and we have disabled the version check
    if (
      !this.config.bootstrapNodeEnrVersionCheck &&
      this.bootstrapNodes.some(enrTxt => ENR.decodeTxt(enrTxt).nodeId === enr.nodeId)
    ) {
      this.logger.trace(`Skipping version check for bootnode ${enr.nodeId}`);
      return true;
    }

    // Check the peer is an aztec peer
    const value = enr.kvs.get(AZTEC_ENR_KEY);
    if (!value) {
      this.logger.warn(`Peer node ${enr.nodeId} does not have aztec key in ENR`);
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
        this.logger.warn(`Peer node ${enr.nodeId} has incorrect version: ${err.message}`, {
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
