// An integration test for the p2p client to test req resp protocols
import { MockL2BlockSource } from '@aztec/archiver/test';
import {
  type ClientProtocolCircuitVerifier,
  P2PClientType,
  PeerErrorSeverity,
  type Tx,
  type WorldStateSynchronizer,
  mockTx,
} from '@aztec/circuit-types';
import { type EpochCache } from '@aztec/epoch-cache';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type AztecAsyncKVStore } from '@aztec/kv-store';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { SignableENR } from '@chainsafe/enr';
import { describe, expect, it, jest } from '@jest/globals';
import { multiaddr } from '@multiformats/multiaddr';
import { fork } from 'child_process';
import getPort from 'get-port';
import { type MockProxy, mock } from 'jest-mock-extended';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePrivateKey } from 'viem/accounts';

import { createP2PClient } from '../client/index.js';
import { type P2PClient } from '../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { type EpochProofQuotePool } from '../mem_pools/epoch_proof_quote_pool/epoch_proof_quote_pool.js';
import { type TxPool } from '../mem_pools/tx_pool/index.js';
import { AlwaysFalseCircuitVerifier, AlwaysTrueCircuitVerifier } from '../mocks/index.js';
import { AZTEC_ENR_KEY, AZTEC_NET } from '../services/types.js';
import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey } from '../util.js';

const TEST_TIMEOUT = 80000;

function generatePeerIdPrivateKeys(numberOfPeers: number): string[] {
  const peerIdPrivateKeys: string[] = [];
  for (let i = 0; i < numberOfPeers; i++) {
    // magic number is multiaddr prefix: https://multiformats.io/multiaddr/
    peerIdPrivateKeys.push('08021220' + generatePrivateKey().slice(2, 68));
  }
  return peerIdPrivateKeys;
}

const NUMBER_OF_PEERS = 2;

