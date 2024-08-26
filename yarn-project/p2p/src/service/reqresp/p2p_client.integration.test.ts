// An integration test for the p2p client to test req resp protocols
import { mockTx } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { generatePrivateKey } from 'viem/accounts';

import { type AttestationPool } from '../../attestation_pool/attestation_pool.js';
import { BootstrapNode } from '../../bootstrap/bootstrap.js';
import { createP2PClient } from '../../client/index.js';
import { MockBlockSource } from '../../client/mocks.js';
import { type P2PClient } from '../../client/p2p_client.js';
import { type BootnodeConfig, type P2PConfig } from '../../config.js';
import { type TxPool } from '../../tx_pool/index.js';
import { createLibP2PPeerId } from '../index.js';

// TODO: copied from external
/**
 * Mockify helper for testing purposes.
 */
type Mockify<T> = {
  [P in keyof T]: ReturnType<typeof jest.fn>;
};

const BEFORE_EACH_TIMEOUT = 60000;

const BOOT_NODE_UDP_PORT = 40400;
async function createBootstrapNode(port: number) {
  const peerId = await createLibP2PPeerId();
  const bootstrapNode = new BootstrapNode();
  const config: BootnodeConfig = {
    udpListenAddress: `0.0.0.0:${port}`,
    udpAnnounceAddress: `127.0.0.1:${port}`,
    peerIdPrivateKey: Buffer.from(peerId.privateKey!).toString('hex'),
    minPeerCount: 1,
    maxPeerCount: 100,
  };
  await bootstrapNode.start(config);

  return bootstrapNode;
}

function generatePeerIdPrivateKeys(numberOfPeers: number): string[] {
  const peerIdPrivateKeys: string[] = [];
  for (let i = 0; i < numberOfPeers; i++) {
    // magic number is multiaddr prefix: https://multiformats.io/multiaddr/
    peerIdPrivateKeys.push('08021220' + generatePrivateKey().substr(2, 66));
  }
  return peerIdPrivateKeys;
}

const NUMBER_OF_PEERS = 2;

describe('Req Resp p2p client integration', () => {
  let txPool: Mockify<TxPool>;
  let attestationPool: Mockify<AttestationPool>;
  let blockSource: MockBlockSource;
  let kvStore: AztecKVStore;
  const clients: P2PClient[] = [];
  const logger = createDebugLogger('p2p-client-integration-test');

  let bootstrapNode: BootstrapNode;

  // This test differs from the traditional p2p client test as we do not mock out
  // the p2p client's functionality, as we need it to connect to peers and exchange
  // information
  beforeEach(async () => {
    bootstrapNode = await createBootstrapNode(BOOT_NODE_UDP_PORT);
    const bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();
    logger.info(`Created bootstrap node with enr: ${bootstrapNodeEnr}`);

    const createClients = async (numberOfPeers: number) => {
      const peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfPeers);
      for (let i = 0; i < numberOfPeers; i++) {
        // Note these bindings are important
        const addr = `127.0.0.1:${i + 1 + BOOT_NODE_UDP_PORT}`;
        const listenAddr = `0.0.0.0:${i + 1 + BOOT_NODE_UDP_PORT}`;
        const config: P2PConfig = {
          p2pEnabled: true,
          peerIdPrivateKey: peerIdPrivateKeys[i],
          tcpListenAddress: listenAddr, // run on port 0
          udpListenAddress: listenAddr,
          tcpAnnounceAddress: addr,
          udpAnnounceAddress: addr,
          l2QueueSize: 1,
          bootstrapNodes: [bootstrapNodeEnr],
          blockCheckIntervalMS: 1000,
          peerCheckIntervalMS: 1000,
          transactionProtocol: '',
          minPeerCount: 1,
          maxPeerCount: 10,
          keepProvenTxsInPoolFor: 0,
          queryForIp: false,
        };

        txPool = {
          addTxs: jest.fn(() => {}),
          getTxByHash: jest.fn().mockReturnValue(undefined),
          deleteTxs: jest.fn(),
          getAllTxs: jest.fn().mockReturnValue([]),
          getAllTxHashes: jest.fn().mockReturnValue([]),
          getMinedTxHashes: jest.fn().mockReturnValue([]),
          getPendingTxHashes: jest.fn().mockReturnValue([]),
          getTxStatus: jest.fn().mockReturnValue(undefined),
          markAsMined: jest.fn(),
        };

        attestationPool = {
          addAttestations: jest.fn(),
          deleteAttestations: jest.fn(),
          deleteAttestationsForSlot: jest.fn(),
          getAttestationsForSlot: jest.fn().mockReturnValue(undefined),
        };

        blockSource = new MockBlockSource();
        kvStore = openTmpStore();
        const client = await createP2PClient(
          config,
          kvStore,
          txPool as unknown as TxPool,
          attestationPool as unknown as AttestationPool,
          blockSource,
        );

        await client.start();
        clients.push(client);

        logger.info(`Creating client ${i}`);
      }

      logger.info(`Created ${NUMBER_OF_PEERS} clients`);
    };

    await createClients(NUMBER_OF_PEERS);
  }, BEFORE_EACH_TIMEOUT);

  afterEach(async () => {
    // Make sure all clients are stopped
    await Promise.all(clients.map(client => client.stop()));
    logger.info(`Stopped nodes`);

    await bootstrapNode.stop();
    logger.info(`Stopped bootstrap node`);

    await sleep(5000);
  });

  it('Returns undefined if unable to find a transaction from another peer', async () => {
    // We want to create a set of nodes and request transaction from them
    const [client1] = clients;

    await sleep(2000);

    // Perform a get tx request from client 1
    const tx = mockTx();
    const txHash = tx.getTxHash();

    const requestedTx = await client1.requestTxByHash(txHash);
    expect(requestedTx).toBeUndefined();
  });

  it('Can request a transaction from another peer', async () => {
    // We want to create a set of nodes and request transaction from them
    const [client1] = clients;

    // Doubly make sure we started
    await Promise.all(clients.map(client => client.start()));

    // Give the nodes time to discover each other
    await sleep(5000);

    // Perform a get tx request from client 1
    const tx = mockTx();
    const txHash = tx.getTxHash();
    // Mock the tx pool to return the tx we are looking for
    txPool.getTxByHash.mockImplementationOnce(() => tx);

    const requestedTx = await client1.requestTxByHash(txHash);

    // Expect the tx to be the returned tx to be the same as the one we mocked
    expect(requestedTx?.toBuffer()).toStrictEqual(tx.toBuffer());
  });
});
