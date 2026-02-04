import type { EpochCache } from '@aztec/epoch-cache';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { makeBlockHeader, makeBlockProposal, mockTx } from '@aztec/stdlib/testing';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PClient } from '../../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPoolV2 } from '../../mem_pools/tx_pool_v2/interfaces.js';
import { BatchTxRequester } from '../../services/reqresp/batch-tx-requester/batch_tx_requester.js';
import type { BatchTxRequesterLibP2PService } from '../../services/reqresp/batch-tx-requester/interface.js';
import type { IBatchRequestTxValidator } from '../../services/reqresp/batch-tx-requester/tx_validator.js';
import type { ConnectionSampler } from '../../services/reqresp/connection-sampler/connection_sampler.js';
import { generatePeerIdPrivateKeys } from '../../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../../test-helpers/get-ports.js';
import { makeEnrs } from '../../test-helpers/make-enrs.js';
import { makeAndStartTestP2PClient, makeAndStartTestP2PClients } from '../../test-helpers/make-test-p2p-clients.js';

const TEST_TIMEOUT = 120_000;
jest.setTimeout(TEST_TIMEOUT);

describe('p2p client integration batch txs', () => {
  let txPool: MockProxy<TxPoolV2>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochCache: MockProxy<EpochCache>;
  let worldState: MockProxy<WorldStateSynchronizer>;

  let mockP2PService: MockProxy<BatchTxRequesterLibP2PService>;
  let connectionSampler: MockProxy<ConnectionSampler>;
  let txValidator: IBatchRequestTxValidator;

  let logger: Logger;
  let p2pBaseConfig: P2PConfig;

  let clients: P2PClient[] = [];

  beforeEach(() => {
    clients = [];
    txPool = mock<TxPoolV2>();
    attestationPool = mock<AttestationPool>();
    epochCache = mock<EpochCache>();
    worldState = mock<WorldStateSynchronizer>();
    connectionSampler = mock<ConnectionSampler>();
    mockP2PService = mock<BatchTxRequesterLibP2PService>({ connectionSampler });
    txValidator = {
      validateRequestedTx: () => Promise.resolve({ result: 'valid' }),
      validateRequestedTxs: txs => Promise.resolve(txs.map(() => ({ result: 'valid' }))),
    };

    logger = createLogger('p2p:test:integration:batch');
    p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig() };

    //@ts-expect-error - we want to mock the getEpochAndSlotInNextL1Slot method, mocking ts is enough
    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({ ts: BigInt(0) });
    epochCache.getRegisteredValidators.mockResolvedValue([]);

    txPool.hasTxs.mockResolvedValue([]);
    txPool.addPendingTxs.mockResolvedValue({ accepted: [], ignored: [], rejected: [] });
    txPool.getTxsByHash.mockImplementation(() => {
      return Promise.resolve([] as Tx[]);
    });

    worldState.status.mockResolvedValue({
      state: mock(),
      syncSummary: {
        latestBlockNumber: BlockNumber(0),
        latestBlockHash: '',
        finalizedBlockNumber: BlockNumber(0),
        treesAreSynched: false,
        oldestHistoricBlockNumber: BlockNumber(0),
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

  const createBlockProposal = (blockNumber: number, archiveRoot: Fr, txHashes: TxHash[]) => {
    return makeBlockProposal({
      signer: Secp256k1Signer.random(),
      blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(blockNumber) }),
      archiveRoot,
      txHashes,
    });
  };

  const setupClients = async (numberOfPeers: number, txPoolMocks?: MockProxy<TxPoolV2>[]) => {
    if (txPoolMocks) {
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
      const peerEnrs = await makeEnrs(peerIdPrivateKeys, ports, p2pBaseConfig);

      for (let i = 0; i < numberOfPeers; i++) {
        const client = await makeAndStartTestP2PClient(peerIdPrivateKeys[i], ports[i], peerEnrs, {
          p2pBaseConfig,
          mockAttestationPool: attestationPool,
          mockTxPool: txPoolMocks[i],
          mockEpochCache: epochCache,
          mockWorldState: worldState,
          logger: createLogger(`p2p:${i}`),
        });
        clients.push(client);
      }

      return;
    }

    clients = (
      await makeAndStartTestP2PClients(numberOfPeers, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        logger,
      })
    ).map(x => x.client);
  };

  async function makeSureClientsAreStarted() {
    // Give the nodes time to discover each other
    await sleep(4000);
    for (const c of clients) {
      await retryUntil(async () => (await c.getPeers()).length == clients.length - 1, 'peers discovered', 12, 0.5);
    }

    logger.info('Finished waiting for clients to connect');
  }

  it('batch requester fetches all missing txs from multiple peers', async () => {
    const NUMBER_OF_PEERS = 4;

    const txCount = 20;
    const txs = await Promise.all(times(txCount, () => mockTx()));
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    const blockNumber = 5;
    const archiveRoot = Fr.random();
    const blockProposal = await createBlockProposal(blockNumber, archiveRoot, txHashes);

    // Distribute transactions across peers (simulating partial knowledge)
    // Peer 0 has no txs (client requesting)
    const peerTxDistribution = [
      { start: 0, end: 0 }, // Peer 0 (requester)
      { start: 0, end: 11 },
      { start: 6, end: 15 },
      { start: 10, end: 20 }, // Peer 3
    ];

    // Create individual txPool mocks for each peer
    const txPoolMocks: MockProxy<TxPoolV2>[] = [];
    for (let i = 0; i < NUMBER_OF_PEERS; i++) {
      const peerTxPool = mock<TxPoolV2>();
      const { start, end } = peerTxDistribution[i];
      const peerTxs = txs.slice(start, end);
      const peerTxHashSet = new Set(peerTxs.map(tx => tx.txHash.toString()));

      peerTxPool.hasTxs.mockImplementation((hashes: TxHash[]) => {
        return Promise.resolve(hashes.map(h => peerTxHashSet.has(h.toString())));
      });
      peerTxPool.getTxsByHash.mockImplementation((hashes: TxHash[]) => {
        return Promise.resolve(hashes.map(hash => peerTxs.find(t => t.txHash.equals(hash))));
      });

      txPoolMocks.push(peerTxPool);
    }

    await setupClients(NUMBER_OF_PEERS, txPoolMocks);
    await makeSureClientsAreStarted();

    const peerIds = clients.map(client => (client as any).p2pService.node.peerId);
    connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peerIds);

    attestationPool.getBlockProposal.mockResolvedValue(blockProposal);

    // Client 0 is missing all transactions
    const missingTxHashes = txHashes;

    // Create BatchTxRequester instance
    const [client0] = clients;
    mockP2PService.reqResp = (client0 as any).p2pService.reqresp;

    const requester = new BatchTxRequester(
      missingTxHashes,
      blockProposal,
      undefined, // no pinned peer
      5_000,
      mockP2PService,
      logger,
      undefined,
      { smartParallelWorkerCount: 10, dumbParallelWorkerCount: 10, txValidator },
    );

    const fetchedTxs = await BatchTxRequester.collectAllTxs(requester.run());

    // Verify all transactions were fetched
    expect(fetchedTxs).toBeDefined();
    const fetchedHashes = await Promise.all(fetchedTxs!.map(tx => tx.getTxHash()));
    expect(
      new Set(fetchedHashes.map(h => h.toString())).difference(new Set(txHashes.map(h => h.toString()))).size,
    ).toBe(0);
  });
});
