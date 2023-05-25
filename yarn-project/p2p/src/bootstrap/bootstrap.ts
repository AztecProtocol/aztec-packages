import { Libp2p, Libp2pOptions, ServiceFactoryMap, createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { kadDHT } from '@libp2p/kad-dht';
import { createFromProtobuf } from '@libp2p/peer-id-factory';
import { createDebugLogger } from '@aztec/foundation/log';
import { P2PConfig } from '../config.js';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identifyService } from 'libp2p/identify';
import type { ServiceMap } from '@libp2p/interface-libp2p';
import { createLibP2PPeerId } from '../index.js';

/**
 * Encapsulates a 'Bootstrap' node, used for the purpose of assisting new joiners in acquiring peers.
 */
export class BootstrapNode {
  private node?: Libp2p = undefined;

  constructor(private logger = createDebugLogger('aztec:p2p_bootstrap')) {}

  /**
   * Starts the bootstrap node.
   * @param config - The P2P configuration.
   * @returns An empty promise.
   */
  public async start(config: P2PConfig) {
    const { peerIdPrivateKey, tcpListenIp, tcpListenPort, announceHostname, announcePort, minPeerCount, maxPeerCount } =
      config;
    const peerId = peerIdPrivateKey
      ? await createFromProtobuf(Buffer.from(peerIdPrivateKey, 'hex'))
      : await createLibP2PPeerId();
    this.logger(
      `Starting bootstrap node ${peerId} on ${tcpListenIp}:${tcpListenPort} announced at ${announceHostname}:${announcePort}`,
    );

    const opts: Libp2pOptions<ServiceMap> = {
      start: false,
      peerId,
      addresses: {
        listen: [`/ip4/${tcpListenIp}/tcp/${tcpListenPort}`],
        announce: [`/ip4/${announceHostname}/tcp/${announcePort ?? tcpListenPort}`],
      },
      transports: [tcp()],
      streamMuxers: [yamux(), mplex()],
      connectionEncryption: [noise()],
      connectionManager: {
        minConnections: minPeerCount,
        maxConnections: maxPeerCount,
      },
    };

    const services: ServiceFactoryMap = {
      identify: identifyService({
        protocolPrefix: 'aztec',
      }),
      kadDHT: kadDHT({
        protocolPrefix: 'aztec',
        clientMode: false,
      }),
    };

    this.node = await createLibp2p({
      ...opts,
      services,
    });

    await this.node.start();
    this.logger(`lib p2p has started`);

    // print out listening addresses
    this.logger('listening on addresses:');
    this.node.getMultiaddrs().forEach(addr => {
      this.logger(addr.toString());
    });

    this.node.addEventListener('peer:discovery', evt => {
      this.logger('Discovered %s', evt.detail.id.toString()); // Log discovered peer
    });

    this.node.addEventListener('peer:connect', evt => {
      this.logger('Connected to %s', evt.detail.toString()); // Log connected peer
    });

    this.node.addEventListener('peer:disconnect', evt => {
      this.logger('Disconnected from %s', evt.detail.toString()); // Log connected peer
    });
  }

  /**
   * Stops the bootstrap node.
   * @returns And empty promise.
   */
  public async stop() {
    // stop libp2p
    await this.node?.stop();
    this.logger('libp2p has stopped');
  }

  /**
   * Returns the peerId of this node.
   * @returns The node's peer Id
   */
  public getPeerId() {
    return this.node?.peerId;
  }
}
