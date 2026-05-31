import type { EpochCache } from '@aztec/epoch-cache';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { BlockProposal, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { makeBlockHeader, makeBlockProposal } from '@aztec/stdlib/testing';
import { Tx, TxHash, TxHashArray } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPoolV2 } from '../../mem_pools/tx_pool_v2/interfaces.js';
import { ReqRespSubProtocol } from '../../services/reqresp/interface.js';
import { BlockTxsRequest, BlockTxsResponse } from '../../services/reqresp/protocols/block_txs/block_txs_reqresp.js';
import { ReqRespStatus } from '../../services/reqresp/status.js';
import { makeAndStartTestP2PClients } from '../../test-helpers/index.js';
import { createMockTxWithMetadata } from '../../test-helpers/mock-tx-helpers.js';
import type { P2PClient } from '../p2p_client.js';

const TEST_TIMEOUT = 120000;
jest.setTimeout(TEST_TIMEOUT);

const NUMBER_OF_PEERS = 2;

describe('p2p client integration block txs protocol ', () => {
  let txPool: MockProxy<TxPoolV2>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochCache: MockProxy<EpochCache>;
  let worldState: MockProxy<WorldStateSynchronizer>;

  let logger: Logger;
  let p2pBaseConfig: P2PConfig;

  let clients: P2PClient[] = [];

  const blockNumber = BlockNumber(5);
  const archiveRoot = Fr.random();
  let txs: Tx[];
  let txHashes: TxHash[];
  let blockProposal: BlockProposal;

  beforeEach(async () => {
    txPool = mock<TxPoolV2>();
    attestationPool = mock<AttestationPool>();
    epochCache = mock<EpochCache>();
    worldState = mock<WorldStateSynchronizer>();

    logger = createLogger('p2p:test:integration');
    p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig() };

    //@ts-expect-error - we want to mock the getEpochAndSlotInNextL1Slot method, mocking ts is enough
    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({ ts: BigInt(0) });
    epochCache.getRegisteredValidators.mockResolvedValue([]);
    epochCache.getL1Constants.mockReturnValue({
      l1StartBlock: 0n,
      l1GenesisTime: 0n,
      slotDuration: 24,
      epochDuration: 16,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 2,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    });

    txPool.isEmpty.mockResolvedValue(true);
    txPool.hasTxs.mockResolvedValue([]);
    txPool.addPendingTxs.mockResolvedValue({ accepted: [], ignored: [], rejected: [] });
    txPool.getTxsByHash.mockImplementation(() => {
      return Promise.resolve([] as Tx[]);
    });

    attestationPool.isEmpty.mockResolvedValue(true);

    worldState.status.mockResolvedValue({
      state: mock(),
      syncSummary: {
        latestBlockNumber: BlockNumber.ZERO,
        latestBlockHash: '',
        finalizedBlockNumber: BlockNumber.ZERO,
        treesAreSynched: false,
        oldestHistoricBlockNumber: BlockNumber.ZERO,
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

    txs = await Promise.all(times(5, i => createMockTxWithMetadata(p2pBaseConfig, i)));
    txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    blockProposal = await createBlockProposal(BlockNumber(blockNumber), archiveRoot, txHashes);
    attestationPool.getBlockProposalByArchive.mockResolvedValue(blockProposal);
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

  const createBlockProposal = (blockNumber: BlockNumber, archiveRoot: Fr, txHashes: TxHash[]) => {
    return makeBlockProposal({
      signer: Secp256k1Signer.random(),
      blockHeader: makeBlockHeader(1, { blockNumber }),
      archiveRoot,
      txHashes,
    });
  };

  const sendBlockTxsRequest = (blockProposal: BlockProposal, missingHashes: TxHash[], includeFullTxHashes = false) => {
    const [client1, client2] = clients as any;
    const request = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, missingHashes, includeFullTxHashes);
    if (!request) {
      return undefined;
    }

    return client1.p2pService.reqresp.sendRequestToPeer(
      client2.p2pService.node.peerId,
      ReqRespSubProtocol.BLOCK_TXS,
      request.toBuffer(),
    );
  };

  it('responds with NOT_FOUND when peer does not have the requested block proposal', async () => {
    attestationPool.getBlockProposalByArchive.mockResolvedValue(undefined);
    const missing = new TxHashArray(...Array.from({ length: 4 }, () => TxHash.random()));

    const blockProposal = await createBlockProposal(blockNumber, Fr.random(), missing);
    const response = await sendBlockTxsRequest(blockProposal, missing);

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
    const response = await sendBlockTxsRequest(
      blockProposal,
      txHashes.filter((_, i) => requestedIndices.includes(i)),
    );
    //const response = await sendBlockTxsRequest(archiveRoot, requestedIndices, txs.length);

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);
    expect(blockTxsResponse.archiveRoot.equals(archiveRoot)).toBe(true);
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
    const response = await sendBlockTxsRequest(
      blockProposal,
      txHashes.filter((_, i) => requestedIndices.includes(i)),
    );

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);
    expect(blockTxsResponse.archiveRoot.equals(archiveRoot)).toBe(true);
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
    const response = await sendBlockTxsRequest(
      blockProposal,
      txHashes.filter((_, i) => requestedIndices.includes(i)),
    );

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);
    expect(blockTxsResponse.archiveRoot.equals(archiveRoot)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(0);
    expect(blockTxsResponse.txIndices.getTrueIndices()).toEqual([]);
  });

  it('responds with all requested txs when using includeFullTxHashes=true', async () => {
    const hashToTx = new Map(txs.map((tx, i) => [txHashes[i].toString(), tx]));
    txPool.getTxsByHash.mockImplementation((hashes: TxHash[]) =>
      Promise.resolve(hashes.map(h => hashToTx.get(h.toString())!)),
    );

    txPool.hasTxs.mockImplementation((hashes: TxHash[]) => {
      const txsInPool = new Set(hashToTx.keys());
      return Promise.resolve(hashes.map(h => txsInPool.has(h.toString())));
    });

    const requestedIndices = [1, 3, 4];
    const response = await sendBlockTxsRequest(
      blockProposal,
      txHashes.filter((_, i) => requestedIndices.includes(i)),
      true, // includeFullTxHashes=true
    );

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);
    expect(blockTxsResponse.archiveRoot.equals(archiveRoot)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(requestedIndices.length);
    expect(blockTxsResponse.txIndices.getTrueIndices()).toEqual([0, 1, 2, 3, 4]);

    const expectedHashes = requestedIndices.map(index => txHashes[index]);
    const actualHashes = await Promise.all(blockTxsResponse.txs.map(tx => tx.getTxHash()));
    expect(actualHashes).toEqual(expectedHashes);
  });

  it('responds with partial txs when peer has some and request uses full hashes', async () => {
    const availableIndices = new Set([1, 3]); // Only have txs at indices 1 and 3
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

    const requestedIndices = [0, 1, 3, 4]; // Request 4 txs but only 2 are available
    const response = await sendBlockTxsRequest(
      blockProposal,
      txHashes.filter((_, i) => requestedIndices.includes(i)),
      true, // includeFullTxHashes=true
    );

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);
    expect(blockTxsResponse.archiveRoot.equals(archiveRoot)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(2); // Only 2 txs returned
    expect(blockTxsResponse.txIndices.getTrueIndices()).toEqual([1, 3]); // Only indices 1 and 3 available

    const expectedHashes = [1, 3].map(index => txHashes[index]);
    const actualHashes = await Promise.all(blockTxsResponse.txs.map(tx => tx.getTxHash()));
    expect(actualHashes).toEqual(expectedHashes);
  });

  it('handles empty request when using includeFullTxHashes=true', async () => {
    txPool.getTxsByHash.mockResolvedValue([]);
    txPool.hasTxs.mockImplementation((hashes: TxHash[]) => {
      return Promise.resolve(hashes.map(_ => false));
    });

    const response = await sendBlockTxsRequest(blockProposal, [], true);

    expect(response).not.toBeDefined();
  });

  it('responds with txs when peer does not have proposal but has txs (includeFullTxHashes=true)', async () => {
    // Peer doesn't have the block proposal
    attestationPool.getBlockProposalByArchive.mockResolvedValue(undefined);

    // But peer has some of the requested txs in their pool
    const availableTxs = [txs[1], txs[3]];
    const availableHashes = [txHashes[1], txHashes[3]];
    const hashToTx = new Map(availableTxs.map((tx, i) => [availableHashes[i].toString(), tx]));

    txPool.getTxsByHash.mockImplementation((hashes: TxHash[]) => {
      return Promise.resolve(hashes.map(hash => hashToTx.get(hash.toString())).filter(tx => tx !== undefined));
    });

    const requestedHashes = [txHashes[1], txHashes[3], txHashes[4]]; // Request 3, but only 2 available
    const differentBlockProposal = await createBlockProposal(blockNumber, Fr.random(), txHashes);
    const response = await sendBlockTxsRequest(differentBlockProposal, requestedHashes, true);

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);

    // When peer doesn't have proposal but has txs, it returns Fr.ZERO as archive root
    expect(blockTxsResponse.archiveRoot.equals(Fr.ZERO)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(2); // Only 2 txs available
    expect(blockTxsResponse.txIndices.getLength()).toBe(0); // Empty BitVector when no proposal

    const actualHashes = await Promise.all(blockTxsResponse.txs.map(tx => tx.getTxHash()));
    expect(actualHashes).toEqual([txHashes[1], txHashes[3]]);
  });

  it('responds with partial txs when peer does not have proposal (includeFullTxHashes=true)', async () => {
    // Peer doesn't have the block proposal
    attestationPool.getBlockProposalByArchive.mockResolvedValue(undefined);

    // Peer has only one of the requested txs
    const availableTx = txs[2];
    const availableHash = txHashes[2];

    txPool.getTxsByHash.mockImplementation((hashes: TxHash[]) => {
      return Promise.resolve(
        hashes.map(hash => (hash.equals(availableHash) ? availableTx : undefined)).filter(tx => tx !== undefined),
      );
    });

    const requestedHashes = [txHashes[0], txHashes[2], txHashes[4]]; // Request 3, only 1 available
    const differentBlockProposal = await createBlockProposal(blockNumber, Fr.random(), txHashes);
    const response = await sendBlockTxsRequest(differentBlockProposal, requestedHashes, true);

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);

    expect(blockTxsResponse.archiveRoot.equals(Fr.ZERO)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(1); // Only 1 tx available
    expect(blockTxsResponse.txIndices.getLength()).toBe(0);

    const actualHashes = await Promise.all(blockTxsResponse.txs.map(tx => tx.getTxHash()));
    expect(actualHashes).toEqual([txHashes[2]]);
  });

  it('responds with empty txs when peer does not have proposal or txs (includeFullTxHashes=true)', async () => {
    // Peer doesn't have the block proposal
    attestationPool.getBlockProposalByArchive.mockResolvedValue(undefined);

    // Peer also doesn't have any of the requested txs
    txPool.getTxsByHash.mockResolvedValue([]);

    const requestedHashes = [txHashes[0], txHashes[2], txHashes[4]];
    const differentBlockProposal = await createBlockProposal(blockNumber, Fr.random(), txHashes);
    const response = await sendBlockTxsRequest(differentBlockProposal, requestedHashes, true);

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const blockTxsResponse = BlockTxsResponse.fromBuffer(response.data);

    expect(blockTxsResponse.archiveRoot.equals(Fr.ZERO)).toBe(true);
    expect(blockTxsResponse.txs.length).toBe(0); // No txs available
    expect(blockTxsResponse.txIndices.getLength()).toBe(0);
  });

  it('still responds with NOT_FOUND when peer does not have proposal and includeFullTxHashes=false', async () => {
    // Peer doesn't have the block proposal
    attestationPool.getBlockProposalByArchive.mockResolvedValue(undefined);

    // Even if peer has the txs in pool
    const hashToTx = new Map(txs.map((tx, i) => [txHashes[i].toString(), tx]));
    txPool.getTxsByHash.mockImplementation((hashes: TxHash[]) =>
      Promise.resolve(hashes.map(h => hashToTx.get(h.toString())!)),
    );

    const requestedHashes = [txHashes[1], txHashes[3]];
    const differentBlockProposal = await createBlockProposal(blockNumber, Fr.random(), txHashes);
    const response = await sendBlockTxsRequest(differentBlockProposal, requestedHashes, false); // includeFullTxHashes=false

    // Should get NOT_FOUND because without full tx hashes, handler can't return txs without proposal
    expect(response.status).toBe(ReqRespStatus.NOT_FOUND);
  });

  // When the responder takes the Fr.zero branch (no proposal/archived block locally, but matched
  // the requested hashes against its tx pool) it is acting correctly per block_txs_handler.ts:54-58.
  // Drive the response back through the requester's real validation and confirm it does NOT apply
  // a peer penalty — Fr.zero is a documented "I don't have the block" signal, not misbehavior.
  it('requester does not penalize peer that returns Fr.zero (peer lacks proposal but matched by hash)', async () => {
    attestationPool.getBlockProposalByArchive.mockResolvedValue(undefined);
    const hashToTx = new Map(txs.map((tx, i) => [txHashes[i].toString(), tx]));
    txPool.getTxsByHash.mockImplementation((hashes: TxHash[]) =>
      Promise.resolve(hashes.map(h => hashToTx.get(h.toString())!)),
    );

    const [client1, client2] = clients as any;
    const peerManager = client1.p2pService.peerManager;
    const penalizeSpy = jest.spyOn(peerManager, 'penalizePeer');

    // Build and send a real reqresp BLOCK_TXS request over libp2p (includeFullTxHashes=true so
    // the responder hits the Fr.zero branch instead of NOT_FOUND).
    const requestedHashes = [txHashes[1], txHashes[3]];
    const sourceProposal = await createBlockProposal(blockNumber, Fr.random(), txHashes);
    const request = BlockTxsRequest.fromTxsSourceAndMissingTxs(sourceProposal, requestedHashes, true)!;
    const response = await client1.p2pService.reqresp.sendRequestToPeer(
      client2.p2pService.node.peerId,
      ReqRespSubProtocol.BLOCK_TXS,
      request.toBuffer(),
    );

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    const decoded = BlockTxsResponse.fromBuffer(response.data);
    expect(decoded.archiveRoot.equals(Fr.ZERO)).toBe(true);

    // Run the response through client1's real validation — this is what BatchTxRequester does in
    // production. The peer must not be penalized.
    await (client1.p2pService as any).processor.validateRequestedBlockTxsConsistency(
      request,
      decoded,
      client2.p2pService.node.peerId,
    );

    expect(penalizeSpy).not.toHaveBeenCalledWith(expect.anything(), PeerErrorSeverity.MidToleranceError);
    expect(penalizeSpy).not.toHaveBeenCalledWith(expect.anything(), PeerErrorSeverity.LowToleranceError);
  });
});
