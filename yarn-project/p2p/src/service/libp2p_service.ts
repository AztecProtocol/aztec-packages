import { Libp2p, createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { mplex } from '@libp2p/mplex';
import { bootstrap } from '@libp2p/bootstrap';
import { kadDHT } from '@libp2p/kad-dht';
import { createEd25519PeerId, createFromProtobuf } from '@libp2p/peer-id-factory';
import { PeerId } from '@libp2p/interface-peer-id';
import { IncomingStreamData } from '@libp2p/interface-registrar';
import { P2PService } from './service.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/fifo';
import { P2PConfig } from '../config.js';
import { Tx } from '@aztec/types';
import { pipe } from 'it-pipe';
import { Messages, createTransactionsMessage, decodeTransactionsMessage } from './messages.js';

const INITIAL_PEER_REFRESH_INTERVAL = 60000;

/**
 * Lib P2P implementation of the P2PService interface.
 */
export class LibP2PService implements P2PService {
  private jobQueue: SerialQueue = new SerialQueue();
  private protocol: string;
  private callbacks: Array<(tx: Tx) => Promise<void>> = [];
  private timeout: NodeJS.Timer | undefined = undefined;
  constructor(
    private bootstrapNodes: string[],
    private node: Libp2p,
    protocolId: string,
    private logger = createDebugLogger('aztec:libp2p_service'),
  ) {
    this.protocol = `/aztec/tx/${protocolId}`;
  }

  /**
   * Starts the LibP2P service.
   * @returns An empty promise.
   */
  public async start() {
    this.node.addEventListener('peer:discovery', evt => {
      const peerId = evt.detail.id;
      if (this.isBootstrapPeer(peerId)) {
        this.logger(`Discovered bootstrap peer ${peerId.toString()}`);
      } else {
        this.logger(`Discovered transaction peer ${peerId.toString()}`);
      }
    });

    this.node.addEventListener('peer:connect', evt => {
      const peerId = evt.detail.remotePeer;
      if (this.isBootstrapPeer(peerId)) {
        this.logger(`Connected to bootstrap peer ${peerId.toString()}`);
      } else {
        this.logger(`Connected to transaction peer ${peerId.toString()}`);
      }
    });

    this.node.addEventListener('peer:disconnect', evt => {
      const peerId = evt.detail.remotePeer;
      if (this.isBootstrapPeer(peerId)) {
        this.logger(`Disconnect from bootstrap peer ${peerId.toString()}`);
      } else {
        this.logger(`Disconnected from transaction peer ${peerId.toString()}`);
      }
    });
    this.jobQueue.start();
    await this.node.start();
    await this.node.handle(this.protocol, (incoming: IncomingStreamData) =>
      this.jobQueue.put(() => Promise.resolve(this.handleProtocolDial(incoming))),
    );
    this.logger(`Started P2P client with Peer ID ${this.node.peerId.toString()}`);
    setTimeout(async () => {
      this.logger(`Refreshing routing table...`);
      await this.node.dht.refreshRoutingTable();
    }, INITIAL_PEER_REFRESH_INTERVAL);
  }

  /**
   * Stops the LibP2P service.
   * @returns An empty promise.
   */
  public async stop() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    await this.jobQueue.end();
    await this.node.stop();
  }

  /**
   * Creates an instance of the LibP2P service.
   * @param config - The configuration to use when creating the service.
   * @returns The new service.
   */
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
        minConnections: 10,
        maxConnections: 100,
      },
      dht: kadDHT({
        protocolPrefix: 'aztec',
      }),
      streamMuxers: [yamux(), mplex()],
      peerDiscovery: [
        bootstrap({
          list: config.bootstrapNodes,
        }),
      ],
    });
    const protocolId = config.transactionProtocol;
    const service = new LibP2PService(config.bootstrapNodes, node, protocolId);
    await service.start();
    return service;
  }

  /**
   * Propagates the provided transaction to peers.
   * @param tx - The transaction to propagate.
   */
  public propagateTx(tx: Tx): void {
    void this.jobQueue.put(() => Promise.resolve(this.sendTxToPeers(tx)));
  }

  /**
   * Registers a callback for the receipt of transactions from other peers.
   * @param handler - The handler to be called on new transactions.
   */
  public onNewTx(handler: (tx: Tx) => Promise<void>): void {
    this.callbacks.push(handler);
  }

  private async handleProtocolDial(incomingStreamData: IncomingStreamData) {
    await pipe(incomingStreamData.stream, async source => {
      for await (const msg of source) {
        const payload = msg.subarray();
        const encodedMessage = Buffer.from(payload);
        await this.processMessage(encodedMessage, incomingStreamData.connection.remotePeer);
      }
    });
    incomingStreamData.stream.close();
  }

  private async processMessage(message: Buffer, peerId: PeerId) {
    const type = message.readInt32BE(0);
    switch (type) {
      case Messages.TRANSACTIONS:
        await this.processReceivedTxs(decodeTransactionsMessage(message.subarray(4)), peerId);
        return;
    }
    throw new Error(`Unknown message type ${type}`);
  }

  private async processReceivedTxs(txs: Tx[], peerId: PeerId) {
    for (const tx of txs) {
      await this.processTxFromPeer(tx, peerId);
    }
  }

  private async processTxFromPeer(tx: Tx, peerId: PeerId): Promise<void> {
    this.logger(`Received tx ${(await tx.getTxHash()).toString()} from peer ${peerId.toString()}`);
    for (const callback of this.callbacks) {
      await callback(tx);
    }
  }

  private async sendTxToPeers(tx: Tx) {
    const txs = createTransactionsMessage([tx]);
    const payload = new Uint8Array(txs);
    const peers = this.getTxPeers();
    for (const peer of peers) {
      try {
        const stream = await this.node.dialProtocol(peer, this.protocol);
        await pipe([payload], stream);
        stream.close();
      } catch (err) {
        this.logger(`Failed to send to peer `, err);
        continue;
      }
    }
  }

  private getTxPeers() {
    return this.node.getPeers().filter(peer => !this.isBootstrapPeer(peer));
  }

  private isBootstrapPeer(peer: PeerId) {
    return this.bootstrapNodes.findIndex(bootstrap => bootstrap.includes(peer.toString())) != -1;
  }
}
