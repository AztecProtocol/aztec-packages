import { Libp2p, createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { kadDHT } from '@libp2p/kad-dht';
import { createEd25519PeerId, createFromProtobuf } from '@libp2p/peer-id-factory';
import { createDebugLogger } from '@aztec/foundation/log';

/**
 * Encapsulates a 'Bootstrap' node, used for the purpose of assisting new joiners in acquiring peers.
 */
export class BootstrapNode {
  private node?: Libp2p = undefined;

  constructor(private logger = createDebugLogger('aztec:p2p_bootstrap')) {}

  /**
   * Starts the bootstrap node.
   * @param tcpListenPort - The tcp port on which the bootstrap node should listen for connections.
   * @param peerIdPrivateKey - The private key to be used for generating the bootstrap nodes peer id.
   * @returns An empty promise.
   */
  public async start(tcpListenPort: number, peerIdPrivateKey: string) {
    const peerId = peerIdPrivateKey
      ? await createFromProtobuf(Buffer.from(peerIdPrivateKey, 'hex'))
      : await createEd25519PeerId();
    const node = await createLibp2p({
      peerId,
      dht: kadDHT({
        protocolPrefix: 'aztec',
      }),
      nat: {
        enabled: false,
      },
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${tcpListenPort ?? 0}`],
      },
      transports: [tcp()],
      connectionEncryption: [noise()],
      connectionManager: {
        minConnections: 100,
        maxConnections: 200,
      },
      streamMuxers: [mplex()],
    });
    await node.start();
    this.logger(`lib p2p has started`);

    // print out listening addresses
    this.logger('listening on addresses:');
    node.getMultiaddrs().forEach(addr => {
      this.logger(addr.toString());
    });

    node.addEventListener('peer:discovery', evt => {
      this.logger('Discovered %s', evt.detail.id.toString()); // Log discovered peer
    });

    node.addEventListener('peer:connect', evt => {
      this.logger('Connected to %s', evt.detail.remotePeer.toString()); // Log connected peer
    });

    node.addEventListener('peer:disconnect', evt => {
      this.logger('Disconnected from %s', evt.detail.remotePeer.toString()); // Log connected peer
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
}
