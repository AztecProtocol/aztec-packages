import { BlockNumber } from '@aztec/foundation/branded-types';
import { chunk } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { type ISemaphore, Semaphore } from '@aztec/foundation/queue';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { makeBlockHeader, makeBlockProposal } from '@aztec/stdlib/testing';
import { Tx, TxArray, TxHash, type TxValidationResult } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { createSecp256k1PeerId } from '../../../index.js';
import type { ConnectionSampler } from '../connection-sampler/connection_sampler.js';
import type { ReqRespInterface } from '../interface.js';
import { BitVector, BlockTxsRequest, BlockTxsResponse } from '../protocols/index.js';
import { ReqRespStatus } from '../status.js';
import { BatchTxRequester } from './batch_tx_requester.js';
import { DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD, DEFAULT_BATCH_TX_REQUESTER_TX_BATCH_SIZE } from './config.js';
import type { BatchTxRequesterLibP2PService, IPeerPenalizer } from './interface.js';
import { MissingTxsTracker } from './missing_txs.js';
import { type IPeerCollection, PeerCollection, RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL } from './peer_collection.js';
import type { IBatchRequestTxValidator } from './tx_validator.js';

/** Mock tx validator for testing that always returns valid */
class AlwaysValidTxValidator implements IBatchRequestTxValidator {
  validateRequestedTx(_tx: Tx): Promise<TxValidationResult> {
    return Promise.resolve({ result: 'valid' });
  }
  validateRequestedTxs(txs: Tx[]): Promise<TxValidationResult[]> {
    return Promise.resolve(txs.map(() => ({ result: 'valid' })));
  }
}

const TEST_TIMEOUT = 15_000;
const TX_BATCH_SIZE = DEFAULT_BATCH_TX_REQUESTER_TX_BATCH_SIZE;
const BAD_PEER_THRESHOLD = DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD;
jest.setTimeout(TEST_TIMEOUT);

