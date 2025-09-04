import { chunk } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { waitFor } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { makeBlockProposal, makeHeader } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { createSecp256k1PeerId } from '../../../index.js';
import type { ConnectionSampler } from '../connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol, type ReqRespSubProtocolValidators } from '../interface.js';
import { BlockTxsRequest, BlockTxsResponse } from '../protocols/index.js';
import { ReqRespStatus } from '../status.js';
import { TX_BATCH_SIZE } from './missing_txs.js';
import { BatchTxRequester } from './reqresp_batch.js';

const TEST_TIMEOUT = 10_000;
jest.setTimeout(TEST_TIMEOUT);

class TestClock extends DateProvider {
  private t = 0;

  override now() {
    return this.t;
  }

  advanceTo(ms: number) {
    this.t = ms;
  }
}

function createRequestLogger(blockProposal: BlockProposal, sleepMs = 10) {
  const requestLog: Map<string, Array<{ indices: number[]; txs: string[] }>> = new Map();
  let requestCount = 0;

  const mockImplementation = async (peerId: any, _sub: any, data: any) => {
    const request = BlockTxsRequest.fromBuffer(data);
    const indices = request.txIndices.getTrueIndices();
    const txHashes = indices.map(idx => blockProposal.txHashes[idx].toString());

    if (!requestLog.has(peerId.toString())) {
      requestLog.set(peerId.toString(), []);
    }
    requestLog.get(peerId.toString())!.push({ indices, txs: txHashes });

    requestCount++;
    await sleep(sleepMs);

    return {
      status: ReqRespStatus.SUCCESS,
      data: BlockTxsResponse.empty().toBuffer(),
    } as any;
  };

  return { requestLog, requestCount: () => requestCount, mockImplementation };
}

describe('BatchTxRequester Testability Improvements', () => {
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

  describe('Dumb batching logic', () => {
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
      const { requestLog, mockImplementation } = createRequestLogger(blockProposal, shortDeadline / 4);
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