describe('p2p client integration', () => {
  let txPool: MockProxy<TxPool>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochProofQuotePool: MockProxy<EpochProofQuotePool>;
  let epochCache: MockProxy<EpochCache>;
  let l2BlockSource: MockL2BlockSource;
  let kvStore: AztecAsyncKVStore;
  let worldState: WorldStateSynchronizer;
  let proofVerifier: ClientProtocolCircuitVerifier;
  const logger = createLogger('p2p:test:client-integration');

  let clients: P2PClient[] = [];

  beforeEach(() => {
    txPool = mock<TxPool>();
    attestationPool = mock<AttestationPool>();
    epochProofQuotePool = mock<EpochProofQuotePool>();
    epochCache = mock<EpochCache>();
    worldState = mock<WorldStateSynchronizer>();

    txPool.getAllTxs.mockImplementation(() => {
      return Promise.resolve([] as Tx[]);
    });
  });

  afterEach(async () => {
    if (clients.length > 0) {
      await shutdown(clients);
    }
  });

  const getPorts = (numberOfPeers: number) => Promise.all(Array.from({ length: numberOfPeers }, () => getPort()));

  const createClients = async (
    numberOfPeers: number,
    {
      alwaysTrueVerifier = true,
      p2pConfigOverrides = {},
    }: { alwaysTrueVerifier?: boolean; p2pConfigOverrides?: Partial<P2PConfig> } = {},
  ): Promise<P2PClient[]> => {
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
        ...p2pConfigOverrides,
      } as P2PConfig & DataStoreConfig;

      l2BlockSource = new MockL2BlockSource();
      await l2BlockSource.createBlocks(100);

      proofVerifier = alwaysTrueVerifier ? new AlwaysTrueCircuitVerifier() : new AlwaysFalseCircuitVerifier();
      kvStore = await openTmpStore('test');
      const deps = {
        txPool: txPool as unknown as TxPool,
        attestationPool: attestationPool as unknown as AttestationPool,
        epochProofQuotePool: epochProofQuotePool as unknown as EpochProofQuotePool,
        store: kvStore,
        logger: createLogger(`p2p:${i}`),
      };
      const client = await createP2PClient(
        P2PClientType.Full,
        config,
        l2BlockSource,
        proofVerifier,
        worldState,
        epochCache,
        undefined,
        deps,
      );
      clients.push(client);
      await client.start();

      logger.info(`Creating client ${i}`);
    }

    // Start clients in serial
    // logger.info(`Starting ${clients.length} clients`);
    // for (const [i, client] of clients.entries()) {
    //   logger.info(`\n\n\n\n\n\n\nStarting client ${i}\n\n\n\n\n\n\n`);
    // }

    logger.info(`Started ${clients.length} clients, checking readiness`);
    await Promise.all(clients.map(client => client.isReady()));
    logger.info(`Clients ready`);
    return clients;
  };

  // Shutdown all test clients
  const shutdown = async (clients: P2PClient[]) => {
    await Promise.all([...clients.map(client => client.stop())]);
    await sleep(1000);
    clients = [];
  };

  describe('Req Resp', () => {
    it(
      'Returns undefined if unable to find a transaction from another peer',
      async () => {
        // We want to create a set of nodes and request transaction from them
        // Not using a before each as a the wind down is not working as expected
        const clients = await createClients(NUMBER_OF_PEERS);
        const [client1] = clients;

        await sleep(2000);

        // Perform a get tx request from client 1
        const tx = await mockTx();
        const txHash = await tx.getTxHash();

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
        const tx = await mockTx();
        const txHash = await tx.getTxHash();
        // Mock the tx pool to return the tx we are looking for
        txPool.getTxByHash.mockImplementationOnce(() => Promise.resolve(tx));

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
        const clients = await createClients(NUMBER_OF_PEERS, { alwaysTrueVerifier: false });
        const [client1, client2] = clients;
        const client2PeerId = await client2.getEnr()!.peerId();

        // Give the nodes time to discover each other
        await sleep(6000);

        const penalizePeerSpy = jest.spyOn((client1 as any).p2pService.peerManager, 'penalizePeer');

        // Perform a get tx request from client 1
        const tx = await mockTx();
        const txHash = await tx.getTxHash();

        // Return the correct tx with an invalid proof -> active attack
        txPool.getTxByHash.mockImplementationOnce(() => Promise.resolve(tx));

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
        const clients = await createClients(NUMBER_OF_PEERS, { alwaysTrueVerifier: true });
        const [client1, client2] = clients;
        const client2PeerId = (await client2.getEnr()?.peerId())!;

        // Give the nodes time to discover each other
        await sleep(6000);

        const penalizePeerSpy = jest.spyOn((client1 as any).p2pService.peerManager, 'penalizePeer');

        // Perform a get tx request from client 1
        const tx = await mockTx();
        const txHash = await tx.getTxHash();
        const tx2 = await mockTx(420);

        // Return an invalid tx
        txPool.getTxByHash.mockImplementationOnce(() => Promise.resolve(tx2));

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

  //
  describe('Gossipsub', () => {
    it.only(
      'Should propagate a tx to all peers with a throttled degree and large node set',
      async () => {
        // No network partition, all nodes should receive
        const numberOfClients = 30;

        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const workerPath = path.join(__dirname, '../../dest/client/p2p_gossipsub_worker.js');

        // Setup clients in separate processes
        const peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfClients);
        const ports = await getPorts(numberOfClients);
        const peerEnrs = await Promise.all(
          peerIdPrivateKeys.map(async (pk, i) => {
            const peerId = await createLibP2PPeerIdFromPrivateKey(pk);
            const enr = SignableENR.createFromPeerId(peerId);

            const udpAnnounceAddress = `127.0.0.1:${ports[i]}`;
            const tcpAnnounceAddress = `127.0.0.1:${ports[i]}`;
            const udpPublicAddr = multiaddr(convertToMultiaddr(udpAnnounceAddress, 'udp'));
            const tcpPublicAddr = multiaddr(convertToMultiaddr(tcpAnnounceAddress, 'tcp'));

            enr.set(AZTEC_ENR_KEY, Uint8Array.from([AZTEC_NET]));
            enr.setLocationMultiaddr(udpPublicAddr);
            enr.setLocationMultiaddr(tcpPublicAddr);

            return enr.encodeTxt();
          }),
        );

        const processes = [];
        for (let i = 0; i < numberOfClients; i++) {
          logger.info(`\n\n\n\n\n\n\nCreating client ${i}\n\n\n\n\n\n\n`);
          const addr = `127.0.0.1:${ports[i]}`;
          const listenAddr = `0.0.0.0:${ports[i]}`;

          // Maximum seed with 10 other peers to allow peer discovery to connect them at a smoother rate
          const otherNodes = peerEnrs.filter((_, ind) => ind < Math.min(i, 10));

          // TODO: drastically increase mcache length parameters and see what happens to performance
          const config: P2PConfig = {
            ...getP2PDefaultConfig(),
            p2pEnabled: true,
            peerIdPrivateKey: peerIdPrivateKeys[i],
            tcpListenAddress: listenAddr,
            udpListenAddress: listenAddr,
            tcpAnnounceAddress: addr,
            udpAnnounceAddress: addr,
            bootstrapNodes: [...otherNodes],
            minPeerCount: 0,
            maxPeerCount: numberOfClients + 20,
            gossipsubInterval: 700,
            gossipsubD: 1,
            gossipsubDlo: 1,
            gossipsubDhi: 1,
            peerCheckIntervalMS: 2500,

            // Increased
            gossipsubMcacheGossip: 12,
            gossipsubMcacheLength: 12,
          };

          const childProcess = fork(workerPath);
          childProcess.send({ type: 'START', config, clientIndex: i });

          // Wait for ready signal
          await new Promise((resolve, reject) => {
            childProcess.once('message', (msg: any) => {
              if (msg.type === 'READY') resolve(undefined);
              if (msg.type === 'ERROR') reject(new Error(msg.error));
            });
          });

          processes.push(childProcess);
        }

        // Wait for peers to all connect with each other
        await sleep(4000);

        // Track gossip message counts from all processes
        const gossipCounts = new Map<number, number>();
        processes.forEach((proc, i) => {
          proc.on('message', (msg: any) => {
            if (msg.type === 'GOSSIP_RECEIVED') {
              gossipCounts.set(i, msg.count);
            }
          });
        });

        // Send tx from client 3
        const tx = await mockTx();
        processes[0].send({ type: 'SEND_TX', tx: tx.toBuffer() });

        // Give time for message propagation
        await sleep(15000);
        logger.info(`\n\n\n\n\n\n\nWoke up\n\n\n\n\n\n\n`);

        // Count how many processes received the message
        const spiesTriggered = Array.from(gossipCounts.values()).filter(count => count > 0).length;
        console.log('spiesTriggered', spiesTriggered);

        // Cleanup
        await Promise.all(
          processes.map(
            proc =>
              new Promise<void>(resolve => {
                proc.once('exit', () => resolve());
                proc.send({ type: 'STOP' });
              }),
          ),
        );

        // Note:
        // - 10 nodes, 1 does not get the message
        // - is it due to identify having too low allowed streams
        expect(spiesTriggered).toEqual(numberOfClients - 1); // All nodes apart from the one that sent it
      },
      TEST_TIMEOUT * 100,
    );
  });
});
