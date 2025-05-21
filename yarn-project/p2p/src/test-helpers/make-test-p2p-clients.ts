import { MockL2BlockSource } from '@aztec/archiver/test';
import type { EpochCache } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { P2PClientType } from '@aztec/stdlib/p2p';

import { createP2PClient } from '../client/index.js';
import type { P2PClient } from '../client/p2p_client.js';
import type { P2PConfig } from '../config.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import { generatePeerIdPrivateKeys } from '../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from './get-ports.js';
import { makeEnrs } from './make-enrs.js';
import { AlwaysFalseCircuitVerifier, AlwaysTrueCircuitVerifier } from './reqresp-nodes.js';

interface MakeTestP2PClientOptions {
  mockAttestationPool: AttestationPool;
  mockTxPool: TxPool;
  mockEpochCache: EpochCache;
  mockWorldState: WorldStateSynchronizer;
  alwaysTrueVerifier?: boolean;
  p2pBaseConfig: P2PConfig;
  p2pConfigOverrides?: Partial<P2PConfig>;
  logger?: Logger;
}

/**
 * Creates a single P2P client for testing purposes.
 * @param peerIdPrivateKey - The private key of the peer.
 * @param port - The port to run the client on.
 * @param peers - The peers to connect to.
 * @param options - The options for the client.
 * @returns The created client.
 */
export async function makeTestP2PClient(
  peerIdPrivateKey: string,
  port: number,
  peers: string[],
  {
    alwaysTrueVerifier = true,
    p2pBaseConfig,
    p2pConfigOverrides = {},
    mockAttestationPool,
    mockTxPool,
    mockEpochCache,
    mockWorldState,
    logger = createLogger('p2p-test-client'),
  }: MakeTestP2PClientOptions,
) {
  // Filter nodes so that we only dial active peers

  const config: P2PConfig & DataStoreConfig = {
    ...p2pBaseConfig,
    p2pEnabled: true,
    peerIdPrivateKey,
    p2pIp: `127.0.0.1`,
    listenAddress: `127.0.0.1`,
    p2pPort: port,
    bootstrapNodes: peers,
    peerCheckIntervalMS: 1000,
    maxPeerCount: 10,
    bootstrapNodesAsFullPeers: true,
    ...p2pConfigOverrides,
  } as P2PConfig & DataStoreConfig;

  const l2BlockSource = new MockL2BlockSource();
  await l2BlockSource.createBlocks(100);

  const proofVerifier = alwaysTrueVerifier ? new AlwaysTrueCircuitVerifier() : new AlwaysFalseCircuitVerifier();
  const kvStore = await openTmpStore('test');
  const deps = {
    txPool: mockTxPool as unknown as TxPool,
    attestationPool: mockAttestationPool as unknown as AttestationPool,
    store: kvStore,
    logger,
  };
  const client = await createP2PClient(
    P2PClientType.Full,
    config,
    l2BlockSource,
    proofVerifier,
    mockWorldState,
    mockEpochCache,
    'test-p2p-client',
    undefined,
    deps,
  );
  await client.start();

  return client;
}

/**
 * Creates a number of P2P clients for testing purposes.
 * @param numberOfPeers - The number of clients to create.
 * @param options - The options for the clients.
 * @returns The created clients.
 */
export async function makeTestP2PClients(numberOfPeers: number, testConfig: MakeTestP2PClientOptions) {
  const clients: P2PClient[] = [];
  const peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfPeers);

  let ports = [];
  while (true) {
    try {
      ports = await getPorts(numberOfPeers);
      break;
    } catch {
      await sleep(1000);
    }
  }

  const peerEnrs = await makeEnrs(peerIdPrivateKeys, ports, testConfig.p2pBaseConfig);

  for (let i = 0; i < numberOfPeers; i++) {
    const client = await makeTestP2PClient(peerIdPrivateKeys[i], ports[i], peerEnrs, {
      ...testConfig,
      logger: createLogger(`p2p:${i}`),
    });
    clients.push(client);
  }

  await Promise.all(clients.map(client => client.isReady()));
  return clients.map((client, index) => {
    return {
      client,
      peerPrivateKey: peerIdPrivateKeys[index],
      port: ports[index],
      enr: peerEnrs[index],
    };
  });
}
