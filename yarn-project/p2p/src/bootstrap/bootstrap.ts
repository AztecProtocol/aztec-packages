import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { kadDHT } from '@libp2p/kad-dht';
import { createEd25519PeerId, createFromProtobuf } from '@libp2p/peer-id-factory';
import { createDebugLogger } from '@aztec/foundation/log';

const logger = createDebugLogger('aztec:bootstrap_node');

const { TCP_LISTEN_PORT, PEER_ID } = process.env;

async function main() {
  const peerId = PEER_ID ? await createFromProtobuf(Buffer.from(PEER_ID, 'hex')) : await createEd25519PeerId();
  //const proto = exportToProtobuf(peerId);
  const node = await createLibp2p({
    peerId,
    nat: {
      enabled: false,
    },
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${TCP_LISTEN_PORT ?? 0}`],
    },
    transports: [tcp()],
    connectionEncryption: [noise()],
    connectionManager: {
      minConnections: 2,
      maxConnections: 100,
    },
    streamMuxers: [mplex()],
    peerDiscovery: [
      kadDHT({
        protocolPrefix: 'aztec',
      }),
    ],
  });
  await node.start();
  logger(`lib p2p has started`);

  // print out listening addresses
  logger('listening on addresses:');
  node.getMultiaddrs().forEach(addr => {
    logger(addr.toString());
  });

  const stop = async () => {
    // stop libp2p
    await node.stop();
    logger('libp2p has stopped');
    process.exitCode = 0;
  };

  node.addEventListener('peer:discovery', evt => {
    logger('Discovered %s', evt.detail.id.toString()); // Log discovered peer
  });

  node.addEventListener('peer:connect', evt => {
    logger('Connected to %s', evt.detail.remotePeer.toString()); // Log connected peer
  });

  node.addEventListener('peer:disconnect', evt => {
    logger('Disconnected from %s', evt.detail.remotePeer.toString()); // Log connected peer
  });

  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch(err => {
  logger(err);
});