describe('BatchTxRequester', () => {
  let logger: Logger;
  let blockProposal: BlockProposal;
  let connectionSampler: MockProxy<ConnectionSampler>;
  let reqResp: MockProxy<ReqRespInterface>;
  let mockP2PService: MockProxy<BatchTxRequesterLibP2PService>;
  let txValidator: IBatchRequestTxValidator;

  beforeEach(async () => {
    logger = createLogger('test');
    connectionSampler = mock<ConnectionSampler>();
    reqResp = mock<ReqRespInterface>();
    const peerScoring = mock<IPeerPenalizer>();
    mockP2PService = mock<BatchTxRequesterLibP2PService>({
      connectionSampler,
      reqResp,
      peerScoring,
    });
    txValidator = new AlwaysValidTxValidator();

    const signer = Secp256k1Signer.random();
    const archiveRoot = Fr.random();
    blockProposal = await makeBlockProposal({
      signer,
      blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
      archiveRoot,
      txHashes: [],
    });
  });

  describe('Dumb peers', () => {
    it('should create correct TX_BATCH_SIZE chunks with single dumb worker', async () => {
      const txCount = 16;
      const deadline = 10_000;
      const rounds = Math.ceil(txCount / TX_BATCH_SIZE);
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peerId = await createSecp256k1PeerId();
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue([peerId]);

      const { requestLog, requestCount, mockImplementation } = createRequestLogger(blockProposal);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const clock = new TestClock();

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        clock,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 1,
          txValidator,
        },
      );

      const runPromise = BatchTxRequester.collectAllTxs(requester.run());

      await retryUntil(() => (requestCount() === rounds ? true : undefined), 'waitFor', 10, 0.01);
      clock.advanceTo(deadline + 1);

      await runPromise;

      const batches = requestLog.get(peerId.toString())?.map(r => r.txs) || [];
      const expectedBatches = chunk(
        missing.map(h => h.toString()),
        TX_BATCH_SIZE,
      );

      expect(batches.map(b => b.length).every(b => b === TX_BATCH_SIZE)).toBeTruthy();
      expect(batches).toEqual(expectedBatches);
    });

    it('should distribute batches correctly across 3 peers with multiple rounds', async () => {
      const txCount = 3 * TX_BATCH_SIZE + 1;
      const numberOfRounds = 2; //Number of requests per peer

      const deadline = 10_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);

      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const { requestLog, requestCount, mockImplementation } = createRequestLogger(blockProposal);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const clock = new TestClock();

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        clock,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 3,
          txValidator,
        },
      );

      const runPromise = BatchTxRequester.collectAllTxs(requester.run());

      await retryUntil(() => (requestCount() == numberOfRounds * peers.length ? true : undefined), 'waitFor', 10, 0.01);
      clock.advanceTo(deadline + 1);

      await runPromise;

      // 2 rounds of requests per peer
      expect(requestCount() / peers.length).toEqual(numberOfRounds);
      expect(
        Array.from(requestLog.values())
          .map(r => r.length)
          .every(v => v == numberOfRounds),
      ).toBeTruthy();

      // Note we cannot do here: const [peer1, peer2, peer3] = peers;
      // This is because we have 3 concurrent workers, and it might be
      // that first peer in the list above is not the first one that is able to make the request
      const [peer1, peer2, peer3] = requestLog.keys();

      const peer1Requests = requestLog.get(peer1.toString()) || [];
      const peer2Requests = requestLog.get(peer2.toString()) || [];
      const peer3Requests = requestLog.get(peer3.toString()) || [];

      // With txCount=25 and TX_BATCH_SIZE=8, we get 4 chunks after wrap-around padding:
      // Chunk 0: [0-7], Chunk 1: [8-15], Chunk 2: [16-23], Chunk 3: [24, 0-6]
      // (Chunk 3 wraps around to ensure every batch has exactly TX_BATCH_SIZE items)
      //
      // Workers share a round-robin index that advances globally across all workers.
      //
      // Round 1: Workers take chunks 0, 1, 2 respectively
      expect(peer1Requests[0].indices).toEqual(Array.from({ length: TX_BATCH_SIZE }, (_, i) => i));
      expect(peer2Requests[0].indices).toEqual(Array.from({ length: TX_BATCH_SIZE }, (_, i) => i + TX_BATCH_SIZE));
      expect(peer3Requests[0].indices).toEqual(Array.from({ length: TX_BATCH_SIZE }, (_, i) => i + 2 * TX_BATCH_SIZE));

      // Round 2: The shared round-robin index continues from where it left off (index 3).
      // - Peer1 takes chunk 3: [24, 0-6], then index wraps to 0
      // - Peer2 takes chunk 0: [0-7], index advances to 1
      // - Peer3 takes chunk 1: [8-15], index advances to 2
      // This cycling is intentional. It re-requests batches from different peers to maximize
      // chances of fetching missing transactions.
      expect(peer1Requests[1].indices).toEqual([
        ...Array.from({ length: TX_BATCH_SIZE - 1 }, (_, i) => i),
        txCount - 1,
      ]);
      expect(peer2Requests[1].indices).toEqual(Array.from({ length: TX_BATCH_SIZE }, (_, i) => i));
      expect(peer3Requests[1].indices).toEqual(Array.from({ length: TX_BATCH_SIZE }, (_, i) => i + TX_BATCH_SIZE));
    });

    it('should make sure dumb peers return transactions they have', async () => {
      const txCount = 20;
      const deadline = 10_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);
      const peerCollection = new TestPeerCollection(new PeerCollection(peers, undefined, new DateProvider()));

      // Define which transactions each peer has (same as happy path)
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 10 }, (_, i) => i)], // peer1: txs 0-9
        [peers[1].toString(), Array.from({ length: 7 }, (_, i) => i + 7)], // peer2: txs 7-13
        [peers[2].toString(), Array.from({ length: 11 }, (_, i) => i + 9)], // peer3: txs 9-19
      ]);

      const peerRequestCounts = new Map<string, number>();

      reqResp.sendRequestToPeer.mockImplementation(async (peerId, _sub, data) => {
        const request = BlockTxsRequest.fromBuffer(data);
        const requestedIndices = request.txIndices.getTrueIndices();

        // This is to make sure that even if the peers fail to respond each request
        // We will eventually get all the transactions
        const currentCount = peerRequestCounts.get(peerId.toString()) || 0;
        peerRequestCounts.set(peerId.toString(), currentCount + 1);
        const isOddRequest = (currentCount + 1) % 2 === 1;

        // Fail on odd-numbered requests
        await sleep(10);
        if (isOddRequest) {
          return {
            status: ReqRespStatus.FAILURE,
            data: Buffer.alloc(0),
          } as any;
        }

        // Succeed on even-numbered requests - return actual transactions
        const peerHasIndices = peerTransactions.get(peerId.toString()) || [];
        const availableIndices = requestedIndices.filter(idx => peerHasIndices.includes(idx));
        const availableTxHashes = availableIndices.map(idx => blockProposal.txHashes[idx]);
        const availableTxs = availableTxHashes.map(h => makeTx(h));

        const response = new BlockTxsResponse(
          blockProposal.archive,
          new TxArray(...availableTxs),
          BitVector.init(blockProposal.txHashes.length, peerHasIndices),
        );

        return {
          status: ReqRespStatus.SUCCESS,
          data: response.toBuffer(),
        };
      });

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 3,
          txBatchSize: txCount,
          peerCollection,
          txValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());
      expect(result).toBeDefined();

      // Verify all transactions were eventually fetched despite failures
      expect(result!.length).toBe(txCount);
      expect(new Set(result!.map(tx => tx.txHash.toString()))).toEqual(new Set(missing.map(tx => tx.toString())));

      // Failures are penalized but should not prevent eventual success in this scenario
      const penalizedPeers = new Set(peerCollection.peersPenalised.map(entry => entry.peerId));
      expect(penalizedPeers).toEqual(new Set(peers.map(peer => peer.toString())));
      expect(
        peerCollection.peersPenalised.every(entry => entry.severity === PeerErrorSeverity.HighToleranceError),
      ).toBe(true);
    });
  });

  describe('Smart peers', () => {
    it('If dumb peers returned no transactions there should not be any smart peers', async () => {
      const txCount = 16;
      const deadline = 1_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(peers.map(p => p.toString())));
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const semaphore = new TestSemaphore(new Semaphore(0));

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          semaphore, // inject test semaphore
          smartParallelWorkerCount: 1, // start one smart worker that will block on acquire()
          dumbParallelWorkerCount: 2,
          txValidator,
        },
      );

      await BatchTxRequester.collectAllTxs(requester.run());

      // This acquire/release here has to be 2 because we have to release semaphore on smart worker loops once we are done
      // We have 1 release in finally block of run()
      // And one after generator is done yielding
      // So that they don't block indefinitely on acquire() in the end
      expect(semaphore.releasedCount).toBe(2);
      expect(semaphore.acquiredCount).toBe(1);
    });

    it('Correctly promote single peer to smart peers', async () => {
      const txCount = 16;
      const deadline = 2_000;
      const dateProvider = new DateProvider();
      const pinnedPeer = undefined;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers, pinnedPeer, dateProvider);
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 16 }, (_, i) => i)], // peer1 has all transactions, peer2 none
      ]);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const semaphore = new TestSemaphore(new Semaphore(0));
      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        dateProvider,
        {
          semaphore,
          smartParallelWorkerCount: 2,
          dumbParallelWorkerCount: 2,
          peerCollection,
          txValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());
      expect(result).toBeDefined();
      expect(result!.length).toBe(txCount);

      // Verify peer promotion behavior
      expect(peerCollection.getSmartPeers().size).toBe(1);
      expect(peerCollection.getSmartPeers()).toContain(peers[0].toString());
      expect(peerCollection.getSmartPeers()).not.toContain(peers[1].toString());

      // The exact release count depends on timing of concurrent async operations.
      // We verify a minimum of 7 releases which accounts for:
      // - 1 release when peer is promoted to smart x2
      // - Releases from smart worker loops exiting (varies based on scheduling)
      expect(semaphore.releasedCount).toBeGreaterThanOrEqual(7);
      // Both smart workers will acquire semaphore
      // - The first one once it is promoted to smart peer
      // - The second one when dumb workers call release
      expect(semaphore.acquiredCount).toBe(2);
    });

    it('Should track smart peer collection behavior with multiple promotions', async () => {
      const txCount = 20;
      const deadline = 3_000;
      const dateProvider = new DateProvider();
      const pinnedPeer = undefined;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers, pinnedPeer, dateProvider);

      // Define which transactions each peer has
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 10 }, (_, i) => i)], // peer1: txs 0-9
        [peers[1].toString(), Array.from({ length: 10 }, (_, i) => i + 5)], // peer2: txs 5-14
        [peers[2].toString(), Array.from({ length: 10 }, (_, i) => i + 10)], // peer3: txs 10-19
      ]);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const semaphore = new TestSemaphore(new Semaphore(0));
      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        dateProvider,
        {
          semaphore,
          smartParallelWorkerCount: 3,
          dumbParallelWorkerCount: 3,
          peerCollection,
          txValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());
      expect(result).toBeDefined();
      expect(result!.length).toBe(txCount);

      // Verify all peers were promoted to smart
      expect(peerCollection.getSmartPeers().size).toBe(peers.length);
      expect(semaphore.acquiredCount).toBe(3);
    });

    it('Everything should work ok with multiple peers and only 1 smart and 1 dumb worker', async () => {
      const txCount = 20;
      const deadline = 5_000;
      const dateProvider = new DateProvider();
      const pinnedPeer = undefined;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers, pinnedPeer, dateProvider);

      // Define which transactions each peer has
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 6 }, (_, i) => i)], // peer1: txs 0-5
        [peers[1].toString(), Array.from({ length: 8 }, (_, i) => i + 6)], // peer2: txs 6-13
        [peers[2].toString(), Array.from({ length: 6 }, (_, i) => i + 14)], // peer3: txs 14-19
      ]);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const semaphore = new TestSemaphore(new Semaphore(0));
      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        dateProvider,
        {
          semaphore,
          smartParallelWorkerCount: 1,
          dumbParallelWorkerCount: 1,
          peerCollection,
          txValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());
      expect(result).toBeDefined();
      expect(result!.length).toBe(txCount);

      expect(semaphore.acquiredCount).toBe(1);
    });
  });

  describe('Bad peer threshold and recovery', () => {
    it('should mark peer as bad after exceeding threshold and exclude from queries', async () => {
      const txCount = 16;
      const deadline = 1_000;
      const dateProvider = new DateProvider();
      const pinnedPeer = undefined;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      const peerTransactions = new Map([
        [peers[1].toString(), Array.from({ length: 8 }, (_, i) => i)], // peer1 has only half of txs
      ]);

      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers, pinnedPeer, dateProvider);

      // Mock implementation that makes peer0 fail consistently, peer1 succeed
      const { mockImplementation } = createRequestLogger(
        blockProposal,
        new Set([peers[0].toString()]),
        peerTransactions,
      );
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);
      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        dateProvider,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 2,
          peerCollection,
          txValidator,
        },
      );

      await BatchTxRequester.collectAllTxs(requester.run());

      // Verify that peer0 is marked as bad after exceeding threshold (3 failures)
      // and peer1 is not marked as bad
      expect(peerCollection.getBadPeers()).toContain(peers[0].toString());
      expect(peerCollection.getBadPeers()).not.toContain(peers[1].toString());

      // Verify bad peer is excluded from queries - peer0 should be in bad peers
      expect(peerCollection.getDumbPeersToQuery()).not.toContain(peers[0].toString());
    });

    it('should recover bad peer after successful response', async () => {
      const txCount = 8;
      const deadline = 1_000;
      const dateProvider = new DateProvider();
      const pinnedPeer = undefined;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers, pinnedPeer, dateProvider);
      let requestCount = 0;

      // Mock implementation: first 4 requests fail (exceed threshold), then succeed
      // eslint-disable-next-line require-await
      reqResp.sendRequestToPeer.mockImplementation(async peerId => {
        if (peerId.toString() === peers[0].toString()) {
          requestCount++;

          if (requestCount <= BAD_PEER_THRESHOLD - 1) {
            return {
              status: ReqRespStatus.FAILURE,
              data: Buffer.alloc(0),
            };
          }
        }

        const someTxs = missing.slice(0, missing.length / 2).map(h => makeTx(h));
        const response = new BlockTxsResponse(
          blockProposal.archive,
          new TxArray(...someTxs),
          BitVector.init(blockProposal.txHashes.length, []),
        );

        return {
          status: ReqRespStatus.SUCCESS,
          data: response.toBuffer(),
        };
      });

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        dateProvider,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 1,
          peerCollection,
          txValidator,
        },
      );

      await BatchTxRequester.collectAllTxs(requester.run());

      // Verify peer was initially marked bad but then recovered
      // Since peer succeeded in the end, it should not be in bad peers list
      expect(peerCollection.getBadPeers()).not.toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).toContain(peers[0].toString());
    });

    it('should handle multiple peers with different bad peer states', async () => {
      const txCount = 16;
      const deadline = 5_000;
      const dateProvider = new DateProvider();
      const pinnedPeer = undefined;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([
        createSecp256k1PeerId(), // peer0: will be marked bad
        createSecp256k1PeerId(), // peer1: will stay good
        createSecp256k1PeerId(), // peer2: will be marked bad then recover
      ]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 3 }, (_, i) => i)], // peer1: txs 0-3
        [peers[1].toString(), Array.from({ length: 10 }, (_, i) => i)], // peer2: txs 0-9
        [peers[2].toString(), Array.from({ length: 9 }, (_, i) => i + 8)], // peer3: txs 8 - 16
      ]);

      const semaphore = new TestSemaphore(new Semaphore(0));
      const peerCollection = new PeerCollection(peers, pinnedPeer, dateProvider);
      const peerRequestCounts = new Map<string, number>();

      // eslint-disable-next-line require-await
      reqResp.sendRequestToPeer.mockImplementation(async (peerId: any, _sub: any, data: any) => {
        const peerStr = peerId.toString();
        const currentCount = peerRequestCounts.get(peerStr) || 0;
        peerRequestCounts.set(peerStr, currentCount + 1);

        if (peerStr === peers[0].toString()) {
          // peer0: always fails (will be marked permanently bad)
          return {
            status: ReqRespStatus.FAILURE,
            data: Buffer.alloc(0),
          };
        }

        const request = BlockTxsRequest.fromBuffer(data);
        const requestedIndices = request.txIndices.getTrueIndices();
        const peerHasIndices = peerTransactions.get(peerId.toString()) || [];
        const availableIndices = requestedIndices.filter(idx => peerHasIndices.includes(idx));
        const availableTxHashes = availableIndices.map(idx => blockProposal.txHashes[idx]);
        const availableTxs = availableTxHashes.map(h => makeTx(h));

        // peer1: always succeeds
        if (peerStr === peers[1].toString()) {
          const response = new BlockTxsResponse(
            blockProposal.archive,
            new TxArray(...availableTxs),
            BitVector.init(blockProposal.txHashes.length, availableIndices),
          );
          return {
            status: ReqRespStatus.SUCCESS,
            data: response.toBuffer(),
          };
        }

        if (peerStr === peers[2].toString()) {
          // peer2: fails first 4 times, then succeeds (recovery scenario)
          if (currentCount <= BAD_PEER_THRESHOLD - 1) {
            return {
              status: ReqRespStatus.FAILURE,
              data: Buffer.alloc(0),
            };
          }
          const response = new BlockTxsResponse(
            blockProposal.archive,
            new TxArray(...availableTxs),
            BitVector.init(blockProposal.txHashes.length, availableIndices),
          );
          return {
            status: ReqRespStatus.SUCCESS,
            data: response.toBuffer(),
          };
        }

        return {
          status: ReqRespStatus.FAILURE,
          data: Buffer.alloc(0),
        };
      });

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        dateProvider,
        {
          semaphore,
          peerCollection,
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 3,
          txValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());
      expect(result).toBeDefined();
      expect(result!.length).toBe(txCount);

      // Verify final peer states
      expect(peerCollection.getBadPeers()).toContain(peers[0].toString()); // peer0: permanently bad
      expect(peerCollection.getBadPeers()).not.toContain(peers[1].toString()); // peer1: always good
      expect(peerCollection.getBadPeers()).not.toContain(peers[2].toString()); // peer2: recovered

      // Verify query availability
      const dumbPeersToQuery = peerCollection.getDumbPeersToQuery();
      expect(dumbPeersToQuery).not.toContain(peers[0].toString()); // bad peer excluded
      expect(dumbPeersToQuery).toContain(peers[1].toString()); // good peer included
      expect(dumbPeersToQuery).toContain(peers[2].toString()); // recovered peer included

      // Peers might be marked as smart but no semaphore releases should happen
      // because smartParallelWorkerCount is 0
      expect(semaphore.releasedCount).toBe(0);
      expect(semaphore.acquiredCount).toBe(0);
    });
  });

  describe('Rate limit handling', () => {
    it('should automatically recover peers after TTL expiration', async () => {
      const clock = new TestClock();
      const pinnedPeer = undefined;

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new TestPeerCollection(new PeerCollection(peers, pinnedPeer, clock));

      // Manually mark peer as rate limited
      peerCollection.markPeerRateLimitExceeded(peers[0]);

      // Verify peer is initially rate limited and excluded
      expect(peerCollection.getRateLimitExceededPeers()).toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).not.toContain(peers[0].toString());

      // Test TTL behavior at different time points

      // Just before TTL expiration: still rate limited
      clock.advanceTo(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL - 1);
      expect(peerCollection.getRateLimitExceededPeers()).toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).not.toContain(peers[0].toString());

      // Right at TTL expiration: not rate limited anymore
      clock.advanceTo(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL);
      expect(peerCollection.getRateLimitExceededPeers()).not.toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).toContain(peers[0].toString());

      // After TTL expiration: not rate limited anymore
      clock.advanceTo(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL + 1);
      expect(peerCollection.getRateLimitExceededPeers()).not.toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).toContain(peers[0].toString());

      // Test multiple rate limit cycles
      peerCollection.markPeerRateLimitExceeded(peers[0]); // Rate limit again
      expect(peerCollection.getRateLimitExceededPeers()).toContain(peers[0].toString());

      clock.advanceTo(clock.now() + RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL + 1);
      expect(peerCollection.getRateLimitExceededPeers()).not.toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).toContain(peers[0].toString());
    });

    it('should exclude rate limited peer from queries and recover after TTL expiration', async () => {
      const txCount = 8;
      const deadline = 2_000;
      const clock = new TestClock();
      const pinnedPeer = undefined;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const innerPeerCollection = new PeerCollection(peers, pinnedPeer, clock);
      const peerCollection = new TestPeerCollection(innerPeerCollection);

      const peerTransactions = new Map([
        [peers[1].toString(), Array.from({ length: txCount }, (_, i) => i)], // peer1 has all transactions
      ]);

      let requestCount = 0;
      // eslint-disable-next-line require-await
      reqResp.sendRequestToPeer.mockImplementation(async (peerId: any) => {
        const peerStr = peerId.toString();
        // First 2 request to peer0 will be rate limited
        if (peerStr === peers[0].toString() && requestCount < 1) {
          requestCount++;
          return {
            status: ReqRespStatus.RATE_LIMIT_EXCEEDED,
            data: Buffer.alloc(0),
          };
        }

        // All other requests succeed
        const peerHasIndices = peerTransactions.get(peerStr) || [];
        const availableTxHashes = peerHasIndices.map(idx => blockProposal.txHashes[idx]);
        const availableTxs = availableTxHashes.map(h => makeTx(h));

        const response = new BlockTxsResponse(
          blockProposal.archive,
          new TxArray(...availableTxs),
          BitVector.init(blockProposal.txHashes.length, peerHasIndices),
        );

        return {
          status: ReqRespStatus.SUCCESS,
          data: response.toBuffer(),
        };
      });

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        clock,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 2,
          peerCollection,
          txValidator,
        },
      );

      // Start the requester
      const runPromise = BatchTxRequester.collectAllTxs(requester.run());

      // Let some time for requests to be sent
      await sleep(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL + 1);

      //Advance time to make sure we are done
      clock.advanceTo(Math.max(deadline, RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL + 1));

      // Wait for the requester to complete
      await runPromise;

      // Peer0 should have been rate limited
      expect(peerCollection.peersMarkedRateLimitExceeded).toContain(peers[0].toString());
      expect(peerCollection.peersMarkedRateLimitExceeded).not.toContain(peers[1].toString());

      // Verify peer0 is no longer rate limited after TTL expiration
      expect(peerCollection.getRateLimitExceededPeers().size).toBe(0);
      expect(peerCollection.getDumbPeersToQuery()).toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).toContain(peers[1].toString());
    });
  });

  describe('Stopping', () => {
    it('should stop requesting when deadline is reached', async () => {
      const shortDeadline = 20;
      const txCount = 20;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peerId = await createSecp256k1PeerId();
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue([peerId]);

      // Slow responses to test deadline
      const { requestLog, mockImplementation } = createRequestLogger(
        blockProposal,
        new Set(),
        new Map(),
        shortDeadline / 4,
      );

      const { promise: onFirstRequest, resolve: signalFirstRequest } = promiseWithResolvers<void>();
      let firstRequestSent = false;
      reqResp.sendRequestToPeer.mockImplementation(async (peerId, sub, data) => {
        if (!firstRequestSent) {
          firstRequestSent = true;
          signalFirstRequest();
        }
        return await mockImplementation(peerId, sub, data);
      });

      const clock = new TestClock();

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        shortDeadline,
        mockP2PService,
        logger,
        clock,
        {
          smartParallelWorkerCount: 1,
          dumbParallelWorkerCount: 1,
          txValidator,
        },
      );

      const runPromise = BatchTxRequester.collectAllTxs(requester.run());

      // Wait for first request, then advance clock past deadline
      await onFirstRequest;
      clock.advanceTo(shortDeadline + 1);

      await runPromise;

      // Should complete due to deadline, not because all txs were fetched
      const totalRequestedTxs = requestLog.get(peerId.toString())?.flatMap(r => r.txs).length || 0;
      expect(totalRequestedTxs).toBeGreaterThan(0);
      expect(totalRequestedTxs).toBeLessThan(txCount);
    });
    it('should abort immediately when signal is triggered before starting', async () => {
      const txCount = 10;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      // Create abort controller and immediately abort
      const abortController = new AbortController();
      abortController.abort();

      let requestsMade = 0;
      // eslint-disable-next-line require-await
      reqResp.sendRequestToPeer.mockImplementation(async () => {
        requestsMade++;
        // This should never be called since we abort immediately
        return {
          status: ReqRespStatus.SUCCESS,
          data: Buffer.alloc(0),
        };
      });

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 2,
          dumbParallelWorkerCount: 2,
          abortSignal: abortController.signal,
          txValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());
      expect(requestsMade).toBe(0);
      expect(result).toEqual([]);
    });

    it('should abort mid-execution during transaction fetching', async () => {
      const txCount = 30;
      const deadline = 2_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 10 }, (_, i) => i)],
        [peers[1].toString(), Array.from({ length: 10 }, (_, i) => i + 10)],
        [peers[2].toString(), Array.from({ length: 10 }, (_, i) => i + 20)],
      ]);

      const abortController = new AbortController();
      let requestCount = 0;

      reqResp.sendRequestToPeer.mockImplementation(async (peerId: any) => {
        if (requestCount === 1) {
          abortController.abort();
        }

        // Return successful response with transactions
        const peerStr = peerId.toString();
        const peerHasIndices = peerTransactions.get(peerStr) || [];
        const availableTxHashes = peerHasIndices.map(idx => blockProposal.txHashes[idx]);
        const availableTxs = availableTxHashes.map(h => makeTx(h));

        const response = new BlockTxsResponse(
          blockProposal.archive,
          new TxArray(...availableTxs),
          BitVector.init(blockProposal.txHashes.length, peerHasIndices),
        );

        requestCount++;

        // Allow event loop to process abort signal
        await sleep(50);
        return {
          status: ReqRespStatus.SUCCESS,
          data: response.toBuffer(),
        };
      });

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 2,
          abortSignal: abortController.signal,
          txValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());

      // Verify abort was actually triggered
      expect(abortController.signal.aborted).toBe(true);

      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);
      expect(result!.length).toBeLessThan(txCount); // Not all transactions fetched
    });

    it('should abort smart workers waiting on semaphore', async () => {
      // so that we can promote single peer to the smart, but they should not have all txs so that abort is observed
      const txCount = TX_BATCH_SIZE * 2 + 2;
      const deadline = 10_000;
      const clock = new TestClock();
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new TestPeerCollection(new PeerCollection(peers, undefined, clock));

      const peerTransactions = new Map([[peers[0].toString(), Array.from({ length: txCount / 2 }, (_, i) => i)]]);
      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions, 100);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const abortController = new AbortController();

      // Create semaphore that starts with 0 permits to block smart workers
      const semaphore = new TestSemaphore(new Semaphore(0));
      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        clock,
        {
          semaphore,
          smartParallelWorkerCount: 2,
          dumbParallelWorkerCount: 2,
          peerCollection,
          abortSignal: abortController.signal,
          txValidator,
        },
      );

      const runPromise = BatchTxRequester.collectAllTxs(requester.run());

      await sleep(1000); // Allow some time for smart workers to start and block on semaphore
      abortController.abort(); // Trigger abort while smart workers are blocked
      const result = await runPromise;

      // Verify abort was triggered
      expect(abortController.signal.aborted).toBe(true);

      // Verify peer was promoted to smart
      expect(peerCollection.smartPeersMarked).toContain(peers[0].toString());

      // Verify some initial transactions were fetched before blocking
      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThanOrEqual(TX_BATCH_SIZE);
      expect(result!.length).toBeLessThan(txCount); // Not all due to abort
    });
  });

  describe('Transaction validation', () => {
    it('should only yield valid transactions and filter out invalid ones', async () => {
      const txCount = 10;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);
      const peerCollection = new TestPeerCollection(new PeerCollection(peers, undefined, new DateProvider()));

      // Define which transactions each peer has
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 5 }, (_, i) => i)], // peer1: txs 0-4
        [peers[1].toString(), Array.from({ length: 5 }, (_, i) => i + 5)], // peer2: txs 5-9
      ]);

      const invalidTxIndices = new Set([2, 3, 7]); // Mark transactions at indices 2, 3, and 7 as invalid

      const customValidator: IBatchRequestTxValidator = {
        validateRequestedTx: (tx: Tx) => {
          const txIndex = missing.findIndex(h => h.equals(tx.txHash));
          const isInvalid = invalidTxIndices.has(txIndex);
          return Promise.resolve(isInvalid ? { result: 'invalid', reason: ['test invalid'] } : { result: 'valid' });
        },
        validateRequestedTxs: (txs: Tx[]) => Promise.all(txs.map(tx => customValidator.validateRequestedTx(tx))),
      };

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 2,
          txBatchSize: txCount,
          peerCollection,
          txValidator: customValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());

      const expectedValidCount = txCount - invalidTxIndices.size;

      expect(result.length).toBe(expectedValidCount);

      // Verify that invalid transactions are NOT in the result
      const resultTxHashes = new Set(result.map(tx => tx.txHash.toString()));
      invalidTxIndices.forEach(invalidIndex => {
        const invalidTxHash = missing[invalidIndex].toString();
        expect(resultTxHashes.has(invalidTxHash)).toBe(false);
      });

      // Verify that valid transactions ARE in the result
      const validIndices = Array.from({ length: txCount }, (_, i) => i).filter(i => !invalidTxIndices.has(i));
      validIndices.forEach(validIndex => {
        const validTxHash = missing[validIndex].toString();
        expect(resultTxHashes.has(validTxHash)).toBe(true);
      });

      // Invalid txs should penalize peers with low tolerance severity
      const penalizedPeers = new Set(peerCollection.peersPenalised.map(entry => entry.peerId));
      expect(penalizedPeers).toEqual(new Set(peers.map(peer => peer.toString())));
      expect(peerCollection.peersPenalised.every(entry => entry.severity === PeerErrorSeverity.LowToleranceError)).toBe(
        true,
      );
    });

    it('should handle mixed valid and invalid transactions from multiple peers', async () => {
      const txCount = 12;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerTransactions = new Map([
        [peers[0].toString(), [0, 1, 2, 3, 4]],
        [peers[1].toString(), [2, 3, 4, 5, 6, 7, 8]],
        [peers[2].toString(), [0, 6, 7, 8, 9, 10, 11]],
      ]);

      // Validator that rejects transactions at specific indices
      // Even indices are rejected, odd indices are accepted
      const invalidTxIndices = new Set([0, 2, 4, 6, 8, 10]);
      const mixedValidator: IBatchRequestTxValidator = {
        validateRequestedTx: (tx: Tx) => {
          const txIndex = missing.findIndex(h => h.equals(tx.txHash));
          const isInvalid = invalidTxIndices.has(txIndex);
          return Promise.resolve(isInvalid ? { result: 'invalid', reason: ['test invalid'] } : { result: 'valid' });
        },
        validateRequestedTxs: (txs: Tx[]) => Promise.all(txs.map(tx => mixedValidator.validateRequestedTx(tx))),
      };

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 3,
          txValidator: mixedValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());

      // Verify we got only valid transactions (odd indices: 1, 3, 5, 7, 9, 11)
      const expectedValidCount = txCount - invalidTxIndices.size;
      expect(result.length).toBe(expectedValidCount);

      // Verify no duplicates in result
      const uniqueTxHashes = new Set(result.map(tx => tx.txHash.toString()));
      expect(uniqueTxHashes.size).toBe(result.length);

      // Verify invalid transactions are NOT in the result
      invalidTxIndices.forEach(invalidIndex => {
        expect(uniqueTxHashes.has(missing[invalidIndex].toString())).toBe(false);
      });
    });

    it('should handle validator throwing errors gracefully', async () => {
      const txCount = 8;
      const deadline = 3_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peer = await createSecp256k1PeerId();
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue([peer]);

      // Validator that throws errors for specific transactions
      const throwingValidator: IBatchRequestTxValidator = {
        validateRequestedTx: (tx: Tx) => {
          const txIndex = missing.findIndex(h => h.equals(tx.txHash));

          // Throw error for transactions at indices 1 and 3
          if (txIndex === 1 || txIndex === 3) {
            return Promise.reject(new Error(`Validation error for tx at index ${txIndex}`));
          }

          // Reject transaction at index 5 normally
          if (txIndex === 5) {
            return Promise.resolve({ result: 'invalid', reason: ['test rejected'] });
          }

          return Promise.resolve({ result: 'valid' });
        },
        validateRequestedTxs: (txs: Tx[]) => Promise.all(txs.map(tx => throwingValidator.validateRequestedTx(tx))),
      };

      const peerTransactions = new Map([[peer.toString(), Array.from({ length: txCount }, (_, i) => i)]]);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 1,
          txValidator: throwingValidator,
        },
      );

      const result = await BatchTxRequester.collectAllTxs(requester.run());

      // Expected: 8 total - 2 that threw errors - 1 that returned false = 5 valid txs
      expect(result.length).toBe(5);

      // Verify that transactions that threw errors are NOT in result
      const resultTxHashes = new Set(result.map(tx => tx.txHash.toString()));
      expect(resultTxHashes.has(missing[1].toString())).toBe(false);
      expect(resultTxHashes.has(missing[3].toString())).toBe(false);
      expect(resultTxHashes.has(missing[5].toString())).toBe(false);

      // Verify that valid transactions ARE in result
      [0, 2, 4, 6, 7].forEach(validIndex => {
        expect(resultTxHashes.has(missing[validIndex].toString())).toBe(true);
      });
    });
  });

  describe('External fetching', () => {
    it('should not request transactions that were marked as fetched externally', async () => {
      const txCount = 16;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peer = await createSecp256k1PeerId();
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue([peer]);

      const tracker = new MissingTxsTracker(new Set(missing.map(TxHash.toString)));

      // Peer has only first half of transactions
      const peerTransactions = new Map([[peer.toString(), Array.from({ length: TX_BATCH_SIZE }, (_, i) => i)]]);
      const { requestLog, mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      // Create requester first
      const requester = new BatchTxRequester(
        tracker,
        blockProposal,
        undefined,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 1,
          txValidator,
        },
      );

      // Mark transactions 8-15 as fetched externally after creating requester
      for (let i = TX_BATCH_SIZE; i < txCount; i++) {
        tracker.markFetched(makeTx(missing[i]));
      }

      // Run and collect results
      const result = await BatchTxRequester.collectAllTxs(requester.run());

      // Verify only transactions 0-7 were requested (indices 8-15 were marked fetched)
      const allRequestedIndices = requestLog.get(peer.toString())?.flatMap(r => r.indices) || [];
      const requestedExternallyFetched = allRequestedIndices.filter(idx => idx >= TX_BATCH_SIZE);

      expect(requestedExternallyFetched).toEqual([]);
      expect(result.length).toBe(TX_BATCH_SIZE);
    });
  });

  describe('Pinned peer functionality', () => {
    it('Should query pinned peer if available', async () => {
      const txCount = 10;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);

      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);
      const [pinnedPeer, regularPeer1, regularPeer2] = peers;

      // Pinned peer has all transactions, regular peers have partial
      const peerTransactions = new Map([
        [pinnedPeer.toString(), Array.from({ length: txCount }, (_, i) => i)], // All transactions
        [regularPeer1.toString(), Array.from({ length: 5 }, (_, i) => i)], // First 5
        [regularPeer2.toString(), Array.from({ length: 5 }, (_, i) => i + 5)], // Last 5
      ]);

      const { requestLog, mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 2,
          txValidator,
        },
      );

      const results = await BatchTxRequester.collectAllTxs(requester.run());
      expect(results).toHaveLength(txCount);

      expect(requestLog.has(pinnedPeer.toString())).toBe(true);
      const pinnedPeerRequests = requestLog.get(pinnedPeer.toString())!;
      expect(pinnedPeerRequests[0].indices.length).toEqual(TX_BATCH_SIZE);
    });

    it('should never mark pinned peer as smart', async () => {
      const txCount = 30;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const [pinnedPeer, regularPeer] = peers;
      const peerCollection = new TestPeerCollection(new PeerCollection(peers, pinnedPeer, new DateProvider()));

      // Both peers have all transactions
      const peerTransactions = new Map([
        [pinnedPeer.toString(), Array.from({ length: txCount }, (_, i) => i)],
        [regularPeer.toString(), Array.from({ length: txCount }, (_, i) => i)],
      ]);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions, 50);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 1,
          dumbParallelWorkerCount: 1,
          peerCollection,
          txValidator,
        },
      );

      await BatchTxRequester.collectAllTxs(requester.run());

      // Verify pinned peer was never marked as smart
      expect(peerCollection.getSmartPeers()).not.toContain(pinnedPeer.toString());
      expect(peerCollection.getSmartPeersToQuery()).not.toContain(pinnedPeer.toString());
    });

    it('should handle pinned peer being rate limited and recover', async () => {
      const txCount = 6;
      const deadline = 8_000;
      const clock = new TestClock();
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      const [pinnedPeer, regularPeer] = peers;
      const peerCollection = new TestPeerCollection(new PeerCollection(peers, pinnedPeer, clock));

      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerTransactions = new Map([
        [pinnedPeer.toString(), Array.from({ length: txCount }, (_, i) => i)],
        [regularPeer.toString(), Array.from({ length: txCount }, (_, i) => i)],
      ]);

      let pinnedPeerRequestCount = 0;
      // eslint-disable-next-line require-await
      reqResp.sendRequestToPeer.mockImplementation(async (peerId: any, _sub: any, data: any) => {
        const peerStr = peerId.toString();

        // First request to pinned peer returns rate limit
        if (peerStr === pinnedPeer.toString() && pinnedPeerRequestCount === 0) {
          pinnedPeerRequestCount++;
          return {
            status: ReqRespStatus.RATE_LIMIT_EXCEEDED,
            data: Buffer.alloc(0),
          };
        }

        // All other requests succeed
        const request = BlockTxsRequest.fromBuffer(data);
        const requestedIndices = request.txIndices.getTrueIndices();
        const peerHasIndices = peerTransactions.get(peerStr) || [];
        const availableIndices = requestedIndices.filter(idx => peerHasIndices.includes(idx));
        const availableTxHashes = availableIndices.map(idx => blockProposal.txHashes[idx]);
        const availableTxs = availableTxHashes.map(h => makeTx(h));

        const response = new BlockTxsResponse(
          blockProposal.archive,
          new TxArray(...availableTxs),
          BitVector.init(blockProposal.txHashes.length, peerHasIndices),
        );

        return {
          status: ReqRespStatus.SUCCESS,
          data: response.toBuffer(),
        };
      });

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        clock,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 2,
          peerCollection,
          txValidator,
        },
      );

      const runPromise = BatchTxRequester.collectAllTxs(requester.run());

      // Let some time pass for rate limit handling
      await sleep(100);
      clock.advanceTo(RATE_LIMIT_EXCEEDED_PEER_CACHE_TTL + 1);

      const results = await runPromise;
      expect(results).toHaveLength(txCount);

      // Verify pinned peer was marked as rate limited
      expect(peerCollection.peersMarkedRateLimitExceeded).toContain(pinnedPeer.toString());
    });

    it('should handle pinned peer being marked as bad and continue with regular peers', async () => {
      const txCount = 8;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      const [pinnedPeer, regularPeer] = peers;
      const peerCollection = new TestPeerCollection(new PeerCollection(peers, pinnedPeer, new DateProvider()));

      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      // Regular peer has all transactions, pinned peer will fail
      const peerTransactions = new Map([[regularPeer.toString(), Array.from({ length: txCount }, (_, i) => i)]]);

      const peersToReturnFailureFor = new Set([pinnedPeer.toString()]);
      const { mockImplementation } = createRequestLogger(blockProposal, peersToReturnFailureFor, peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 1,
          peerCollection,
          txValidator,
        },
      );

      const results = await BatchTxRequester.collectAllTxs(requester.run());

      expect(results).toHaveLength(txCount);
      expect(peerCollection.peersPenalised.map(entry => entry.peerId)).toContain(pinnedPeer.toString());
    });

    it('should validate transactions from pinned peer same as regular peers', async () => {
      const txCount = 8;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = await makeBlockProposal({
        signer: Secp256k1Signer.random(),
        blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: missing,
      });

      const [pinnedPeer, regularPeer] = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue([regularPeer]);

      const peerTransactions = new Map([
        [pinnedPeer.toString(), Array.from({ length: 4 }, (_, i) => i)], // First 4 txs
        [regularPeer.toString(), Array.from({ length: 4 }, (_, i) => i + 4)], // Last 4 txs
      ]);

      const invalidTxIndices = new Set([1, 6]); // Mark some transactions as invalid

      const customValidator: IBatchRequestTxValidator = {
        validateRequestedTx: (tx: Tx) => {
          const txIndex = missing.findIndex(h => h.equals(tx.txHash));
          const isInvalid = invalidTxIndices.has(txIndex);
          return Promise.resolve(isInvalid ? { result: 'invalid', reason: ['test invalid'] } : { result: 'valid' });
        },
        validateRequestedTxs: (txs: Tx[]) => Promise.all(txs.map(tx => customValidator.validateRequestedTx(tx))),
      };

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqResp.sendRequestToPeer.mockImplementation(mockImplementation);

      const requester = new BatchTxRequester(
        new MissingTxsTracker(new Set(missing.map(TxHash.toString))),
        blockProposal,
        pinnedPeer,
        deadline,
        mockP2PService,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 2,
          txValidator: customValidator,
        },
      );

      const results = await BatchTxRequester.collectAllTxs(requester.run());

      // Should receive 6 valid transactions (8 total - 2 invalid)
      expect(results).toHaveLength(6);

      // Verify invalid transactions were filtered out
      const resultTxHashes = new Set(results.map(tx => tx.txHash.toString()));
      expect(resultTxHashes.has(missing[1].toString())).toBe(false); // Invalid from pinned
      expect(resultTxHashes.has(missing[6].toString())).toBe(false); // Invalid from regular
    });
  });
});

