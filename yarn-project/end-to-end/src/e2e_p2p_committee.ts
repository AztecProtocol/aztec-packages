/**
 * An example e2e test where every node has validator responsibilities
 *
 * Spin up a p2p network where all of the nodes are connected to each other
 *
 * One of the nodes will send a small block of data (proposal) to all of the other nodes
 * - Each of the nodes will sign the data with an ecdsa signature
 * - The nodes will propagate the signatures
 * - The leader, who will be hardcoded in configuration will receive the signatures and validate that they came from the other nodes.
 */
import { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, DebugLogger, SentTx, createAztecNodeClient, sleep } from '@aztec/aztec.js';
import { BootstrapNode } from '@aztec/p2p';
import { createLibP2PPeerId } from '@aztec/p2p';
import { BootNodeConfig } from '@aztec/p2p';
import { PXEService } from '@aztec/pxe';

import fs from 'fs';

import { setup } from './fixtures/utils.js';

const NUM_NODES = 4;
const NUM_TXS_PER_BLOCK = 2;
const NUM_TXS_PER_NODE = 1;
const BOOT_NODE_UDP_PORT = 40400;

interface NodeContext {
  node: AztecNodeService;
  pxeService: PXEService;
  txs: SentTx[];
  account: AztecAddress;
}

// TODO(md): copied and pasted from the other p2p test
const PEER_ID_PRIVATE_KEYS = [
  '0802122002f651fd8653925529e3baccb8489b3af4d7d9db440cbf5df4a63ff04ea69683',
  '08021220c3bd886df5fe5b33376096ad0dab3d2dc86ed2a361d5fde70f24d979dc73da41',
  '080212206b6567ac759db5434e79495ec7458e5e93fe479a5b80713446e0bce5439a5655',
  '08021220366453668099bdacdf08fab476ee1fced6bf00ddc1223d6c2ee626e7236fb526',
];

describe('e2e_p2p_committee', () => {
  let config: AztecNodeConfig;
  let logger: DebugLogger;
  let teardown: () => Promise<void>;
  let bootstrapNode: BootstrapNode;
  let bootstrapNodeEnr: string;

  beforeEach(async () => {
    ({ teardown, config, logger } = await setup(0));
    bootstrapNode = await createBootstrapNode();
    bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();
  });

  afterEach(() => teardown());

  afterAll(() => {
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`./data-${i}`, { recursive: true, force: true });
    }
  });

  it('should sign proposal from peers', async () => {
    // TODO(md): turn reused logic into a suite
    if (!bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    let contexts: NodeContext[] = [];
    const nodes: AztecNodeService[] = [];
    for (let i = 0; i < NUM_NODES; i++) {
      // Place on consecutive ports
      //
      const node = await createAztecNodeClient(i + 1 + BOOT_NODE_UDP_PORT, bootstrapNodeEnr, i, `./data-${i}`);
      nodes.push(node);
    }

    // wait to let the peers discover each other
    await sleep(2000);

    // Create a proposal on one of the nodes
    // Get signatures from all of the other nodes
  });

  // TODO(md): copied from p2p e2e
  const createBootstrapNode = async () => {
    const peerId = await createLibP2PPeerId();
    const bootstrapNode = new BootstrapNode();
    const config: BootNodeConfig = {
      udpListenAddress: `0.0.0.0:${BOOT_NODE_UDP_PORT}`,
      udpAnnounceAddress: `127.0.0.1:${BOOT_NODE_UDP_PORT}`,
      peerIdPrivateKey: Buffer.from(peerId.privateKey!).toString('hex'),
      minPeerCount: 10,
      maxPeerCount: 100,
      p2pPeerCheckIntervalMS: 100,
    };
    await bootstrapNode.start(config);

    return bootstrapNode;
  };

  // TODO(md): copied from the p2p e2e
  // creates a P2P enabled instance of Aztec Node Service
  const createNode = async (
    tcpListenPort: number,
    bootstrapNode: string | undefined,
    publisherAddressIndex: number,
    dataDirectory?: string,
  ) => {
    // We use different L1 publisher accounts in order to avoid duplicate tx nonces. We start from
    // publisherAddressIndex + 1 because index 0 was already used during test environment setup.
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: publisherAddressIndex + 1 });
    const publisherPrivKey = Buffer.from(hdAccount.getHdKey().privateKey!);
    config.publisherPrivateKey = `0x${publisherPrivKey!.toString('hex')}`;

    const newConfig: AztecNodeConfig = {
      ...config,
      peerIdPrivateKey: PEER_ID_PRIVATE_KEYS[publisherAddressIndex],
      udpListenAddress: `0.0.0.0:${tcpListenPort}`,
      tcpListenAddress: `0.0.0.0:${tcpListenPort}`,
      tcpAnnounceAddress: `127.0.0.1:${tcpListenPort}`,
      udpAnnounceAddress: `127.0.0.1:${tcpListenPort}`,
      minTxsPerBlock: NUM_TXS_PER_BLOCK,
      maxTxsPerBlock: NUM_TXS_PER_BLOCK,
      p2pEnabled: true,
      p2pBlockCheckIntervalMS: 1000,
      p2pL2QueueSize: 1,
      transactionProtocol: '',
      dataDirectory,
      bootstrapNodes: bootstrapNode ? [bootstrapNode] : [],
    };
    return await AztecNodeService.createAndSync(
      newConfig,
      new NoopTelemetryClient(),
      createDebugLogger(`aztec:node-${tcpListenPort}`),
    );
  };
});
