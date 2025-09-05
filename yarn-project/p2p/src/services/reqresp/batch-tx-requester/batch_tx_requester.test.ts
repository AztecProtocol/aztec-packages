import { chunk } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { waitFor } from '@aztec/foundation/promise';
import { type ISemaphore, Semaphore } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { makeBlockProposal, makeHeader } from '@aztec/stdlib/testing';
import { Tx, TxArray, TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { createSecp256k1PeerId } from '../../../index.js';
import type { ConnectionSampler } from '../connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol, type ReqRespSubProtocolValidators } from '../interface.js';
import { BitVector, BlockTxsRequest, BlockTxsResponse } from '../protocols/index.js';
import { ReqRespStatus } from '../status.js';
import { BatchTxRequester } from './batch_tx_requester.js';
import { TX_BATCH_SIZE } from './missing_txs.js';
import { BAD_PEER_THRESHOLD, PeerCollection } from './peer_collection.js';

const TEST_TIMEOUT = 10_000;
jest.setTimeout(TEST_TIMEOUT);

describe('BatchTxRequester', () => {
  let logger: Logger;
  let blockProposal: BlockProposal;
  let connectionSampler: MockProxy<ConnectionSampler>;
  let reqresp: MockProxy<ReqRespInterface>;
  let txValidator: MockProxy<ReqRespSubProtocolValidators[ReqRespSubProtocol.TX]>;

  beforeEach(() => {
    logger = createLogger('test');
    connectionSampler = mock<ConnectionSampler>();
    reqresp = mock<ReqRespInterface>();
    txValidator = mock<ReqRespSubProtocolValidators[ReqRespSubProtocol.TX]>();

    const signer = Secp256k1Signer.random();
    const blockHash = Fr.random();
    blockProposal = makeBlockProposal({
      signer,
      header: makeHeader(1, 1),
      archive: blockHash,
      txHashes: [],
    });
  });

  describe('Dumb peers', () => {
    it('should create correct TX_BATCH_SIZE chunks with single dumb worker', async () => {
      const txCount = 16;
      const deadline = 10_000;
      const rounds = Math.ceil(txCount / TX_BATCH_SIZE);
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peerId = await createSecp256k1PeerId();
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue([peerId]);

      const { requestLog, requestCount, mockImplementation } = createRequestLogger(blockProposal);
      reqresp.sendRequestToPeer.mockImplementation(mockImplementation);

      const clock = new TestClock();

      const requester = new BatchTxRequester(
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        clock,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 1,
        },
      );

      const runPromise = requester.run();

      await waitFor(() => requestCount() === rounds);
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

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);

      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const { requestLog, requestCount, mockImplementation } = createRequestLogger(blockProposal);
      reqresp.sendRequestToPeer.mockImplementation(mockImplementation);

      const clock = new TestClock();

      const requester = new BatchTxRequester(
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        clock,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 3,
        },
      );

      const runPromise = requester.run();

      await waitFor(() => requestCount() == numberOfRounds * peers.length);
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

      // Verify first round: peer distribution should be [0-7], [8-15], [16-24]
      expect(peer1Requests[0].indices).toEqual(Array.from({ length: TX_BATCH_SIZE }, (_, i) => i));
      expect(peer2Requests[0].indices).toEqual(Array.from({ length: TX_BATCH_SIZE }, (_, i) => i + TX_BATCH_SIZE));
      expect(peer3Requests[0].indices).toEqual(Array.from({ length: TX_BATCH_SIZE }, (_, i) => i + 2 * TX_BATCH_SIZE));

      // Second round should be [25, 0-6] - because we wrap around to make sure we always request TX_BATCH_SIZE,
      // [0-7], [8-15]
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

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      // Define which transactions each peer has (same as happy path)
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 10 }, (_, i) => i)], // peer1: txs 0-9
        [peers[1].toString(), Array.from({ length: 7 }, (_, i) => i + 7)], // peer2: txs 7-13
        [peers[2].toString(), Array.from({ length: 11 }, (_, i) => i + 9)], // peer3: txs 9-19
      ]);

      const peerRequestCounts = new Map<string, number>();

      reqresp.sendRequestToPeer.mockImplementation(async (peerId, _sub, data) => {
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
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 3,
        },
      );

      const result = await requester.run();
      expect(result).toBeDefined();

      // Verify all transactions were eventually fetched despite failures
      expect(result!.length).toBe(txCount);
      expect(new Set(result!.map(tx => tx.txHash.toString()))).toEqual(new Set(missing.map(tx => tx.toString())));
    });
  });

  describe('Smart peers', () => {
    it('If dumb peers returned no transactions there should not be any smart peers', async () => {
      const txCount = 16;
      const deadline = 1_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(peers.map(p => p.toString())));
      reqresp.sendRequestToPeer.mockImplementation(mockImplementation);

      const semaphore = new TestSemaphore(new Semaphore(0));

      const requester = new BatchTxRequester(
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        new DateProvider(),
        {
          semaphore, // inject test semaphore
          smartParallelWorkerCount: 1, // start one smart worker that will block on acquire()
          dumbParallelWorkerCount: 2,
        },
      );

      await requester.run();

      // This acquire/release here has to be 1 because we have to release semaphore on smart worker loops once we are done
      // So that they don't block indefinitely on acquire() in the end
      expect(semaphore.releasedCount).toBe(1);
      expect(semaphore.acquiredCount).toBe(1);
    });

    it('Correctly promote single peer to smart peers', async () => {
      const txCount = 16;
      const deadline = 2_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers);
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 16 }, (_, i) => i)], // peer1 has all transactions, peer2 none
      ]);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqresp.sendRequestToPeer.mockImplementation(mockImplementation);

      const semaphore = new TestSemaphore(new Semaphore(0));
      const requester = new BatchTxRequester(
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        new DateProvider(),
        {
          semaphore,
          smartParallelWorkerCount: 2,
          dumbParallelWorkerCount: 2,
          peerCollection,
        },
      );

      const result = await requester.run();
      expect(result).toBeDefined();
      expect(result!.length).toBe(txCount);

      // Verify peer promotion behavior
      expect(peerCollection.getSmartPeers().size).toBe(1);
      expect(peerCollection.getSmartPeers()).toContain(peers[0].toString());
      expect(peerCollection.getSmartPeers()).not.toContain(peers[1].toString());

      //Why 5?
      // - We have 1 release for the peer being promoted to the smart peer
      // - We have 1 release after the dumb workers are done because this.shouldStop() will return true
      // - We have 1 release on finally block on run
      // - The last 2 will be called 2 times because we have 2 smart worker loops so once for each of those
      expect(semaphore.releasedCount).toBe(5);
      // Both smart workers will acquire semaphore
      // - The first one once it is promoted to smart peer
      // - The second one when dumb workers call release
      expect(semaphore.acquiredCount).toBe(2);
    });

    it('Should track smart peer collection behavior with multiple promotions', async () => {
      const txCount = 20;
      const deadline = 3_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers);

      // Define which transactions each peer has
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 10 }, (_, i) => i)], // peer1: txs 0-9
        [peers[1].toString(), Array.from({ length: 10 }, (_, i) => i + 5)], // peer2: txs 5-14
        [peers[2].toString(), Array.from({ length: 10 }, (_, i) => i + 10)], // peer3: txs 10-19
      ]);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqresp.sendRequestToPeer.mockImplementation(mockImplementation);

      const semaphore = new TestSemaphore(new Semaphore(0));
      const requester = new BatchTxRequester(
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        new DateProvider(),
        {
          semaphore,
          smartParallelWorkerCount: 3,
          dumbParallelWorkerCount: 3,
          peerCollection,
        },
      );

      const result = await requester.run();
      expect(result).toBeDefined();
      expect(result!.length).toBe(txCount);

      // Verify all peers were promoted to smart
      expect(peerCollection.getSmartPeers().size).toBe(peers.length);
      expect(semaphore.acquiredCount).toBe(3);
    });

    it('Everything should work ok with multiple peers and only 1 smart and 1 dumb worker', async () => {
      const txCount = 20;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers);

      // Define which transactions each peer has
      const peerTransactions = new Map([
        [peers[0].toString(), Array.from({ length: 6 }, (_, i) => i)], // peer1: txs 0-5
        [peers[1].toString(), Array.from({ length: 8 }, (_, i) => i + 6)], // peer2: txs 6-13
        [peers[2].toString(), Array.from({ length: 6 }, (_, i) => i + 14)], // peer3: txs 14-19
      ]);

      const { mockImplementation } = createRequestLogger(blockProposal, new Set(), peerTransactions);
      reqresp.sendRequestToPeer.mockImplementation(mockImplementation);

      const semaphore = new TestSemaphore(new Semaphore(0));
      const requester = new BatchTxRequester(
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        new DateProvider(),
        {
          semaphore,
          smartParallelWorkerCount: 1,
          dumbParallelWorkerCount: 1,
          peerCollection,
        },
      );

      const result = await requester.run();
      expect(result).toBeDefined();
      expect(result!.length).toBe(txCount);

      expect(semaphore.acquiredCount).toBe(1);
    });
  });

  describe('Bad peer threshold and recovery', () => {
    it('should mark peer as bad after exceeding threshold and exclude from queries', async () => {
      const txCount = 16;
      const deadline = 1_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers);

      // Mock implementation that makes peer0 fail consistently, peer1 succeed
      const { mockImplementation } = createRequestLogger(blockProposal, new Set([peers[0].toString()]));
      reqresp.sendRequestToPeer.mockImplementation(mockImplementation);
      const requester = new BatchTxRequester(
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 2,
          dumbParallelWorkerCount: 2,
          peerCollection,
        },
      );

      await requester.run();

      // Verify that peer0 is marked as bad after exceeding threshold (3 failures)
      // and peer1 is not marked as bad
      expect(peerCollection.getBadPeers()).toContain(peers[0].toString());
      expect(peerCollection.getBadPeers()).not.toContain(peers[1].toString());

      // Verify bad peer is excluded from queries - peer0 should be in bad peers
      expect(peerCollection.getDumbPeersToQuery()).not.toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).toContain(peers[1].toString());
    });

    it('should recover bad peer after successful response', async () => {
      const txCount = 8;
      const deadline = 1_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
        txHashes: missing,
      });

      const peers = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
      connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peers);

      const peerCollection = new PeerCollection(peers);
      let requestCount = 0;

      // Mock implementation: first 4 requests fail (exceed threshold), then succeed
      reqresp.sendRequestToPeer.mockImplementation(async peerId => {
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
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 1,
          peerCollection,
        },
      );

      await requester.run();

      // Verify peer was initially marked bad but then recovered
      // Since peer succeeded in the end, it should not be in bad peers list
      expect(peerCollection.getBadPeers()).not.toContain(peers[0].toString());
      expect(peerCollection.getDumbPeersToQuery()).toContain(peers[0].toString());
    });

    it('should handle multiple peers with different bad peer states', async () => {
      const txCount = 16;
      const deadline = 5_000;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
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

      const peerCollection = new PeerCollection(peers);
      const peerRequestCounts = new Map<string, number>();

      reqresp.sendRequestToPeer.mockImplementation(async (peerId: any, _sub: any, data: any) => {
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
        missing,
        blockProposal,
        undefined,
        deadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        new DateProvider(),
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 3,
          peerCollection,
        },
      );

      const result = await requester.run();
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
    });
  });

  describe('Deadline expiration', () => {
    it('should stop requesting when deadline is reached', async () => {
      const shortDeadline = 20;
      const txCount = 20;
      const missing = Array.from({ length: txCount }, () => TxHash.random());

      blockProposal = makeBlockProposal({
        signer: Secp256k1Signer.random(),
        header: makeHeader(1, 1),
        archive: Fr.random(),
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
      reqresp.sendRequestToPeer.mockImplementation(mockImplementation);

      const clock = new TestClock();

      const requester = new BatchTxRequester(
        missing,
        blockProposal,
        undefined,
        shortDeadline,
        reqresp,
        connectionSampler,
        txValidator,
        logger,
        clock,
        {
          smartParallelWorkerCount: 0,
          dumbParallelWorkerCount: 1,
        },
      );

      const runPromise = requester.run();

      // Advance clock past deadline after a short delay
      await sleep(shortDeadline / 2);
      clock.advanceTo(shortDeadline + 1);

      await runPromise;

      // Should complete due to deadline, not because all txs were fetched
      const totalRequestedTxs = requestLog.get(peerId.toString())?.flatMap(r => r.txs).length || 0;
      expect(totalRequestedTxs).toBeGreaterThan(0);
      expect(totalRequestedTxs).toBeLessThan(txCount);
    });
  });
});

const makeTx = (txHash?: string | TxHash) => Tx.random({ txHash }) as Tx;
const createRequestLogger = (
  blockProposal: BlockProposal,
  peersToReturnFailureFor: Set<string> = new Set(),
  peerTransactions: Map<string, number[]> = new Map(),
  sleepMs = 10,
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
