// An integration test for the p2p client to test req resp protocols
import type { EpochCache } from '@aztec/epoch-cache';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { BlockAttestation, BlockProposal, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { type MakeConsensusPayloadOptions, makeBlockProposal, makeHeader, mockTx } from '@aztec/stdlib/testing';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import type { Message, PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PClient } from '../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../config.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import { mockAttestation } from '../mem_pools/attestation_pool/mocks.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import type { LibP2PService } from '../services/libp2p/libp2p_service.js';
import { makeTestP2PClient, makeTestP2PClients } from '../test-helpers/make-test-p2p-clients.js';

const TEST_TIMEOUT = 120000;

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

  // Replace the tx handler on a client
  const replaceTxHandler = (client: P2PClient, promise: PromiseWithResolvers<Tx>) => {
    const p2pService = (client as any).p2pService as LibP2PService;
    // @ts-expect-error - we want to spy on received tx handler
    const oldTxHandler = p2pService.handleGossipedTx.bind(p2pService);

    // Mock the function to just call the old one
    const handleGossipedTxSpy = jest.fn(async (msg: Message, msgId: string, source: PeerId) => {
      promise.resolve(Tx.fromBuffer(Buffer.from(msg.data)));
      await oldTxHandler(msg, msgId, source);
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
    const handleGossipedProposalSpy = jest.fn(async (msg: Message, msgId: string, source: PeerId) => {
      promise.resolve(BlockProposal.fromBuffer(Buffer.from(msg.data)));
      await oldProposalHandler(msg, msgId, source);
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
    const handleGossipedAttestationSpy = jest.fn(async (msg: Message, msgId: string, source: PeerId) => {
      promise.resolve(BlockAttestation.fromBuffer(Buffer.from(msg.data)));
      await oldAttestationHandler(msg, msgId, source);
    });
    // @ts-expect-error - replace with our own handler
    p2pService.processAttestationFromPeer = handleGossipedAttestationSpy;

    return handleGossipedAttestationSpy;
  };

  describe('Req Resp', () => {
    it(
      'Returns undefined if unable to find a transaction from another peer',
      async () => {
        // We want to create a set of nodes and request transaction from them
        // Not using a before each as a the wind down is not working as expected
        clients = (
          await makeTestP2PClients(NUMBER_OF_PEERS, {
            p2pBaseConfig: { ...emptyChainConfig, ...getP2PDefaultConfig() },
            mockAttestationPool: attestationPool,
            mockTxPool: txPool,
            mockEpochCache: epochCache,
            mockWorldState: worldState,
          })
        ).map(x => x.client);
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
        clients = (
          await makeTestP2PClients(NUMBER_OF_PEERS, {
            p2pBaseConfig,
            mockAttestationPool: attestationPool,
            mockTxPool: txPool,
            mockEpochCache: epochCache,
            mockWorldState: worldState,
          })
        ).map(x => x.client);
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
        clients = (
          await makeTestP2PClients(NUMBER_OF_PEERS, {
            p2pBaseConfig,
            mockAttestationPool: attestationPool,
            mockTxPool: txPool,
            mockEpochCache: epochCache,
            mockWorldState: worldState,
            alwaysTrueVerifier: false,
          })
        ).map(x => x.client);
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
        clients = (
          await makeTestP2PClients(NUMBER_OF_PEERS, {
            p2pBaseConfig,
            mockAttestationPool: attestationPool,
            mockTxPool: txPool,
            mockEpochCache: epochCache,
            mockWorldState: worldState,
            alwaysTrueVerifier: true,
          })
        ).map(x => x.client);
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

    // Test creates 3 nodes. Node 1 sends all message types to others.
    // Test confirms that nodes 2 and 3 receive all messages.
    // Then nodes 2 and 3 are restarted, node 3 is restarted at a new version
    // Again, node 1 sends all message types.
    // Test confirms that node 2 receives all messages, node 3 receives none.
    it(
      'Will propagate messages to peers at the same version',
      async () => {
        // Create a set of nodes, client 1 will send a messages to other peers
        const numberOfNodes = 3;
        // We start at rollup version 1
        const testConfig = {
          p2pBaseConfig: { ...p2pBaseConfig, rollupVersion: 1 },
          mockAttestationPool: attestationPool,
          mockTxPool: txPool,
          mockEpochCache: epochCache,
          mockWorldState: worldState,
          alwaysTrueVerifier: true,
        };

        const clientsAndConfig = await makeTestP2PClients(numberOfNodes, testConfig);
        const [client1, client2, client3] = clientsAndConfig;

        // Give the nodes time to discover each other
        await sleep(6000);

        // Client 1 sends a tx a block proposal and an attestation and both clients 2 and 3 should receive them
        {
          const client2TxPromise = promiseWithResolvers<Tx>();
          const client2ProposalPromise = promiseWithResolvers<BlockProposal>();
          const client2AttestationPromise = promiseWithResolvers<BlockAttestation>();

          const client3TxPromise = promiseWithResolvers<Tx>();
          const client3ProposalPromise = promiseWithResolvers<BlockProposal>();
          const client3AttestationPromise = promiseWithResolvers<BlockAttestation>();

          // Replace the handlers on clients 2 and 3 so we can detect when they receive messages
          const client2HandleGossipedTxSpy = replaceTxHandler(client2.client, client2TxPromise);
          const client2HandleGossipedProposalSpy = replaceBlockProposalHandler(client2.client, client2ProposalPromise);
          const client2HandleGossipedAttestationSpy = replaceBlockAttestationHandler(
            client2.client,
            client2AttestationPromise,
          );

          const client3HandleGossipedTxSpy = replaceTxHandler(client3.client, client3TxPromise);
          const client3HandleGossipedProposalSpy = replaceBlockProposalHandler(client3.client, client3ProposalPromise);
          const client3HandleGossipedAttestationSpy = replaceBlockAttestationHandler(
            client3.client,
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
          client1.client.broadcastProposal(blockProposal);

          // client 1 sends an attestation
          const attestation = mockAttestation(
            Secp256k1Signer.random(),
            Number(dummyPayload.header!.getSlot()),
            dummyPayload.archive,
            dummyPayload.txHashes,
          );
          await (client1.client as any).p2pService.broadcastAttestation(attestation);

          // Clients 2 and 3 should receive all messages
          const messagesPromise = Promise.all([
            client2TxPromise.promise,
            client3TxPromise.promise,
            client2ProposalPromise.promise,
            client3ProposalPromise.promise,
            client2AttestationPromise.promise,
            client3AttestationPromise.promise,
          ]);
          const messages = await Promise.race([messagesPromise, sleep(2000).then(() => undefined)]);
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
        }

        // Now stop clients 2 and 3
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

        // Give everyone time to connect again
        await sleep(5000);

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
          client1.client.broadcastProposal(blockProposal);

          // client 1 sends an attestation
          const attestation = mockAttestation(
            Secp256k1Signer.random(),
            Number(dummyPayload.header!.getSlot()),
            dummyPayload.archive,
            dummyPayload.txHashes,
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
            Promise.race([client2MessagesPromises, sleep(2000).then(() => undefined)]),
            Promise.race([client3MessagesPromises, sleep(2000).then(() => undefined)]),
          ]);

          // We expect that all messages were received by client 2
          expect(client2Messages).toBeDefined();
          expect(client2HandleGossipedTxSpy).toHaveBeenCalled();
          expect(client2HandleGossipedProposalSpy).toHaveBeenCalled();
          expect(client2HandleGossipedAttestationSpy).toHaveBeenCalled();

          if (client2Messages) {
            const hashes = await Promise.all([tx, client2Messages[0]].map(tx => tx!.getTxHash()));
            expect(hashes[0].toString()).toEqual(hashes[1].toString());

            expect(client2Messages[1].payload.toString()).toEqual(blockProposal.payload.toString());
            expect(client2Messages[2].payload.toString()).toEqual(attestation.payload.toString());
          }

          // We expect that no messages were received by client 3
          expect(client3Messages).toBeUndefined();
          expect(client3HandleGossipedTxSpy).not.toHaveBeenCalled();
          expect(client3HandleGossipedProposalSpy).not.toHaveBeenCalled();
          expect(client3HandleGossipedAttestationSpy).not.toHaveBeenCalled();
        }

        await shutdown([client1.client, newClient2, newClient3]);
      },
      TEST_TIMEOUT,
    );
  });
});
