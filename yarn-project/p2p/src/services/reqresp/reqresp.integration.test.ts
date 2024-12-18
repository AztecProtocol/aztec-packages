// An integration test for the p2p client to test req resp protocols
import { MockL2BlockSource } from '@aztec/archiver/test';
import {
  type ClientProtocolCircuitVerifier,
  type EpochProofQuoteHasher,
  P2PClientType,
  PeerErrorSeverity,
  type Tx,
  type WorldStateSynchronizer,
  mockTx,
} from '@aztec/circuit-types';
import { type EpochCache } from '@aztec/epoch-cache';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type AztecKVStore } from '@aztec/kv-store';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb';

import { SignableENR } from '@chainsafe/enr';
import { describe, expect, it, jest } from '@jest/globals';
import { multiaddr } from '@multiformats/multiaddr';
import getPort from 'get-port';
import { type MockProxy, mock } from 'jest-mock-extended';
import { generatePrivateKey } from 'viem/accounts';

import { createP2PClient } from '../../client/index.js';
import { type P2PClient } from '../../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import { type AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import { type EpochProofQuotePool } from '../../mem_pools/epoch_proof_quote_pool/epoch_proof_quote_pool.js';
import { type TxPool } from '../../mem_pools/tx_pool/index.js';
import { AlwaysFalseCircuitVerifier, AlwaysTrueCircuitVerifier } from '../../mocks/index.js';
import { AZTEC_ENR_KEY, AZTEC_NET } from '../../services/types.js';
import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey } from '../../util.js';

