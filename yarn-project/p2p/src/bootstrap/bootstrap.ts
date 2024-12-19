import { type P2PBootstrapApi } from '@aztec/circuit-types/interfaces';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import { OtelMetricsAdapter, type TelemetryClient } from '@aztec/telemetry-client';

import { Discv5, type Discv5EventEmitter } from '@chainsafe/discv5';
import { SignableENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import { type Multiaddr, multiaddr } from '@multiformats/multiaddr';

import type { BootnodeConfig } from '../config.js';
import { AZTEC_ENR_KEY, AZTEC_NET } from '../services/discv5/discV5_service.js';
import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey, getPeerIdPrivateKey } from '../util.js';

/**
 * Encapsulates a 'Bootstrap' node, used for the purpose of assisting new joiners in acquiring peers.
 */
export class BootstrapNode implements P2PBootstrapApi {
  private node?: Discv5 & Discv5EventEmitter = undefined;
  private peerId?: PeerId;

  constructor(
    private store: AztecKVStore,
    private telemetry: TelemetryClient,
    private logger = createLogger('p2p:bootstrap'),
  ) {}

  /**
   * Starts the bootstrap node.
   * @param config - A partial P2P configuration. No need for TCP values as well as aztec node specific values.
   * @returns An empty promise.
   */
  public async start(config: BootnodeConfig) {
    const { udpListenAddress, udpAnnounceAddress } = config;

    const peerIdPrivateKey = await getPeerIdPrivateKey(config, this.store);
    const peerId = await createLibP2PPeerIdFromPrivateKey(peerIdPrivateKey);
    this.peerId = peerId;
    const enr = SignableENR.createFromPeerId(peerId);

    const listenAddrUdp = multiaddr(convertToMultiaddr(udpListenAddress, 'udp'));

    if (!udpAnnounceAddress) {
      throw new Error('You need to provide a UDP announce address.');
    }

    const publicAddr = multiaddr(convertToMultiaddr(udpAnnounceAddress, 'udp'));
    enr.setLocationMultiaddr(publicAddr);
    enr.set(AZTEC_ENR_KEY, Uint8Array.from([AZTEC_NET]));

    this.logger.debug(`Starting bootstrap node ${peerId} listening on ${listenAddrUdp.toString()}`);

    const metricsRegistry = new OtelMetricsAdapter(this.telemetry);
    this.node = Discv5.create({
      enr,
      peerId,
      bindAddrs: { ip4: listenAddrUdp },
      config: {
        lookupTimeout: 2000,
        allowUnverifiedSessions: true,
      },
      metricsRegistry,
    });

    this.node.on('multiaddrUpdated', (addr: Multiaddr) => {
      this.logger.info('Advertised socket address updated', { addr: addr.toString() });
    });
    this.node.on('discovered', async (enr: SignableENR) => {
      const addr = await enr.getFullMultiaddr('udp');
      this.logger.verbose(`Discovered new peer`, { enr: enr.encodeTxt(), addr: addr?.toString() });
    });

    try {
      await this.node.start();
      this.logger.info('Bootstrap node started', { peerId, enr: enr.encodeTxt(), addr: listenAddrUdp.toString() });
    } catch (e) {
      this.logger.error('Error starting Discv5', e);
    }
  }

  /**
   * Stops the bootstrap node.
   * @returns And empty promise.
   */
  public async stop() {
    // stop libp2p
    this.logger.debug('Stopping bootstrap node');
    await this.node?.stop();
    this.logger.info('Bootstrap node stopped');
  }

  private assertNodeStarted() {
    if (!this.node) {
      throw new Error('Node not started');
    }
  }

  private assertPeerId() {
    if (!this.peerId) {
      throw new Error('No peerId found');
    }
  }

  /**
   * Returns the peerId of this node.
   * @returns The node's peer Id
   */
  public getPeerId() {
    this.assertPeerId();
    return this.peerId;
  }

  public getENR() {
    this.assertNodeStarted();
    return this.node?.enr.toENR();
  }

  public getEncodedEnr() {
    this.assertNodeStarted();
    return Promise.resolve(this.node!.enr.encodeTxt());
  }

  public getRoutingTable() {
    this.assertNodeStarted();
    return Promise.resolve(this.node!.kadValues().map(enr => enr.encodeTxt()));
  }
}
