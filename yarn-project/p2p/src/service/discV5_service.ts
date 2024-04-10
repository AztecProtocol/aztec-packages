import { createDebugLogger } from '@aztec/foundation/log';

import { Discv5, type Discv5EventEmitter } from '@chainsafe/discv5';
import { type ENR, SignableENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';
import EventEmitter from 'events';

import type { P2PConfig } from '../config.js';
import type { PeerDiscoveryService } from './service.js';

export enum PeerDiscoveryState {
  RUNNING,
  STOPPED,
}

/**
 * Peer discovery service using Discv5.
 */
export class DiscV5Service extends EventEmitter implements PeerDiscoveryService {
  /** The Discv5 instance */
  private discv5: Discv5;

  /** This instance's ENR */
  private enr: SignableENR;

  /** The interval for checking for new peers */
  private discoveryInterval: NodeJS.Timeout | null = null;

  private currentState = PeerDiscoveryState.STOPPED;

  constructor(private peerId: PeerId, config: P2PConfig, private logger = createDebugLogger('aztec:discv5_service')) {
    super();
    const { announceHostname, tcpListenPort, udpListenIp, udpListenPort, bootstrapNodes } = config;
    // create ENR from PeerId
    this.enr = SignableENR.createFromPeerId(peerId);

    const multiAddrUdp = multiaddr(`${announceHostname}/udp/${udpListenPort}/p2p/${peerId.toString()}`);
    const multiAddrTcp = multiaddr(`${announceHostname}/tcp/${tcpListenPort}/p2p/${peerId.toString()}`);

    const listenMultiAddrUdp = multiaddr(`/ip4/${udpListenIp}/udp/${udpListenPort}`);

    // set location multiaddr in ENR record
    this.enr.setLocationMultiaddr(multiAddrUdp);
    this.enr.setLocationMultiaddr(multiAddrTcp);

    this.discv5 = Discv5.create({
      enr: this.enr,
      peerId,
      bindAddrs: { ip4: listenMultiAddrUdp },
      config: {
        lookupTimeout: 2000,
      },
    });

    this.logger.info(`ENR NodeId: ${this.enr.nodeId}`);
    this.logger.info(`ENR UDP: ${multiAddrUdp.toString()}`);

    (this.discv5 as Discv5EventEmitter).on('discovered', (enr: ENR) => this.onDiscovered(enr));
    (this.discv5 as Discv5EventEmitter).on('enrAdded', async (enr: ENR) => {
      this.logger.info(`ENR added: ${enr.encodeTxt()}`);
      const multiAddrTcp = await enr.getFullMultiaddr('tcp');
      const multiAddrUdp = await enr.getFullMultiaddr('udp');
      this.logger.info(`ENR multiaddr: ${multiAddrTcp?.toString()}, ${multiAddrUdp?.toString()}`);
    });

    (this.discv5 as Discv5EventEmitter).on('peer', (peerId: PeerId) => {
      this.logger.info(`peer: ${peerId}`);
    });

    // Add bootnode ENR if provided
    if (bootstrapNodes?.length) {
      this.logger.info(`Adding bootstrap ENRs: ${bootstrapNodes.join(', ')}`);
      try {
        bootstrapNodes.forEach(enr => {
          this.discv5.addEnr(enr);
        });
      } catch (e) {
        this.logger.error(`Error adding bootnode ENRs: ${e}`);
      }
    }
  }

  public async start(): Promise<void> {
    this.logger.info('Starting DiscV5');
    if (this.currentState === PeerDiscoveryState.RUNNING) {
      throw new Error('DiscV5Service already started');
    }
    await this.discv5.start();
    this.logger.info('DiscV5 started');
    this.currentState = PeerDiscoveryState.RUNNING;
    this.discoveryInterval = setInterval(async () => {
      await this.discv5.findRandomNode();
    }, 2000);
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

  public async stop(): Promise<void> {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }
    await this.discv5.stop();
    this.currentState = PeerDiscoveryState.STOPPED;
  }

  private onDiscovered(enr: ENR) {
    this.emit('peer:discovered', enr);
  }
}
