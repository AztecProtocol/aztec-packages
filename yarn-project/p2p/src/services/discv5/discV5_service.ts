import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { OtelMetricsAdapter, type TelemetryClient } from '@aztec/telemetry-client';

import { Discv5, type Discv5EventEmitter } from '@chainsafe/discv5';
import { ENR, SignableENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import { type Multiaddr, multiaddr } from '@multiformats/multiaddr';
import EventEmitter from 'events';

import type { P2PConfig } from '../../config.js';
import { convertToMultiaddr } from '../../util.js';
import { type PeerDiscoveryService, PeerDiscoveryState } from '../service.js';
import { AZTEC_ENR_KEY, AZTEC_NET, Discv5Event, PeerEvent } from '../types.js';

const delayBeforeStart = 2000; // 2sec

/**
 * Peer discovery service using Discv5.
 */
export class DiscV5Service extends EventEmitter implements PeerDiscoveryService {
  /** The Discv5 instance */
  private discv5: Discv5 & Discv5EventEmitter;

  /** This instance's ENR */
  private enr: SignableENR;

  /** UDP listen addr */
  private listenMultiAddrUdp: Multiaddr;

  private currentState = PeerDiscoveryState.STOPPED;

  private bootstrapNodes: string[];
  private bootstrapNodePeerIds: PeerId[] = [];

  private startTime = 0;

  constructor(
    private peerId: PeerId,
    config: P2PConfig,
    telemetry: TelemetryClient,
    private logger = createLogger('p2p:discv5_service'),
  ) {
    super();
    const { tcpAnnounceAddress, udpAnnounceAddress, udpListenAddress, bootstrapNodes } = config;
    this.bootstrapNodes = bootstrapNodes;
    // create ENR from PeerId
    this.enr = SignableENR.createFromPeerId(peerId);
    // Add aztec identification to ENR
    this.enr.set(AZTEC_ENR_KEY, Uint8Array.from([AZTEC_NET]));

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

    this.discv5.on(Discv5Event.DISCOVERED, (enr: ENR) => this.onDiscovered(enr));
    this.discv5.on(Discv5Event.ENR_ADDED, async (enr: ENR) => {
      const multiAddrTcp = await enr.getFullMultiaddr('tcp');
      const multiAddrUdp = await enr.getFullMultiaddr('udp');
      this.logger.debug(`Added ENR ${enr.encodeTxt()}`, { multiAddrTcp, multiAddrUdp, nodeId: enr.nodeId });
      this.onDiscovered(enr);
    });
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
    });
    this.currentState = PeerDiscoveryState.RUNNING;

    // Add bootnode ENR if provided
    if (this.bootstrapNodes?.length) {
      // Do this conversion once since it involves an async function call
      this.bootstrapNodePeerIds = await Promise.all(this.bootstrapNodes.map(enr => ENR.decodeTxt(enr).peerId()));
      this.logger.info(`Adding bootstrap nodes ENRs: ${this.bootstrapNodes.join(', ')}`);
      try {
        this.bootstrapNodes.forEach(enr => {
          this.discv5.addEnr(enr);
        });
      } catch (e) {
        this.logger.error(`Error adding bootnode ENRs: ${e}`);
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
    await this.discv5.stop();
    this.currentState = PeerDiscoveryState.STOPPED;
  }

  private onDiscovered(enr: ENR) {
    // check the peer is an aztec peer
    const value = enr.kvs.get(AZTEC_ENR_KEY);
    if (value) {
      const network = value[0];
      // check if the peer is on the same network
      if (network === AZTEC_NET) {
        this.emit(PeerEvent.DISCOVERED, enr);
      }
    }
  }
}