const makeTx = (txHash?: string | TxHash) => Tx.random({ txHash }) as Tx;

const createRequestLogger = (
  blockProposal: BlockProposal,
  peersToReturnFailureFor: Set<string> = new Set(),
  peerTransactions: Map<string, number[]> = new Map(),
  sleepMs = 100,
) => {
  const requestLog: Map<string, Array<{ indices: number[]; txs: string[] }>> = new Map();
  let requestCount = 0;

  const mockImplementation = async (peerId: any, _sub: any, data: any) => {
    const request = BlockTxsRequest.fromBuffer(data);
    const requestedIndices = request.txIndices.getTrueIndices();
    const txHashes = requestedIndices.map(idx => blockProposal.txHashes[idx].toString());

    if (!requestLog.has(peerId.toString())) {
      requestLog.set(peerId.toString(), []);
    }
    requestLog.get(peerId.toString())!.push({ indices: requestedIndices, txs: txHashes });

    requestCount++;
    await sleep(sleepMs);

    if (peersToReturnFailureFor.has(peerId.toString())) {
      return {
        status: ReqRespStatus.FAILURE,
        data: Buffer.alloc(0),
      };
    }

    const peerHasIndices = peerTransactions.get(peerId.toString()) || [];
    const availableIndices = requestedIndices.filter(idx => peerHasIndices.includes(idx));
    const availableTxHashes = availableIndices.map(idx => blockProposal.txHashes[idx]);
    const availableTxs = availableTxHashes.map(h => makeTx(h));

    const response = new BlockTxsResponse(
      blockProposal.archive,
      new TxArray(...availableTxs),
      BitVector.init(blockProposal.txHashes.length, peerHasIndices),
    );

    return {
      status: ReqRespStatus.SUCCESS,
      data: response.toBuffer(),
    };
  };

  return { requestLog, requestCount: () => requestCount, mockImplementation };
};