const TEST_TIMEOUT = 80000;

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
  let txPool: MockProxy<TxPool>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochProofQuotePool: MockProxy<EpochProofQuotePool>;
  let epochCache: MockProxy<EpochCache>;
  let epochProofQuoteHasher: MockProxy<EpochProofQuoteHasher>;
  let l2BlockSource: MockL2BlockSource;
  let kvStore: AztecKVStore;
  let worldState: WorldStateSynchronizer;
  let proofVerifier: ClientProtocolCircuitVerifier;
  const logger = createLogger('p2p:test:client-integration');

  beforeEach(() => {
    txPool = mock<TxPool>();
    attestationPool = mock<AttestationPool>();
    epochProofQuotePool = mock<EpochProofQuotePool>();
    epochCache = mock<EpochCache>();
    epochProofQuoteHasher = mock<EpochProofQuoteHasher>();

    txPool.getAllTxs.mockImplementation(() => {
      return [] as Tx[];
    });
  });

  const getPorts = (numberOfPeers: number) => Promise.all(Array.from({ length: numberOfPeers }, () => getPort()));

  const createClients = async (numberOfPeers: number, alwaysTrueVerifier: boolean = true): Promise<P2PClient[]> => {
    const clients: P2PClient[] = [];
    const peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfPeers);

    const ports = await getPorts(numberOfPeers);

    const peerEnrs = await Promise.all(
      peerIdPrivateKeys.map(async (pk, i) => {
        const peerId = await createLibP2PPeerIdFromPrivateKey(pk);
        const enr = SignableENR.createFromPeerId(peerId);

        const udpAnnounceAddress = `127.0.0.1:${ports[i]}`;
        const tcpAnnounceAddress = `127.0.0.1:${ports[i]}`;
        const udpPublicAddr = multiaddr(convertToMultiaddr(udpAnnounceAddress, 'udp'));
        const tcpPublicAddr = multiaddr(convertToMultiaddr(tcpAnnounceAddress, 'tcp'));

        // ENRS must include the network and a discoverable address (udp for discv5)
        enr.set(AZTEC_ENR_KEY, Uint8Array.from([AZTEC_NET]));
        enr.setLocationMultiaddr(udpPublicAddr);
        enr.setLocationMultiaddr(tcpPublicAddr);

        return enr.encodeTxt();
      }),
    );

    for (let i = 0; i < numberOfPeers; i++) {
      // Note these bindings are important
      const addr = `127.0.0.1:${ports[i]}`;
      const listenAddr = `0.0.0.0:${ports[i]}`;

      // Filter nodes so that we only dial active peers
      const otherNodes = peerEnrs.filter((_, ind) => ind < i);

      const config: P2PConfig & DataStoreConfig = {
        ...getP2PDefaultConfig(),
        p2pEnabled: true,
        peerIdPrivateKey: peerIdPrivateKeys[i],
        tcpListenAddress: listenAddr, // run on port 0
        udpListenAddress: listenAddr,
        tcpAnnounceAddress: addr,
        udpAnnounceAddress: addr,
        bootstrapNodes: [...otherNodes],
        peerCheckIntervalMS: 1000,
        minPeerCount: 1,
        maxPeerCount: 10,
      } as P2PConfig & DataStoreConfig;

      l2BlockSource = new MockL2BlockSource();
      l2BlockSource.createBlocks(100);

      proofVerifier = alwaysTrueVerifier ? new AlwaysTrueCircuitVerifier() : new AlwaysFalseCircuitVerifier();
      kvStore = openTmpStore();
      const deps = {
        txPool: txPool as unknown as TxPool,
        attestationPool: attestationPool as unknown as AttestationPool,
        epochProofQuotePool: epochProofQuotePool as unknown as EpochProofQuotePool,
        store: kvStore,
      };
      const client = await createP2PClient(
        P2PClientType.Full,
        config,
        l2BlockSource,
        proofVerifier,
        worldState,
        epochCache,
        epochProofQuoteHasher,
        undefined,
        deps,
      );

      await client.start();
      clients.push(client);

      logger.info(`Creating client ${i}`);
    }

    logger.info(`Created ${NUMBER_OF_PEERS} clients`);
    await Promise.all(clients.map(client => client.isReady()));
    logger.info(`Clients ready`);
    return clients;
  };

  // Shutdown all test clients
  const shutdown = async (clients: P2PClient[]) => {
    await Promise.all([...clients.map(client => client.stop())]);
    await sleep(1000);
  };

  it(
    'Returns undefined if unable to find a transaction from another peer',
    async () => {
      // We want to create a set of nodes and request transaction from them
      // Not using a before each as a the wind down is not working as expected
      const clients = await createClients(NUMBER_OF_PEERS);
      const [client1] = clients;

      await sleep(2000);

      // Perform a get tx request from client 1
      const tx = mockTx();
      const txHash = tx.getTxHash();

      const requestedTx = await client1.requestTxByHash(txHash);
      expect(requestedTx).toBeUndefined();

      // await shutdown(clients, bootstrapNode);
      await shutdown(clients);
    },
    TEST_TIMEOUT,
  );

  it(
    'Can request a transaction from another peer',
    async () => {
      // We want to create a set of nodes and request transaction from them
      const clients = await createClients(NUMBER_OF_PEERS);
      const [client1] = clients;

      // Give the nodes time to discover each other
      await sleep(6000);

      // Perform a get tx request from client 1
      const tx = mockTx();
      const txHash = tx.getTxHash();
      // Mock the tx pool to return the tx we are looking for
      txPool.getTxByHash.mockImplementationOnce(() => tx);

      const requestedTx = await client1.requestTxByHash(txHash);

      // Expect the tx to be the returned tx to be the same as the one we mocked
      expect(requestedTx?.toBuffer()).toStrictEqual(tx.toBuffer());

      await shutdown(clients);
    },
    TEST_TIMEOUT,
  );

  it(
    'Will penalize peers that send invalid proofs',
    async () => {
      // We want to create a set of nodes and request transaction from them
      const clients = await createClients(NUMBER_OF_PEERS, /*valid proofs*/ false);
      const [client1, client2] = clients;
      const client2PeerId = await client2.getEnr()!.peerId();

      // Give the nodes time to discover each other
      await sleep(6000);

      const penalizePeerSpy = jest.spyOn((client1 as any).p2pService.peerManager, 'penalizePeer');

      // Perform a get tx request from client 1
      const tx = mockTx();
      const txHash = tx.getTxHash();

      // Return the correct tx with an invalid proof -> active attack
      txPool.getTxByHash.mockImplementationOnce(() => tx);

      const requestedTx = await client1.requestTxByHash(txHash);
      // Even though we got a response, the proof was deemed invalid
      expect(requestedTx).toBeUndefined();

      // Low tolerance error is due to the invalid proof
      expect(penalizePeerSpy).toHaveBeenCalledWith(client2PeerId, PeerErrorSeverity.LowToleranceError);

      await shutdown(clients);
    },
    TEST_TIMEOUT,
  );

  it(
    'Will penalize peers that send the wrong transaction',
    async () => {
      // We want to create a set of nodes and request transaction from them
      const clients = await createClients(NUMBER_OF_PEERS, /*Valid proofs*/ true);
      const [client1, client2] = clients;
      const client2PeerId = (await client2.getEnr()?.peerId())!;

      // Give the nodes time to discover each other
      await sleep(6000);

      const penalizePeerSpy = jest.spyOn((client1 as any).p2pService.peerManager, 'penalizePeer');

      // Perform a get tx request from client 1
      const tx = mockTx();
      const txHash = tx.getTxHash();
      const tx2 = mockTx(420);

      // Return an invalid tx
      txPool.getTxByHash.mockImplementationOnce(() => tx2);

      const requestedTx = await client1.requestTxByHash(txHash);
      // Even though we got a response, the proof was deemed invalid
      expect(requestedTx).toBeUndefined();

      // Received wrong tx
      expect(penalizePeerSpy).toHaveBeenCalledWith(client2PeerId, PeerErrorSeverity.MidToleranceError);

      await shutdown(clients);
    },
    TEST_TIMEOUT,
  );
});
