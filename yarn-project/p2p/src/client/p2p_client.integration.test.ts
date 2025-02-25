// An integration test for the p2p client to test req resp protocols
import { PeerErrorSeverity, type Tx } from '@aztec/circuits.js';
import { emptyChainConfig } from '@aztec/circuits.js/config';
import { type WorldStateSynchronizer } from '@aztec/circuits.js/interfaces/server';
import { mockTx } from '@aztec/circuits.js/testing';
import { type EpochCache } from '@aztec/epoch-cache';
import { sleep } from '@aztec/foundation/sleep';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type P2PClient } from '../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import { type AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { type TxPool } from '../mem_pools/tx_pool/index.js';
import { makeTestP2PClients } from '../test-helpers/make-test-p2p-clients.js';

const TEST_TIMEOUT = 80000;

const NUMBER_OF_PEERS = 2;

describe('p2p client integration', () => {
  let txPool: MockProxy<TxPool>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochCache: MockProxy<EpochCache>;
  let worldState: MockProxy<WorldStateSynchronizer>;

  let p2pBaseConfig: P2PConfig;

  let clients: P2PClient[] = [];

  beforeEach(() => {
    txPool = mock<TxPool>();
    attestationPool = mock<AttestationPool>();
    epochCache = mock<EpochCache>();
    worldState = mock<WorldStateSynchronizer>();

    p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig() };

    txPool.getAllTxs.mockImplementation(() => {
      return Promise.resolve([] as Tx[]);
    });
  });

  afterEach(async () => {
    if (clients.length > 0) {
      await shutdown(clients);
    }
  });

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
        clients = await makeTestP2PClients(NUMBER_OF_PEERS, {
          p2pBaseConfig: { ...emptyChainConfig, ...getP2PDefaultConfig() },
          mockAttestationPool: attestationPool,
          mockTxPool: txPool,
          mockEpochCache: epochCache,
          mockWorldState: worldState,
        });
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
        clients = await makeTestP2PClients(NUMBER_OF_PEERS, {
          p2pBaseConfig,
          mockAttestationPool: attestationPool,
          mockTxPool: txPool,
          mockEpochCache: epochCache,
          mockWorldState: worldState,
        });
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
        clients = await makeTestP2PClients(NUMBER_OF_PEERS, {
          p2pBaseConfig,
          mockAttestationPool: attestationPool,
          mockTxPool: txPool,
          mockEpochCache: epochCache,
          mockWorldState: worldState,
          alwaysTrueVerifier: false,
        });
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
        clients = await makeTestP2PClients(NUMBER_OF_PEERS, {
          p2pBaseConfig,
          mockAttestationPool: attestationPool,
          mockTxPool: txPool,
          mockEpochCache: epochCache,
          mockWorldState: worldState,
          alwaysTrueVerifier: true,
        });
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
});
