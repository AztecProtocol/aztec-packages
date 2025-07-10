// An integration test for the p2p client to test req resp protocols
import type { EpochCache } from '@aztec/epoch-cache';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { BlockAttestation, BlockProposal, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { type MakeConsensusPayloadOptions, makeBlockProposal, makeHeader, mockTx } from '@aztec/stdlib/testing';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PClient } from '../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { mockAttestation } from '../mem_pools/attestation_pool/mocks.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import type { LibP2PService } from '../services/libp2p/libp2p_service.js';
import { ReqRespSubProtocol } from '../services/reqresp/interface.js';
import { chunkTxHashesRequest } from '../services/reqresp/protocols/tx.js';
import { ReqRespStatus } from '../services/reqresp/status.js';
import {
  type MakeTestP2PClientOptions,
  makeAndStartTestP2PClients,
  makeTestP2PClient,
  makeTestP2PClients,
  startTestP2PClients,
} from '../test-helpers/make-test-p2p-clients.js';
import { MockGossipSubNetwork } from '../test-helpers/mock-pubsub.js';

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
        finalisedBlockNumber: 0,
        treesAreSynched: false,
        oldestHistoricBlockNumber: 0,
      },
    });
    logger.info(`Starting test ${expect.getState().currentTestName}`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.resetAllMocks();

    logger.info(`Tearing down state for ${expect.getState().currentTestName}`);
    await shutdown(clients);
    logger.info('Shut down p2p clients');

    clients = [];
  });

  // Shutdown all test clients
  const shutdown = async (clients: P2PClient[]) => {
    await Promise.all(clients.map(client => client.stop()));
    await sleep(1000);
  };

  // Replace the tx handler on a client
  const replaceTxHandler = (client: P2PClient, promise: PromiseWithResolvers<Tx>) => {
    const p2pService = (client as any).p2pService as LibP2PService;
    // @ts-expect-error - we want to spy on received tx handler
    const oldTxHandler = p2pService.handleGossipedTx.bind(p2pService);

    // Mock the function to just call the old one
    const handleGossipedTxSpy = jest.fn(async (payload: Buffer, msgId: string, source: PeerId) => {
      promise.resolve(Tx.fromBuffer(payload));
      await oldTxHandler(payload, msgId, source);
    });
    // @ts-expect-error - replace with our own handler
    p2pService.handleGossipedTx = handleGossipedTxSpy;

    return handleGossipedTxSpy;
  };

  // Replace the block proposal handler on a client
  const replaceBlockProposalHandler = (client: P2PClient, promise: PromiseWithResolvers<BlockProposal>) => {
    const p2pService = (client as any).p2pService as LibP2PService;
    // @ts-expect-error - we want to spy on received proposal handler
    const oldProposalHandler = p2pService.processBlockFromPeer.bind(p2pService);

    // Mock the function to just call the old one
    const handleGossipedProposalSpy = jest.fn(async (payload: Buffer, msgId: string, source: PeerId) => {
      promise.resolve(BlockProposal.fromBuffer(payload));
      await oldProposalHandler(payload, msgId, source);
    });
    // @ts-expect-error - replace with our own handler
    p2pService.processBlockFromPeer = handleGossipedProposalSpy;

    return handleGossipedProposalSpy;
  };

  // Replace the block attestation handler on a client
  const replaceBlockAttestationHandler = (client: P2PClient, promise: PromiseWithResolvers<BlockAttestation>) => {
    const p2pService = (client as any).p2pService as LibP2PService;
    // @ts-expect-error - we want to spy on received attestation handler
    const oldAttestationHandler = p2pService.processAttestationFromPeer.bind(p2pService);

    // Mock the function to just call the old one
    const handleGossipedAttestationSpy = jest.fn(async (payload: Buffer, msgId: string, source: PeerId) => {
      promise.resolve(BlockAttestation.fromBuffer(payload));
      await oldAttestationHandler(payload, msgId, source);
    });
    // @ts-expect-error - replace with our own handler
    p2pService.processAttestationFromPeer = handleGossipedAttestationSpy;

    return handleGossipedAttestationSpy;
  };

  const assertBroadcast = async (clients: P2PClient[]) => {
    const [client1, client2, client3] = clients;
    // Client 1 sends a tx a block proposal and an attestation and both clients 2 and 3 should receive them
    const client2TxPromise = promiseWithResolvers<Tx>();
    const client2ProposalPromise = promiseWithResolvers<BlockProposal>();
    const client2AttestationPromise = promiseWithResolvers<BlockAttestation>();

    const client3TxPromise = promiseWithResolvers<Tx>();
    const client3ProposalPromise = promiseWithResolvers<BlockProposal>();
    const client3AttestationPromise = promiseWithResolvers<BlockAttestation>();

    // Replace the handlers on clients 2 and 3 so we can detect when they receive messages
    const client2HandleGossipedTxSpy = replaceTxHandler(client2, client2TxPromise);
    const client2HandleGossipedProposalSpy = replaceBlockProposalHandler(client2, client2ProposalPromise);
    const client2HandleGossipedAttestationSpy = replaceBlockAttestationHandler(client2, client2AttestationPromise);

    const client3HandleGossipedTxSpy = replaceTxHandler(client3, client3TxPromise);
    const client3HandleGossipedProposalSpy = replaceBlockProposalHandler(client3, client3ProposalPromise);
    const client3HandleGossipedAttestationSpy = replaceBlockAttestationHandler(client3, client3AttestationPromise);

    // Client 1 sends a transaction, it should propagate to clients 2 and 3
    const tx = await mockTx();
    await client1.sendTx(tx);

    // Client 1 sends a block proposal
    const dummyPayload: MakeConsensusPayloadOptions = {
      signer: Secp256k1Signer.random(),
      header: makeHeader(),
      archive: Fr.random(),
      txHashes: [TxHash.random()],
    };
    const blockProposal = makeBlockProposal(dummyPayload);
    await client1.broadcastProposal(blockProposal);

    // client 1 sends an attestation
    const attestation = mockAttestation(
      Secp256k1Signer.random(),
      Number(dummyPayload.header!.getSlot()),
      dummyPayload.archive,
    );
    await (client1 as any).p2pService.broadcastAttestation(attestation);

    // Clients 2 and 3 should receive all messages
    const messagesPromise = Promise.all([
      client2TxPromise.promise,
      client3TxPromise.promise,
      client2ProposalPromise.promise,
      client3ProposalPromise.promise,
      client2AttestationPromise.promise,
      client3AttestationPromise.promise,
    ]);

    const messages = await Promise.race([messagesPromise, sleep(6000).then(() => undefined)]);
    expect(messages).toBeDefined();
    expect(client2HandleGossipedTxSpy).toHaveBeenCalled();
    expect(client2HandleGossipedProposalSpy).toHaveBeenCalled();
    expect(client2HandleGossipedAttestationSpy).toHaveBeenCalled();
    expect(client3HandleGossipedTxSpy).toHaveBeenCalled();
    expect(client3HandleGossipedProposalSpy).toHaveBeenCalled();
    expect(client3HandleGossipedAttestationSpy).toHaveBeenCalled();

    if (messages) {
      const hashes = await Promise.all([tx, messages[0], messages[1]].map(tx => tx!.getTxHash()));
      expect(hashes[0].toString()).toEqual(hashes[1].toString());
      expect(hashes[0].toString()).toEqual(hashes[2].toString());

      expect(messages[2].payload.toString()).toEqual(blockProposal.payload.toString());
      expect(messages[3].payload.toString()).toEqual(blockProposal.payload.toString());
      expect(messages[4].payload.toString()).toEqual(attestation.payload.toString());
      expect(messages[5].payload.toString()).toEqual(attestation.payload.toString());
    }
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
    const txHash = await tx.getTxHash();

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
    const txHash = await tx.getTxHash();
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
    //@ts-expect-error - txHash is protected and should not be accessed directly outside of the test env.
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
      //@ts-expect-error - txHash is protected and should not be accessed directly outside of the test env.
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
    const txHash = await tx.getTxHash();

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
    const txHash = await tx.getTxHash();
    const tx2 = await mockTx(420);

    // Return an invalid tx
    txPool.getTxByHash.mockImplementationOnce(() => Promise.resolve(tx2));

    const requestedTxs = await client1.requestTxsByHash([txHash], undefined);
    // Even though we got a response, the proof was deemed invalid
    expect(requestedTxs).toEqual([]);

    // Received wrong tx
    expect(penalizePeerSpy).toHaveBeenCalledWith(client2PeerId, PeerErrorSeverity.MidToleranceError);
  });

  // Test creates 3 nodes. Node 1 sends all message types to others.
  // Test confirms that nodes 2 and 3 receive all messages.
  // Then nodes 2 and 3 are restarted, node 3 is restarted at a new version
  // Again, node 1 sends all message types.
  // Test confirms that node 2 receives all messages, node 3 receives none.
  it(
    'will propagate messages to peers at the same version',
    async () => {
      // Create a set of nodes, client 1 will send a messages to other peers
      const numberOfNodes = 3;
      // We start at rollup version 1
      const testConfig: MakeTestP2PClientOptions = {
        p2pBaseConfig: { ...p2pBaseConfig, rollupVersion: 1 },
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        alwaysTrueVerifier: true,
        logger,
      };

      const clientsAndConfig = await makeAndStartTestP2PClients(numberOfNodes, testConfig);
      //Disable handshake because it makes this test flaky
      for (const c of clientsAndConfig) {
        (c as any).client.p2pService.peerManager.exchangeStatusHandshake = jest.fn().mockImplementation(() => {});
      }
      const [client1, client2, client3] = clientsAndConfig;

      //Disable handshake because it makes this test flaky
      clientsAndConfig.forEach((c: any) => {
        c.client.p2pService.peerManager.exchangeStatusHandshake = jest.fn().mockImplementation(() => {});
      });

      // Give the nodes time to discover each other
      await retryUntil(async () => (await client1.client.getPeers()).length >= 2, 'peers discovered', 10, 0.5);
      logger.info(`Finished waiting for clients to discover each other`);

      // Assert that messages get propagated
      await assertBroadcast(clientsAndConfig.map(c => c.client));

      // Now stop clients 2 and 3
      logger.info(`Restarting clients 2 and 3`);
      await Promise.all([client2.client.stop(), client3.client.stop()]);

      // We set client 3 to rollup version 2
      const newP2PConfig: P2PConfig = {
        ...testConfig.p2pBaseConfig,
        rollupVersion: 2,
      };

      // We re-create client 2 as before, but client 3 moves to a new rollup version
      const newEnrs = [client1.enr, client2.enr, client3.enr];
      const newClient2 = await makeTestP2PClient(client2.peerPrivateKey, client2.port, newEnrs, {
        ...testConfig,
        logger: createLogger(`p2p:new-client-2`),
      });
      const newClient3 = await makeTestP2PClient(client3.peerPrivateKey, client3.port, newEnrs, {
        ...testConfig,
        p2pBaseConfig: newP2PConfig,
        logger: createLogger(`p2p:new-client-3`),
      });

      const clients = [newClient2, newClient3];

      //Disable handshake because it makes this test flaky
      clients.forEach((c: any) => {
        c.p2pService.peerManager.exchangeStatusHandshake = jest.fn().mockImplementation(() => {});
      });

      await startTestP2PClients(clients);
      // Give everyone time to connect again
      await retryUntil(async () => (await client1.client.getPeers()).length >= 2, 'peers rediscovered', 10, 0.5);
      logger.info(`Finished waiting for clients to rediscover each other`);

      // Client 1 sends a tx a block proposal and an attestation and only client 2 should receive them, client 3 is now on a new version
      {
        const client2TxPromise = promiseWithResolvers<Tx>();
        const client2ProposalPromise = promiseWithResolvers<BlockProposal>();
        const client2AttestationPromise = promiseWithResolvers<BlockAttestation>();

        const client3TxPromise = promiseWithResolvers<Tx>();
        const client3ProposalPromise = promiseWithResolvers<BlockProposal>();
        const client3AttestationPromise = promiseWithResolvers<BlockAttestation>();

        // Replace the handlers on clients 2 and 3 so we can detect when they receive messages
        const client2HandleGossipedTxSpy = replaceTxHandler(newClient2, client2TxPromise);
        const client2HandleGossipedProposalSpy = replaceBlockProposalHandler(newClient2, client2ProposalPromise);
        const client2HandleGossipedAttestationSpy = replaceBlockAttestationHandler(
          newClient2,
          client2AttestationPromise,
        );

        const client3HandleGossipedTxSpy = replaceTxHandler(newClient3, client3TxPromise);
        const client3HandleGossipedProposalSpy = replaceBlockProposalHandler(newClient3, client3ProposalPromise);
        const client3HandleGossipedAttestationSpy = replaceBlockAttestationHandler(
          newClient3,
          client3AttestationPromise,
        );

        // Client 1 sends a transaction, it should propagate to clients 2 and 3
        const tx = await mockTx();
        await client1.client.sendTx(tx);

        // Client 1 sends a block proposal
        const dummyPayload: MakeConsensusPayloadOptions = {
          signer: Secp256k1Signer.random(),
          header: makeHeader(),
          archive: Fr.random(),
          txHashes: [TxHash.random()],
        };
        const blockProposal = makeBlockProposal(dummyPayload);
        await client1.client.broadcastProposal(blockProposal);

        // client 1 sends an attestation
        const attestation = mockAttestation(
          Secp256k1Signer.random(),
          Number(dummyPayload.header!.getSlot()),
          dummyPayload.archive,
        );
        await (client1.client as any).p2pService.broadcastAttestation(attestation);

        // Only client 2 should receive the messages
        const client2MessagesPromises = Promise.all([
          client2TxPromise.promise,
          client2ProposalPromise.promise,
          client2AttestationPromise.promise,
        ]);

        // We use Promise.any as no messages should be received
        const client3MessagesPromises = Promise.any([
          client3TxPromise.promise,
          client3ProposalPromise.promise,
          client3AttestationPromise.promise,
        ]);

        const [client2Messages, client3Messages] = await Promise.all([
          Promise.race([client2MessagesPromises, sleep(6000).then(() => undefined)]),
          Promise.race([client3MessagesPromises, sleep(6000).then(() => undefined)]),
        ]);

        // We expect that all messages were received by client 2
        expect(client2Messages).toBeDefined();
        expect(client2HandleGossipedTxSpy).toHaveBeenCalled();
        expect(client2HandleGossipedProposalSpy).toHaveBeenCalled();
        expect(client2HandleGossipedAttestationSpy).toHaveBeenCalled();

        const hashes = await Promise.all([tx, client2Messages![0]].map(tx => tx!.getTxHash()));
        expect(hashes[0].toString()).toEqual(hashes[1].toString());
        expect(client2Messages![1].payload.toString()).toEqual(blockProposal.payload.toString());
        expect(client2Messages![2].payload.toString()).toEqual(attestation.payload.toString());

        // We expect that no messages were received by client 3
        expect(client3Messages).toBeUndefined();
        expect(client3HandleGossipedTxSpy).not.toHaveBeenCalled();
        expect(client3HandleGossipedProposalSpy).not.toHaveBeenCalled();
        expect(client3HandleGossipedAttestationSpy).not.toHaveBeenCalled();
      }

      await shutdown([...clientsAndConfig.map(c => c.client), ...clients]);
    },
    TEST_TIMEOUT,
  );

  it('should not disconnect clients when it returns correct status', async () => {
    clients = (
      await makeTestP2PClients(NUMBER_OF_PEERS, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
      })
    ).map(x => x.client);

    const disconnectSpies = clients.map(c => jest.spyOn((c as any).p2pService.peerManager, 'disconnectPeer'));
    const statusHandshakeSpies = clients.map(c =>
      jest.spyOn((c as any).p2pService.peerManager, 'exchangeStatusHandshake'),
    );

    await startTestP2PClients(clients);
    await sleep(5000);
    logger.info(`Finished waiting for clients to connect`);

    for (const handshakeSpy of statusHandshakeSpies) {
      expect(handshakeSpy).toHaveBeenCalled();
    }

    for (const disconnectSpy of disconnectSpies) {
      expect(disconnectSpy).not.toHaveBeenCalled();
    }
  });

  it('should disconnect client when it returns status with wrong version', async () => {
    clients = (
      await makeTestP2PClients(NUMBER_OF_PEERS, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
      })
    ).map(x => x.client);
    const [c0] = clients;
    (c0 as any).p2pService.peerManager.protocolVersion = 'WRONG_VERSION';

    const disconnectSpy = jest.spyOn((c0 as any).p2pService.peerManager, 'disconnectPeer');
    const statusHandshakeSpies = clients.map(c =>
      jest.spyOn((c as any).p2pService.peerManager, 'exchangeStatusHandshake'),
    );

    await startTestP2PClients(clients);
    await sleep(5000);
    logger.info(`Finished waiting for clients to connect`);

    for (const handshakeSpy of statusHandshakeSpies) {
      expect(handshakeSpy).toHaveBeenCalled();
    }

    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('should disconnect client when it returns an invalid status', async () => {
    const peerTestCount = 3;
    clients = (
      await makeTestP2PClients(peerTestCount, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
      })
    ).map(x => x.client);
    const [_c0, c1, _c2] = clients;
    logger.info(`Created p2p clients`);

    const statusHandshakeSpies = clients.map(c =>
      jest.spyOn((c as any).p2pService.peerManager, 'exchangeStatusHandshake'),
    );
    const disconnectSpies = clients.map(c => jest.spyOn((c as any).p2pService.peerManager, 'disconnectPeer'));

    const badPeerId = (clients[0] as any).p2pService.node.peerId;
    const c1PeerManager = (c1 as any).p2pService.peerManager;
    const realSend = c1PeerManager.reqresp.sendRequestToPeer;

    // @ts-expect-error arguments not expected
    jest.spyOn(c1PeerManager.reqresp, 'sendRequestToPeer').mockImplementation(function (peerId: PeerId, ...rest) {
      if (peerId.toString() === badPeerId.toString()) {
        return { status: ReqRespStatus.SUCCESS, data: Buffer.from('invalid status') };
      }
      return realSend.apply(c1PeerManager.reqresp, [peerId, ...rest]); // no bound closure
    });

    await startTestP2PClients(clients);
    logger.info(`Started p2p clients`, { enrs: clients.map(c => c.getEnr()?.encodeTxt) });
    await sleep(5000);
    logger.info(`Finished waiting for clients to connect`);

    expect(disconnectSpies[1]).toHaveBeenCalled(); // c1 <> C0 disconnected
    expect(disconnectSpies[2]).not.toHaveBeenCalled(); // c2 is ok with both c0 and c1

    const expectedHandshakeCount = peerTestCount - 1;
    // c2 established connection exactly once with both c0 and c1
    expect(statusHandshakeSpies[2]).toHaveBeenCalledTimes(expectedHandshakeCount);

    // c1 received invalid status from c0 exactly once
    // the connection between c0 and c1 might have been retried in the meantime
    // I say "might" because the test is flaky especially on CI
    // This is why we use `toBeGreaterThanOrEqual` instead of `toHaveBeenCalledTimes`
    expect(statusHandshakeSpies[0].mock.calls.length).toBeGreaterThanOrEqual(expectedHandshakeCount);
    expect(statusHandshakeSpies[1].mock.calls.length).toBeGreaterThanOrEqual(expectedHandshakeCount);
  });

  it('propagates messages using mocked gossip sub network', async () => {
    const numberOfNodes = 3;
    const mockGossipSubNetwork = new MockGossipSubNetwork();

    const testConfig = {
      p2pBaseConfig: { ...p2pBaseConfig, rollupVersion: 1 },
      mockAttestationPool: attestationPool,
      mockTxPool: txPool,
      mockEpochCache: epochCache,
      mockWorldState: worldState,
      alwaysTrueVerifier: true,
      mockGossipSubNetwork,
    };

    const clientsAndConfig = await makeAndStartTestP2PClients(numberOfNodes, testConfig);
    clients = clientsAndConfig.map(c => c.client);

    await sleep(1000);

    await assertBroadcast(clients);
  });
});
