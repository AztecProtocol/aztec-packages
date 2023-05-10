import { Libp2p, createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { bootstrap } from '@libp2p/bootstrap';
import { kadDHT } from '@libp2p/kad-dht';
import { createEd25519PeerId, createFromProtobuf } from '@libp2p/peer-id-factory';
import { PeerId } from '@libp2p/interface-peer-id';
import { IncomingStreamData } from '@libp2p/interface-registrar';
import { P2PService } from './service.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { LibP2PPeer } from './libp2p_peer.js';
import { SerialQueue } from '@aztec/foundation/fifo';
import { P2PConfig } from '../config.js';
import { runInThisContext } from 'vm';

export class LibP2PService implements P2PService {
  readonly peers: { [key: string]: LibP2PPeer } = {};
  readonly jobQueue: SerialQueue = new SerialQueue();
  readonly protocol: string;
  constructor(
    private bootstrapNodes: string[],
    private node: Libp2p,
    protocolId: string,
    private logger = createDebugLogger('aztec:libp2p_service'),
  ) {
    this.protocol = `/aztec/tx/${protocolId}`;
  }

  public async start() {
    this.node.addEventListener('peer:discovery', evt => {
      this.logger('Discovered %s', evt.detail.id.toString()); // Log discovered peer
    });

    this.node.addEventListener('peer:connect', evt => {
      this.logger('Connected to %s', evt.detail.remotePeer.toString()); // Log connected peer
      void this.jobQueue.put(() => this.handleNewConnection(evt.detail.remotePeer));
    });

    this.node.addEventListener('peer:disconnect', evt => {
      this.logger('Disconnected from %s', evt.detail.remotePeer.toString()); // Log connected peer
      this.handleDisconnection(evt.detail.remotePeer);
    });
    this.jobQueue.start();
    await this.node.start();
    await this.node.handle(this.protocol, (incoming: IncomingStreamData) =>
      this.jobQueue.put(() => Promise.resolve(this.handleProtocolDial(incoming))),
    );
    this.logger(`Started P2P client with Peer ID ${this.node.peerId.toString()}`);
  }

  public async stop() {
    await this.jobQueue.end();
    await this.node.stop();
  }

  public static async new(config: P2PConfig) {
    const peerId = config.peerId
      ? await createFromProtobuf(Buffer.from(config.peerId, 'hex'))
      : await createEd25519PeerId();
    const node = await createLibp2p({
      peerId,
      nat: {
        enabled: true,
      },
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${config.tcpListenPort}`],
      },
      transports: [tcp()],
      connectionEncryption: [noise()],
      connectionManager: {
        minConnections: 2,
        maxConnections: 10,
      },
      streamMuxers: [mplex()],
      peerDiscovery: [
        bootstrap({
          list: config.bootstrapNodes,
          timeout: 1000, // in ms,
          tagName: 'bootstrap',
          tagValue: 50,
          tagTTL: 10000, // in ms
        }),
        kadDHT({
          protocolPrefix: 'aztec',
        }),
      ],
    });
    const protocolId = config.rollupContractAddress.toString().slice(2, 8);
    const service = new LibP2PService(config.bootstrapNodes, node, protocolId);
    await service.start();
    return service;
  }

  private async handleNewConnection(peerId: PeerId) {
    try {
      if (this.peers[peerId.toString()] !== undefined) {
        this.logger(`Not dialling peer at ${peerId.toString()} as we already have a connection`);
        return;
      }
      const peer = await LibP2PPeer.dial(this.node, peerId, this.protocol);
      this.peers[peerId.toString()] = peer;
      this.logger(`Dialled and stored peer at ${peerId.toString()}`);
    } catch (err) {
      this.logger(`Failed to dial peer at ${peerId.toString()} for protocol ${this.protocol}`);
    }
  }

  private handleDisconnection(peerId: PeerId) {
    delete this.peers[peerId.toString()];
  }

  private handleProtocolDial(incomingStreamData: IncomingStreamData) {
    const peerId: string = incomingStreamData.connection.remotePeer.toString();
    if (this.peers[peerId] === undefined) {
      this.peers[peerId] = new LibP2PPeer(incomingStreamData.connection.remotePeer, incomingStreamData.stream);
      this.logger(`Received dial from ${peerId}, created new peer`);
    } else {
      this.peers[peerId].addStream(incomingStreamData.stream);
      this.logger(`Received dial from ${peerId}, added stream to peer`);
    }
  }
}
