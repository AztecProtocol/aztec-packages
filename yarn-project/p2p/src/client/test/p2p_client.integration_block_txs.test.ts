import type { EpochCache } from '@aztec/epoch-cache';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { makeBlockProposal, makeL2BlockHeader, mockTx } from '@aztec/stdlib/testing';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PClient } from '../../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPool } from '../../mem_pools/tx_pool/index.js';
import { ReqRespSubProtocol } from '../../services/reqresp/interface.js';
import { BitVector } from '../../services/reqresp/protocols/block_txs/bitvector.js';
import { BlockTxsRequest, BlockTxsResponse } from '../../services/reqresp/protocols/block_txs/block_txs_reqresp.js';
import { ReqRespStatus } from '../../services/reqresp/status.js';
import { makeAndStartTestP2PClients } from '../../test-helpers/make-test-p2p-clients.js';

const TEST_TIMEOUT = 120000;
jest.setTimeout(TEST_TIMEOUT);

const NUMBER_OF_PEERS = 2;

describe('p2p client integration block txs protocol ', () => {
  let txPool: MockProxy<TxPool>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochCache: MockProxy<EpochCache>;
  let worldState: MockProxy<WorldStateSynchronizer>;

  let logger: Logger;
  let p2pBaseConfig: P2PConfig;

  let clients: P2PClient[] = [];

  const blockNumber = 5;
  const blockHash = Fr.random();
  let txs: any[];
  let txHashes: any[];

  beforeEach(async () => {
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

    // Give the nodes time to discover each other
    await sleep(5000);
    logger.info('Finished waiting for clients to connect');

    txs = await Promise.all(times(5, () => mockTx()));
    txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const blockProposal = createBlockProposal(blockNumber, blockHash, txHashes);
    attestationPool.getBlockProposal.mockResolvedValue(blockProposal);
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

  const createBlockProposal = (blockNumber: number, blockHash: any, txHashes: any[]) => {
    return makeBlockProposal({
      signer: Secp256k1Signer.random(),
      header: makeL2BlockHeader(1, blockNumber),
      archive: blockHash,
      txHashes,
    });
  };

  const sendBlockTxsRequest = (blockHash: Fr, requestedIndices: number[], txCount: number) => {
    const [client1, client2] = clients as any;
    const txIndices = BitVector.init(txCount, requestedIndices);
    const request = new BlockTxsRequest(blockHash, txIndices);
    return client1.p2pService.reqresp.sendRequestToPeer(
      client2.p2pService.node.peerId,
      ReqRespSubProtocol.BLOCK_TXS,
      request.toBuffer(),
    );
  };

  it('responds with NOT_FOUND when peer does not have the requested block proposal', async () => {
    attestationPool.getBlockProposal.mockResolvedValue(undefined);

    const response = await sendBlockTxsRequest(Fr.random(), [0, 2, 5], 10);

    expect(response.status).toBe(ReqRespStatus.NOT_FOUND);
  });

  it('responds with all requested txs when the peer has them', async () => {
    const hashToTx = new Map(txs.map((tx, i) => [txHashes[i].toString(), tx]));
    txPool.getTxsByHash.mockImplementation((hashes: TxHash[]) =>
      Promise.resolve(hashes.map(h => hashToTx.get(h.toString())!)),
    );

    txPool.hasTxs.mockImplementation((hashes: TxHash[]) => {
      const txsInPool = new Set(hashToTx.keys());
      return Promise.resolve(hashes.map(h => txsInPool.has(h.toString())));
    });

    const requestedIndices = [0, 2, 4];
    const response = await sendBlockTxsRequest(blockHash, requestedIndices, txs.length);

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);
    expect(blockTxsResponse.blockHash.equals(blockHash)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(requestedIndices.length);
    expect(blockTxsResponse.txIndices.getTrueIndices()).toEqual([0, 1, 2, 3, 4]);

    const expectedHashes = requestedIndices.map(index => txHashes[index]);
    const actualHashes = await Promise.all(blockTxsResponse.txs.map(tx => tx.getTxHash()));
    expect(actualHashes).toEqual(expectedHashes);
  });

  it('responds with partial txs when the peer has only some of them', async () => {
    const availableIndices = new Set([0, 2, 3]);
    const hashToTx: Map<string, Tx> = new Map(
      txs.map((tx, i) => [txHashes[i].toString(), tx] as [string, Tx]).filter((_, i) => availableIndices.has(i)),
    );

    txPool.getTxsByHash.mockImplementation((hashes: TxHash[]) => {
      return Promise.resolve(
        hashes.map(hash => {
          return hashToTx.get(hash.toString());
        }),
      );
    });

    txPool.hasTxs.mockImplementation((hashes: TxHash[]) => {
      const txsInPool = new Set(hashToTx.keys());
      return Promise.resolve(hashes.map(h => txsInPool.has(h.toString())));
    });

    const requestedIndices = [0, 1, 2, 4];
    const response = await sendBlockTxsRequest(blockHash, requestedIndices, txs.length);

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);
    expect(blockTxsResponse.blockHash.equals(blockHash)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(2); // Only txs at indices 0 and 2 are returned
    expect(blockTxsResponse.txIndices.getTrueIndices()).toEqual([0, 2, 3]);

    const expectedHashes = [0, 2].map(index => txHashes[index]);
    const actualHashes = await Promise.all(blockTxsResponse.txs.map(tx => tx.getTxHash()));
    expect(actualHashes).toEqual(expectedHashes);
  });

  it('responds with empty txs when the peer has none of the requested txs', async () => {
    txPool.getTxsByHash.mockResolvedValue([]);

    txPool.hasTxs.mockImplementation((hashes: TxHash[]) => {
      return Promise.resolve(hashes.map(_ => false));
    });

    const requestedIndices = [0, 2, 4];
    const response = await sendBlockTxsRequest(blockHash, requestedIndices, txs.length);

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);
    expect(blockTxsResponse.blockHash.equals(blockHash)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(0);
    expect(blockTxsResponse.txIndices.getTrueIndices()).toEqual([]);
  });
});
