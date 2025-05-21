import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { P2PBootstrapApi } from '@aztec/stdlib/interfaces/server';
import { OtelMetricsAdapter, type TelemetryClient } from '@aztec/telemetry-client';

import { Discv5, type Discv5EventEmitter } from '@chainsafe/discv5';
import { ENR, type SignableENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import { type Multiaddr, multiaddr } from '@multiformats/multiaddr';

import type { BootnodeConfig } from '../config.js';
import { createBootnodeENRandPeerId } from '../enr/generate-enr.js';
import { convertToMultiaddr, getPeerIdPrivateKey } from '../util.js';

/**
 * Encapsulates a 'Bootstrap' node, used for the purpose of assisting new joiners in acquiring peers.
 */
export class BootstrapNode implements P2PBootstrapApi {
  private node?: Discv5EventEmitter = undefined;
  private peerId?: PeerId;

  constructor(
    private store: AztecAsyncKVStore,
    private telemetry: TelemetryClient,
    private logger = createLogger('p2p:bootstrap'),
  ) {}

  /**
   * Starts the bootstrap node.
   * @param config - A partial P2P configuration. No need for TCP values as well as aztec node specific values.
   * @returns An empty promise.
   */
  public async start(config: BootnodeConfig) {
    const { p2pIp, p2pPort, listenAddress, p2pBroadcastPort } = config;
    if (!p2pIp) {
      throw new Error('You need to provide a P2P IP address.');
    }

    if (!p2pBroadcastPort) {
      config.p2pBroadcastPort = p2pPort;
    }

    const listenAddrUdp = multiaddr(convertToMultiaddr(listenAddress, config.p2pBroadcastPort!, 'udp'));

    const peerIdPrivateKey = await getPeerIdPrivateKey(config, this.store, this.logger);

    const { enr: ourEnr, peerId } = await createBootnodeENRandPeerId(
      peerIdPrivateKey,
      p2pIp,
      config.p2pBroadcastPort!,
      config.l1ChainId,
    );
    this.peerId = peerId;

    this.logger.debug(`Starting bootstrap node ${peerId} listening on ${listenAddrUdp.toString()}`);

    const metricsRegistry = new OtelMetricsAdapter(this.telemetry);
    this.node = Discv5.create({
      enr: ourEnr,
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
      this.logger.info('Starting bootnode');
      await this.node.start();
      this.logger.info('Bootstrap node started', {
        peerId,
        enr: ourEnr.encodeTxt(),
        addr: listenAddrUdp.toString(),
      });
    } catch (e) {
      this.logger.error('Error starting Discv5', e);
    }

    // Add bootnode ENRs if provided, making sure we filter our own
    if (config.bootstrapNodes?.length) {
      const otherBootnodeENRs = config.bootstrapNodes
        .map(x => ENR.decodeTxt(x))
        .filter(b => b.nodeId !== ourEnr.nodeId);
      this.logger.info(`Adding bootstrap nodes ENRs: ${otherBootnodeENRs.map(x => x.encodeTxt()).join(', ')}`);
      try {
        otherBootnodeENRs.forEach(enr => {
          this.node.addEnr(enr);
        });
      } catch (e) {
        this.logger.error(`Error adding bootnode ENRs: ${e}`);
      }
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
    return this.peerId!;
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
    return Promise.resolve(this.node!.kadValues().map((enr: ENR) => enr.encodeTxt()));
  }
}