class TestClock extends DateProvider {
  private t = 0;

  override now() {
    return this.t;
  }

  advanceTo(ms: number) {
    this.t = ms;
  }
}

export class TestSemaphore implements ISemaphore {
  public acquiredCount = 0;
  public releasedCount = 0;

  constructor(private readonly inner: Semaphore) {}

  acquire() {
    this.acquiredCount++;
    return this.inner.acquire();
  }

  release() {
    this.releasedCount++;
    this.inner.release();
  }
}

export class TestPeerCollection implements IPeerCollection {
  public smartPeersMarked: string[] = [];
  public peersPenalised: Array<{ peerId: string; severity: PeerErrorSeverity }> = [];
  public peersMarkedInFlight: string[] = [];
  public peersUnmarkedBad: string[] = [];
  public peersUnmarkedInFlight: string[] = [];
  public peersMarkedRateLimitExceeded: string[] = [];

  constructor(private readonly inner: PeerCollection) {}

  getAllPeers(): Set<string> {
    return this.inner.getAllPeers();
  }

  getSmartPeers(): Set<string> {
    return this.inner.getSmartPeers();
  }

  markPeerSmart(peerId: any): void {
    this.smartPeersMarked.push(peerId.toString());
    return this.inner.markPeerSmart(peerId);
  }

