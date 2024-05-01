import { createDebugLogger } from '@aztec/foundation/log';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';

// import { Discv5Discovery } from '@chainsafe/discv5';
import { type ENR } from '@chainsafe/enr';
import { type GossipsubEvents, gossipsub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
// import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';
import type {
  IncomingStreamData,
  PeerId,
  PubSub,
  /*Stream*/
} from '@libp2p/interface';
import { mplex } from '@libp2p/mplex';
import { peerIdFromString } from '@libp2p/peer-id';
import { tcp } from '@libp2p/tcp';
// import { multiaddr } from '@multiformats/multiaddr';
import { pipe } from 'it-pipe';
import { type Libp2p, createLibp2p } from 'libp2p';

import { type P2PConfig, getP2PConfigEnvVars } from './config.js';
import { AztecDatastore } from './service/data_store.js';
import { DiscV5Service } from './service/discV5_service.js';
import { createLibP2PPeerId } from './service/libp2p_service.js';

const { PRIVATE_KEY } = process.env;

const TEST_TOPIC = 'aztec_txs';

const logger = createDebugLogger('aztec:p2p_test_app_MAIN');

interface PubSubLibp2p extends Libp2p {
  services: {
    pubsub: PubSub<GossipsubEvents>;
  };
}

/**
 * This is a test app for P2P communication.
 */
export class P2PTestApp {
  // private messageInterval: NodeJS.Timeout | null = null;
  constructor(
    private libP2PNode: PubSubLibp2p,
    private discV5Node: DiscV5Service,
    // private peerStore: AztecPeerStore,
    private config: P2PConfig,
    private protocolId = '/aztec/1.0.0',
    private logger = createDebugLogger('aztec:p2p_test_app'),
  ) {}

  async start(): Promise<void> {
    if (this.libP2PNode.status === 'started') {
      throw new Error('Node already started');
    }

    this.logger.info(`Starting P2P node on ${this.config.tcpListenIp}:${this.config.tcpListenPort}`);
    this.logger.info(`External: ${`${this.config.announceHostname}/tcp/${this.config.announcePort}`}`);

    this.discV5Node.on('peer:discovered', (enr: ENR) => this.addPeer(enr));

    this.libP2PNode.addEventListener('peer:discovery', e => {
      this.logger.info(`Discovered peer: ${e.detail.id.toString()}`);
    });

    this.libP2PNode.addEventListener('peer:connect', async e => {
      const peerId = e.detail;
      await this.handleNewConnection(peerId);
    });

    this.libP2PNode.addEventListener('peer:disconnect', e => {
      const peerId = e.detail;
      this.handlePeerDisconnect(peerId);
    });

    await this.libP2PNode.handle(this.protocolId, async (incoming: IncomingStreamData) => {
      const { stream } = incoming;
      let msg = Buffer.alloc(0);
      try {
        await pipe(stream, async function (source) {
          for await (const chunk of source) {
            const payload = chunk.subarray();
            msg = Buffer.concat([msg, Buffer.from(payload)]);
          }
        });
        await stream.close();
      } catch {
        this.logger.error('Failed to handle incoming stream');
      }
      if (!msg.length) {
        this.logger.info(`Empty message received from peer ${incoming.connection.remotePeer}`);
      } else {
        this.logger.info(`\n\n MSG from peer ${incoming.connection.remotePeer}: ${msg.toString('hex')}\n\n`);
      }
    });

    await this.libP2PNode.start();

    this.libP2PNode.services.pubsub.addEventListener('gossipsub:message', e => {
      const { msg, msgId, propagationSource } = e.detail;
      this.logger.info(
        `Received PUBSUB message.
        Data: ${msg.data.toString()}
        ID: ${msgId}
        From ${propagationSource}
        Topic: ${msg.topic}`,
      );
    });

    this.subscribeToTopic(TEST_TOPIC);

    // Send some data to connected peers on test topic
    setInterval(async () => {
      try {
        await this.publishToTopic(TEST_TOPIC, Buffer.from('33'));
      } catch (err) {
        this.logger.error(`Failed to publish message: ${err}`);
      }
    }, 5000);
  }

  private async addPeer(enr: ENR) {
    const peerMultiAddr = await enr.getFullMultiaddr('tcp');
    if (!peerMultiAddr) {
      // No TCP address, can't connect
      return;
    }
    const peerIdStr = peerMultiAddr.getPeerId();

    if (!peerIdStr) {
      this.logger.error(`Peer ID not found in discovered node's multiaddr: ${peerMultiAddr}`);
      return;
    }

    // check if peer is already known
    const peerId = peerIdFromString(peerIdStr);
    const hasPeer = await this.libP2PNode?.peerStore?.has(peerId);

    // add to peer store if not already known
    if (!hasPeer) {
      this.logger.info(`Discovered peer ${(await enr.peerId()).toString()}. Adding to libp2p peer list`);
      try {
        const stream = await this.libP2PNode.dialProtocol(peerMultiAddr, this.protocolId);
        // await this.libP2PNode.peerStore.save(await enr.peerId(), enr);

        // dial successful, add to DB as well
        // if (!this.peerStore.getPeer(peerIdStr)) {
        // await this.peerStore.addPeer(peerIdStr, enr);
        // }
        await stream.close();
      } catch (err) {
        this.logger.error(`Failed to dial peer ${peerIdStr}`, err);
      }
    }
  }

  public static async new(peerId: PeerId, discV5: DiscV5Service, config: P2PConfig) {
    const bindAddrTcp = `/ip4/${config.tcpListenIp}/tcp/${config.tcpListenPort}/p2p/${peerId.toString()}`;
    // console.log('bindAddrTcp: ', bindAddrTcp);

    // const bootNodeMultiAddrs = (
    //   await Promise.all(
    //     config.bootstrapNodes.map(async enr => {
    //       const multiAddr = (await ENR.decodeTxt(enr).getFullMultiaddr('tcp'))?.toString();
    //       return multiAddr;
    //     }),
    //   )
    // ).filter((addr): addr is string => !!addr);

    // console.log('bootnode tcp multiaddrs: ', bootNodeMultiAddrs);

    const datastore = new AztecDatastore(AztecLmdbStore.open('p2p_test_app'));

    const libp2p = await createLibp2p({
      start: false,
      peerId,
      addresses: {
        listen: [bindAddrTcp],
      },
      transports: [
        tcp({
          maxConnections: config.maxPeerCount,
        }),
      ],
      datastore,
      streamMuxers: [yamux(), mplex()],
      connectionEncryption: [noise()],
      connectionManager: {
        maxConnections: config.maxPeerCount,
        minConnections: config.minPeerCount,
      },
      services: {
        identify: identify({ protocolPrefix: 'aztec' }),
        pubsub: gossipsub(),
        // components: (components: AztecComponents) => ({ datastore: components.datastore }),
      },
    });

    libp2p.services.pubsub;

    return new P2PTestApp(libp2p, discV5, config);
  }

  private subscribeToTopic(topic: string) {
    if (!this.libP2PNode.services.pubsub) {
      throw new Error('Pubsub service not available.');
    }
    this.libP2PNode.services.pubsub.subscribe(topic);
  }

  private async publishToTopic(topic: string, data: Uint8Array) {
    if (!this.libP2PNode.services.pubsub) {
      throw new Error('Pubsub service not available.');
    }
    await this.libP2PNode.services.pubsub.publish(topic, data);
  }

  private async handleNewConnection(peerId: PeerId) {
    this.logger.info(`Connected to peer: ${peerId.toString()}. Sending some data.`);
    await Promise.resolve();
    try {
      const stream = await this.libP2PNode.dialProtocol(peerId, this.protocolId);
      //   const dataToSend: Uint8Array = new Uint8Array([0x33]); // Example data
      //   await sendDataOverStream(stream, dataToSend);
      await stream.close();
    } catch (err) {
      this.logger.error(`Failed to dial peer ${peerId.toString()}`, err);
    }
  }

  private handlePeerDisconnect(peerId: PeerId) {
    this.logger.info(`Disconnected from peer: ${peerId.toString()}`);
    // TODO: consider better judgement for removing peers, e.g. try reconnecting
    // await this.peerStore.removePeer(peerId.toString());
  }
}

// async function sendDataOverStream(stream: Stream, data: Uint8Array): Promise<void> {
//   await pipe(toAsyncIterable(data), stream.sink);
// }

// // Convert data to an async iterable using an async generator function
// async function* toAsyncIterable(data: Uint8Array): AsyncIterable<Uint8Array> {
//   yield data;
// }

async function main() {
  // const peerDb = new AztecPeerDb(AztecLmdbStore.open(DATA_DIR));
  const peerId = await createLibP2PPeerId(PRIVATE_KEY);

  logger.info(`peerId: ${peerId.toString()}`);

  const config = getP2PConfigEnvVars();
  const discV5 = new DiscV5Service(peerId, config);
  const node = await P2PTestApp.new(peerId, discV5, /*peerDb,*/ config);

  await node.start();
  logger.info('LibP2P Node started');

  await discV5.start();
  logger.info('DiscV5 started');
}

main().catch(err => {
  logger.error('Error in test app: ', err);
});
