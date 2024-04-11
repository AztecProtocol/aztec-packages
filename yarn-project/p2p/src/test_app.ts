import { AztecLmdbStore } from '@aztec/kv-store/lmdb';

import { type ENR } from '@chainsafe/enr';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import type { IncomingStreamData, PeerId, ServiceMap, Stream } from '@libp2p/interface';
import { mplex } from '@libp2p/mplex';
import { peerIdFromString } from '@libp2p/peer-id';
import { tcp } from '@libp2p/tcp';
import { pipe } from 'it-pipe';
import { type Libp2p, type Libp2pOptions, type ServiceFactoryMap, createLibp2p } from 'libp2p';

import { type P2PConfig, getP2PConfigEnvVars } from './config.js';
import { DiscV5Service } from './service/discV5_service.js';
import { createLibP2PPeerId } from './service/libp2p_service.js';
import { AztecPeerDb, type AztecPeerStore } from './service/peer_store.js';

const { PRIVATE_KEY, DATA_DIR } = process.env;

export class P2PTestApp {
  constructor(
    private libP2PNode: Libp2p,
    private discV5Node: DiscV5Service,
    private peerId: PeerId,
    private peerStore: AztecPeerStore,
    private config: P2PConfig,
    private protocolId = '/aztec/1.0.0',
  ) {}

  async start(): Promise<void> {
    if (this.libP2PNode.status === 'started') {
      throw new Error('Node already started');
    }

    console.log(`Starting P2P node on ${this.config.tcpListenIp}:${this.config.tcpListenPort}`);
    console.log(`External: ${`/${this.config.announceHostname}/tcp/${this.config.announceHostname}`}`);

    this.discV5Node.on('peer:discovered', this.addPeer);

    this.libP2PNode.addEventListener('peer:discovery', e => {
      console.log(`Discovered peer: ${e.detail.id.toString()}`);
    });

    this.libP2PNode.addEventListener('peer:connect', async e => {
      const peerId = e.detail;
      await this.handleNewConnection(peerId);
    });

    this.libP2PNode.addEventListener('peer:disconnect', async e => {
      const peerId = e.detail;
      await this.handlePeerDisconnect(peerId);
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
        console.error('Failed to handle incoming stream');
      }
      if (!msg.length) {
        console.log(`Empty message received from peer ${incoming.connection.remotePeer}`);
      }
      console.log(`\n\n MSG from peer ${incoming.connection.remotePeer}: ${msg.toString('hex')}\n\n`);
    });

    await this.libP2PNode.start();
  }

  private async addPeer(enr: ENR) {
    const peerMultiAddr = await enr.getFullMultiaddr('tcp');
    if (!peerMultiAddr) {
      // No TCP address, can't connect
      return;
    }
    const peerIdStr = peerMultiAddr.getPeerId();

    if (!peerIdStr) {
      console.log(`Peer ID not found in discovered node's multiaddr: ${peerMultiAddr}`);
      return;
    }

    // check if peer is already known
    const peerId = peerIdFromString(peerIdStr);
    const hasPeer = await this.libP2PNode.peerStore.has(peerId);

    // add to peer store if not already known
    if (!hasPeer) {
      console.log(`Discovered peer ${enr.peerId().toString()}. Adding to libp2p peer list`);
      try {
        const stream = await this.libP2PNode.dialProtocol(peerMultiAddr, this.protocolId);

        // dial successful, add to DB as well
        if (!this.peerStore.getPeer(peerIdStr)) {
          await this.peerStore.addPeer(peerIdStr, enr);
        }
        await stream.close();
      } catch (err) {
        console.error(`Failed to dial peer ${peerIdStr}`, err);
      }
    }
  }

  public static async new(peerId: PeerId, discV5: DiscV5Service, peerStore: AztecPeerStore, config: P2PConfig) {
    const bindAddrTcp = `/ip4/${config.tcpListenIp}/tcp/${config.tcpListenPort}/p2p/${peerId.toString()}`;

    const opts: Libp2pOptions<ServiceMap> = {
      start: false,
      peerId,
      addresses: {
        listen: [bindAddrTcp],
      },
      transports: [tcp()],
      streamMuxers: [yamux(), mplex()],
      connectionEncryption: [noise()],
    };

    const services: ServiceFactoryMap = {
      identify: identify({ protocolPrefix: 'aztec' }),
    };

    const libp2p = await createLibp2p({ ...opts, services });

    return new P2PTestApp(libp2p, discV5, peerId, peerStore, config);
  }

  private async handleNewConnection(peerId: PeerId) {
    console.log(`Connected to peer: ${peerId.toString()}. Sending some data.`);
    const stream = await this.libP2PNode.dialProtocol(peerId, this.protocolId);
    const dataToSend: Uint8Array = new Uint8Array([0x33]); // Example data

    await sendDataOverStream(stream, dataToSend);
    await stream.close();
  }

  private async handlePeerDisconnect(peerId: PeerId) {
    console.log(`Disconnected from peer: ${peerId.toString()}`);
    // TODO: consider better judgement for removing peers, e.g. try reconnecting
    await this.peerStore.removePeer(peerId.toString());
  }
}

async function sendDataOverStream(stream: Stream, data: Uint8Array): Promise<void> {
  await pipe(toAsyncIterable(data), stream.sink);
}

// Convert data to an async iterable using an async generator function
async function* toAsyncIterable(data: Uint8Array): AsyncIterable<Uint8Array> {
  yield data;
}

async function main() {
  const peerDb = new AztecPeerDb(AztecLmdbStore.open(DATA_DIR));
  const peerId = await createLibP2PPeerId(PRIVATE_KEY);

  console.log('peerId: ', peerId.toString());

  const config = getP2PConfigEnvVars();
  const discV5 = new DiscV5Service(peerId, config);
  const node = await P2PTestApp.new(peerId, discV5, peerDb, config);

  await node.start();
  console.log('LibP2P Node started');

  await discV5.start();
  console.log('DiscV5 started');
}

main().catch(err => {
  console.error('Error in test app: ', err);
});
