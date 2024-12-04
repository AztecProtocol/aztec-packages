import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import { OtelMetricsAdapter, type TelemetryClient } from '@aztec/telemetry-client';

import { Discv5, type Discv5EventEmitter } from '@chainsafe/discv5';
import { SignableENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import { type Multiaddr, multiaddr } from '@multiformats/multiaddr';

import type { BootnodeConfig } from '../config.js';
import { AZTEC_ENR_KEY, AZTEC_NET } from '../service/discV5_service.js';
import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey, getPeerIdPrivateKey } from '../util.js';

/**
 * Encapsulates a 'Bootstrap' node, used for the purpose of assisting new joiners in acquiring peers.
 */
export class BootstrapNode {
  private node?: Discv5 = undefined;
  private peerId?: PeerId;

  constructor(
    private store: AztecKVStore,
    private telemetry: TelemetryClient,
    private logger = createDebugLogger('aztec:p2p_bootstrap'),
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

    this.logger.info(`Starting bootstrap node ${peerId}, listening on ${listenAddrUdp.toString()}`);
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

    (this.node as Discv5EventEmitter).on('multiaddrUpdated', (addr: Multiaddr) => {
      this.logger.info('Advertised socket address updated', { addr: addr.toString() });
    });
    (this.node as Discv5EventEmitter).on('discovered', async (enr: SignableENR) => {
      const addr = await enr.getFullMultiaddr('udp');
      this.logger.verbose(`Discovered new peer, enr: ${enr.encodeTxt()}, addr: ${addr?.toString()}`);
    });

    try {
      await this.node.start();
      this.logger.info('Discv5 started');
    } catch (e) {
      this.logger.error('Error starting Discv5', e);
    }

    this.logger.info(`ENR:  ${this.node?.enr.encodeTxt()}`);
  }

  /**
   * Stops the bootstrap node.
   * @returns And empty promise.
   */
  public async stop() {
    // stop libp2p
    await this.node?.stop();
    this.logger.debug('Discv5 has stopped');
  }

  /**
   * Returns the peerId of this node.
   * @returns The node's peer Id
   */
  public getPeerId() {
    if (!this.peerId) {
      throw new Error('Node not started');
    }
    return this.peerId;
  }

  public getENR() {
    if (!this.node) {
      throw new Error('Node not started');
    }
    return this.node?.enr.toENR();
  }
}
