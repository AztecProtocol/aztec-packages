import type { EpochCache } from '@aztec/epoch-cache';
import { times } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PClient } from '../../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPool } from '../../mem_pools/tx_pool/index.js';
import { ReqRespSubProtocol } from '../../services/reqresp/interface.js';
import { chunkTxHashesRequest } from '../../services/reqresp/protocols/tx.js';
import { makeAndStartTestP2PClients } from '../../test-helpers/make-test-p2p-clients.js';

const TEST_TIMEOUT = 120000;
jest.setTimeout(TEST_TIMEOUT);

const NUMBER_OF_PEERS = 2;

describe('p2p client integration', () => {
  let txPool: MockProxy<TxPool>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochCache: MockProxy<EpochCache>;
  let worldState: MockProxy<WorldStateSynchronizer>;

  let logger: Logger;
  let p2pBaseConfig: P2PConfig;

  let clients: P2PClient[] = [];

  beforeEach(() => {
    clients = [];
    txPool = mock<TxPool>();
    attestationPool = mock<AttestationPool>();
    epochCache = mock<EpochCache>();
    worldState = mock<WorldStateSynchronizer>();

    logger = createLogger('p2p:test:integration');
    p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig() };

    //@ts-expect-error - we want to mock the getEpochAndSlotInNextL1Slot method, mocking ts is enough
    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({ ts: BigInt(0) });
    epochCache.getRegisteredValidators.mockResolvedValue([]);

    txPool.hasTxs.mockResolvedValue([]);
    txPool.getAllTxs.mockImplementation(() => {
      return Promise.resolve([] as Tx[]);
    });
    txPool.addTxs.mockResolvedValue(1);
    txPool.getTxsByHash.mockImplementation(() => {
      return Promise.resolve([] as Tx[]);
    });

    worldState.status.mockResolvedValue({
      state: mock(),
      syncSummary: {
        latestBlockNumber: 0,
        latestBlockHash: '',
        finalizedBlockNumber: 0,
        treesAreSynched: false,
        oldestHistoricBlockNumber: 0,
      },
    });
    logger.info(`Starting test ${expect.getState().currentTestName}`);
  });

  afterEach(async () => {
    logger.info(`Tearing down state for ${expect.getState().currentTestName}`);
    await shutdown(clients);
    logger.info('Shut down p2p clients');

    jest.restoreAllMocks();
    jest.resetAllMocks();
    jest.clearAllMocks();

    clients = [];
  });

  // Shutdown all test clients
  const shutdown = async (clients: P2PClient[]) => {
    await Promise.all(clients.map(client => client.stop()));
    await sleep(1000);
  };

  it('returns an empty array if unable to find a transaction from another peer', async () => {
    // We want to create a set of nodes and request transaction from them
    // Not using a before each as a the wind down is not working as expected
    clients = (
      await makeAndStartTestP2PClients(NUMBER_OF_PEERS, {
        p2pBaseConfig: { ...emptyChainConfig, ...getP2PDefaultConfig() },
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        logger,
      })
    ).map(x => x.client);
    const [client1] = clients;

    await sleep(2000);
    logger.info(`Finished waiting for clients to connect`);

    // Perform a get tx request from client 1
    const tx = await mockTx();
    const txHash = tx.getTxHash();

    const requestedTxs = await client1.requestTxsByHash([txHash], undefined);
    expect(requestedTxs).toEqual([]);
  });

  it('can request a transaction from another peer', async () => {
    // We want to create a set of nodes and request transaction from them
    clients = (
      await makeAndStartTestP2PClients(NUMBER_OF_PEERS, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        logger,
      })
    ).map(x => x.client);
    const [client1] = clients;

    // Give the nodes time to discover each other
    await sleep(6000);
    logger.info(`Finished waiting for clients to connect`);

    // Perform a get tx request from client 1
    const tx = await mockTx();
    const txHash = tx.getTxHash();
    // Mock the tx pool to return the tx we are looking for
    txPool.getTxByHash.mockImplementationOnce(() => Promise.resolve(tx));

    const requestedTxs = await client1.requestTxsByHash([txHash], undefined);
    expect(requestedTxs).toHaveLength(1);
    const requestedTx = requestedTxs[0];

    // Expect the tx to be the returned tx to be the same as the one we mocked
    expect(requestedTx?.toBuffer()).toStrictEqual(tx.toBuffer());
  });

  it('request batches of txs from another peer', async () => {
    const txToRequestCount = 8;
    const txBatchSize = 1;

    // We want to create a set of nodes and request transaction from them
    clients = (
      await makeAndStartTestP2PClients(3, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        logger,
      })
    ).map(x => x.client);
    const [client1] = clients;

    // Give the nodes time to discover each other
    await sleep(6000);
    logger.info(`Finished waiting for clients to connect`);

    // Perform a get tx request from client 1
    const txs = await Promise.all(times(txToRequestCount, () => mockTx()));
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Mock the tx pool to return the tx we are looking for
    txPool.getTxByHash.mockImplementation((hash: TxHash) => Promise.resolve(txs.find(t => t.txHash?.equals(hash))));
    //@ts-expect-error - we want to spy on the sendBatchRequest method
    const sendBatchSpy = jest.spyOn(client1.p2pService, 'sendBatchRequest');
    //@ts-expect-error - we want to spy on the sendRequestToPeer method
    const sendRequestToPeerSpy = jest.spyOn(client1.p2pService.reqresp, 'sendRequestToPeer');

    const resultingTxs = await client1.requestTxsByHash(txHashes, undefined);
    expect(resultingTxs).toHaveLength(txs.length);

    // Expect the tx to be the returned tx to be the same as the one we mocked
    resultingTxs.forEach((requestedTx, i) => {
      expect(requestedTx.toBuffer()).toStrictEqual(txs[i].toBuffer());
    });

    const request = chunkTxHashesRequest(txHashes, txBatchSize);
    expect(request).toHaveLength(Math.ceil(txToRequestCount / txBatchSize));

    expect(sendBatchSpy).toHaveBeenCalledWith(
      ReqRespSubProtocol.TX,
      request,
      undefined, // pinnedPeer
      expect.anything(), // timeoutMs
      expect.anything(), // maxPeers
      expect.anything(), // maxRetryAttempts
    );

    expect(sendRequestToPeerSpy).toHaveBeenCalledTimes(request.length);
  });

  it('request batches of txs from another peers', async () => {
    const txToRequestCount = 8;
    const txBatchSize = 1;

    // We want to create a set of nodes and request transaction from them
    clients = (
      await makeAndStartTestP2PClients(3, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        logger,
      })
    ).map(x => x.client);
    const [client1] = clients;

    // Give the nodes time to discover each other
    await sleep(6000);
    logger.info(`Finished waiting for clients to connect`);

    // Perform a get tx request from client 1
    const txs = await Promise.all(times(txToRequestCount, () => mockTx()));
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Mock the tx pool to return every other tx we are looking for
    txPool.getTxByHash.mockImplementation((hash: TxHash) => {
      const idx = txs.findIndex(t => t.txHash.equals(hash));
      return idx % 2 === 0 ? Promise.resolve(txs[idx]) : Promise.resolve(undefined);
    });
    //@ts-expect-error - we want to spy on the sendBatchRequest method
    const sendBatchSpy = jest.spyOn(client1.p2pService, 'sendBatchRequest');
    //@ts-expect-error - we want to spy on the sendRequestToPeer method
    const sendRequestToPeerSpy = jest.spyOn(client1.p2pService.reqresp, 'sendRequestToPeer');

    const resultingTxs = await client1.requestTxsByHash(txHashes, undefined);
    expect(resultingTxs).toHaveLength(txs.length / 2);

    // Expect the tx to be the returned tx to be the same as the one we mocked
    // Note we have only returned the half of the txs, so we expect the resulting txs to be every other tx
    resultingTxs.forEach((requestedTx, i) => {
      expect(requestedTx.toBuffer()).toStrictEqual(txs[2 * i].toBuffer());
    });

    const request = chunkTxHashesRequest(txHashes, txBatchSize);
    expect(request).toHaveLength(Math.ceil(txToRequestCount / txBatchSize));
    expect(request[0]).toHaveLength(txBatchSize);

    expect(sendBatchSpy).toHaveBeenCalledWith(
      ReqRespSubProtocol.TX,
      request,
      undefined, // pinnedPeer
      expect.anything(), // timeoutMs
      expect.anything(), // maxPeers
      expect.anything(), // maxRetryAttempts
    );

    expect(sendRequestToPeerSpy).toHaveBeenCalledTimes(request.length);
  });

  it('will penalize peers that send invalid proofs', async () => {
    // We want to create a set of nodes and request transaction from them
    clients = (
      await makeAndStartTestP2PClients(NUMBER_OF_PEERS, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        alwaysTrueVerifier: false,
        logger,
      })
    ).map(x => x.client);
    const [client1, client2] = clients;
    const client2PeerId = await client2.getEnr()!.peerId();

    // Give the nodes time to discover each other
    await sleep(6000);
    logger.info(`Finished waiting for clients to connect`);

    const penalizePeerSpy = jest.spyOn((client1 as any).p2pService.peerManager, 'penalizePeer');

    // Perform a get tx request from client 1
    const tx = await mockTx();
    const txHash = tx.getTxHash();

    // Return the correct tx with an invalid proof -> active attack
    txPool.getTxByHash.mockImplementationOnce(() => Promise.resolve(tx));

    const requestedTxs = await client1.requestTxsByHash([txHash], undefined);
    // Even though we got a response, the proof was deemed invalid
    expect(requestedTxs).toEqual([]);

    // Low tolerance error is due to the invalid proof
    expect(penalizePeerSpy).toHaveBeenCalledWith(client2PeerId, PeerErrorSeverity.LowToleranceError);
  });

  it('will penalize peers that send the wrong transaction', async () => {
    // We want to create a set of nodes and request transaction from them
    clients = (
      await makeAndStartTestP2PClients(NUMBER_OF_PEERS, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        alwaysTrueVerifier: true,
        logger,
      })
    ).map(x => x.client);
    const [client1, client2] = clients;
    const client2PeerId = (await client2.getEnr()?.peerId())!;

    // Give the nodes time to discover each other
    await sleep(6000);
    logger.info(`Finished waiting for clients to connect`);

    const penalizePeerSpy = jest.spyOn((client1 as any).p2pService.peerManager, 'penalizePeer');

    // Perform a get tx request from client 1
    const tx = await mockTx();
    const txHash = tx.getTxHash();
    const tx2 = await mockTx(420);

    // Return an invalid tx
    txPool.getTxByHash.mockImplementationOnce(() => Promise.resolve(tx2));

    const requestedTxs = await client1.requestTxsByHash([txHash], undefined);
    // Even though we got a response, the proof was deemed invalid
    expect(requestedTxs).toEqual([]);

    // Received wrong tx
    expect(penalizePeerSpy).toHaveBeenCalledWith(client2PeerId, PeerErrorSeverity.MidToleranceError);
  });
});