  getSmartPeersToQuery(): Array<string> {
    return this.inner.getSmartPeersToQuery();
  }

  getDumbPeersToQuery(): Array<string> {
    return this.inner.getDumbPeersToQuery();
  }

  thereAreSomeDumbRatelimitExceededPeers(): boolean {
    return this.inner.thereAreSomeDumbRatelimitExceededPeers();
  }

  penalisePeer(peerId: any, severity: PeerErrorSeverity): void {
    this.peersPenalised.push({ peerId: peerId.toString(), severity });
    return this.inner.penalisePeer(peerId, severity);
  }

  unMarkPeerAsBad(peerId: any): void {
    this.peersUnmarkedBad.push(peerId.toString());
    return this.inner.unMarkPeerAsBad(peerId);
  }

  getBadPeers(): Set<string> {
    return this.inner.getBadPeers();
  }

  markPeerInFlight(peerId: any): void {
    this.peersMarkedInFlight.push(peerId.toString());
    return this.inner.markPeerInFlight(peerId);
  }

  unMarkPeerInFlight(peerId: any): void {
    this.peersUnmarkedInFlight.push(peerId.toString());
    return this.inner.unMarkPeerInFlight(peerId);
  }

  markPeerRateLimitExceeded(peerId: any): void {
    this.peersMarkedRateLimitExceeded.push(peerId.toString());
    return this.inner.markPeerRateLimitExceeded(peerId);
  }

  getRateLimitExceededPeers(): Set<string> {
    return this.inner.getRateLimitExceededPeers();
  }

  getPeerRateLimitDelayMs(peerId: any): number | undefined {
    return this.inner.getPeerRateLimitDelayMs(peerId);
  }

  getNextDumbPeerAvailabilityDelayMs(): number | undefined {
    return this.inner.getNextDumbPeerAvailabilityDelayMs();
  }

  getNextSmartPeerAvailabilityDelayMs(): number | undefined {
    return this.inner.getNextSmartPeerAvailabilityDelayMs();
  }
}
