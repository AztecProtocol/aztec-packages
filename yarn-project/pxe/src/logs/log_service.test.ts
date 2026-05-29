import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { SiloedTag, Tag } from '@aztec/stdlib/logs';
import { makeBlockHeader, randomTxScopedPrivateL2Log } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { LogRetrievalRequest, LogSource } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { AddressStore } from '../storage/address_store/address_store.js';
import { RecipientTaggingStore } from '../storage/tagging_store/recipient_tagging_store.js';
import { SenderAddressBookStore } from '../storage/tagging_store/sender_address_book_store.js';
import { LogService } from './log_service.js';

describe('LogService', () => {
  let contractAddress: AztecAddress;
  let aztecNode: MockProxy<AztecNode>;
  let keyStore: KeyStore;
  let recipientTaggingStore: RecipientTaggingStore;
  let addressStore: AddressStore;
  let senderAddressBookStore: SenderAddressBookStore;
  let logService: LogService;

  describe('fetchLogsByTag', () => {
    const tag = Tag.random();

    beforeEach(async () => {
      // Set up contract address
      contractAddress = await AztecAddress.random();
      keyStore = new KeyStore(await openTmpStore('test'));
      recipientTaggingStore = new RecipientTaggingStore(await openTmpStore('test'));
      senderAddressBookStore = new SenderAddressBookStore(await openTmpStore('test'));
      addressStore = new AddressStore(await openTmpStore('test'));

      aztecNode = mock<AztecNode>();

      aztecNode.getPrivateLogsByTags.mockReset();
      aztecNode.getPublicLogsByTagsFromContract.mockReset();
      aztecNode.getTxEffect.mockReset();

      // Set up anchor block header (required for bulkRetrieveLogs)
      const anchorBlockHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });

      logService = new LogService(
        aztecNode,
        anchorBlockHeader,
        mock<L2TipsProvider>(),
        keyStore,
        recipientTaggingStore,
        senderAddressBookStore,
        addressStore,
        'test',
      );
    });

    it('returns empty arrays if no logs are found', async () => {
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);
      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);
      expect(responses).toEqual([[]]);
    });

    it('returns all logs when multiple public logs exist for a single tag', async () => {
      const scopedLog1 = randomTxScopedPrivateL2Log();
      const scopedLog2 = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLog1, scopedLog2]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses[0]).toHaveLength(2);
      expect(responses[0][0].txHash).toEqual(scopedLog1.txHash);
      expect(responses[0][1].txHash).toEqual(scopedLog2.txHash);
    });

    it('returns all logs when multiple private logs exist for a single tag', async () => {
      const scopedLog1 = randomTxScopedPrivateL2Log();
      const scopedLog2 = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[scopedLog1, scopedLog2]]);

      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses[0]).toHaveLength(2);
      expect(responses[0][0].txHash).toEqual(scopedLog1.txHash);
      expect(responses[0][1].txHash).toEqual(scopedLog2.txHash);
    });

    it('returns combined public and private logs for a single tag', async () => {
      const publicLog = randomTxScopedPrivateL2Log();
      const privateLog = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[publicLog]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[privateLog]]);

      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses[0]).toHaveLength(2);
      expect(responses[0][0].txHash).toEqual(publicLog.txHash);
      expect(responses[0][1].txHash).toEqual(privateLog.txHash);
    });

    it('rejects a batch where at least one request targets a different contract', async () => {
      const differentContract = await AztecAddress.random();
      const validRequest = new LogRetrievalRequest(contractAddress, tag);
      const invalidRequest = new LogRetrievalRequest(differentContract, Tag.random());

      await expect(logService.fetchLogsByTag(contractAddress, [validRequest, invalidRequest])).rejects.toThrow(
        /Got a log retrieval request from/,
      );
    });

    it('batches multiple requests into single RPC calls', async () => {
      const tag1 = Tag.random();
      const tag2 = Tag.random();
      const tag3 = Tag.random();

      const publicLog1 = randomTxScopedPrivateL2Log();
      const privateLog2 = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[publicLog1], [], []]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[], [privateLog2], []]);

      const requests = [
        new LogRetrievalRequest(contractAddress, tag1),
        new LogRetrievalRequest(contractAddress, tag2),
        new LogRetrievalRequest(contractAddress, tag3),
      ];

      const responses = await logService.fetchLogsByTag(contractAddress, requests);

      expect(responses).toHaveLength(3);
      expect(responses[0]).toHaveLength(1);
      expect(responses[0][0].txHash).toEqual(publicLog1.txHash);
      expect(responses[1]).toHaveLength(1);
      expect(responses[1][0].txHash).toEqual(privateLog2.txHash);
      expect(responses[2]).toEqual([]);

      expect(aztecNode.getPublicLogsByTagsFromContract).toHaveBeenCalledTimes(1);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
    });

    it('returns empty array for empty requests', async () => {
      const responses = await logService.fetchLogsByTag(contractAddress, []);
      expect(responses).toEqual([]);
      expect(aztecNode.getPublicLogsByTagsFromContract).not.toHaveBeenCalled();
      expect(aztecNode.getPrivateLogsByTags).not.toHaveBeenCalled();
    });

    describe('block range filtering', () => {
      it('fromBlock is inclusive', async () => {
        const logBefore = randomTxScopedPrivateL2Log({ blockNumber: 9 });
        const logAtBoundary = randomTxScopedPrivateL2Log({ blockNumber: 10 });

        aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[logBefore, logAtBoundary]]);
        aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

        const request = new LogRetrievalRequest(contractAddress, tag, LogSource.PUBLIC_AND_PRIVATE, BlockNumber(10));
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(logAtBoundary.txHash);
      });

      it('toBlock is exclusive', async () => {
        const logBeforeBoundary = randomTxScopedPrivateL2Log({ blockNumber: 9 });
        const logAtBoundary = randomTxScopedPrivateL2Log({ blockNumber: 10 });

        aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[logBeforeBoundary, logAtBoundary]]);
        aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

        const request = new LogRetrievalRequest(
          contractAddress,
          tag,
          LogSource.PUBLIC_AND_PRIVATE,
          undefined,
          BlockNumber(10),
        );
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(logBeforeBoundary.txHash);
      });

      it('filters with both fromBlock and toBlock', async () => {
        const logBefore = randomTxScopedPrivateL2Log({ blockNumber: 3 });
        const logInRange = randomTxScopedPrivateL2Log({ blockNumber: 15 });
        const logAfter = randomTxScopedPrivateL2Log({ blockNumber: 25 });

        aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[logBefore, logInRange, logAfter]]);
        aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

        const request = new LogRetrievalRequest(
          contractAddress,
          tag,
          LogSource.PUBLIC_AND_PRIVATE,
          BlockNumber(10),
          BlockNumber(20),
        );
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(logInRange.txHash);
      });
    });

    describe('source filtering', () => {
      it('returns only public logs and skips private RPC when source is PUBLIC', async () => {
        const publicLog = randomTxScopedPrivateL2Log();

        aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[publicLog]]);

        const request = new LogRetrievalRequest(contractAddress, tag, LogSource.PUBLIC);
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(publicLog.txHash);
        expect(aztecNode.getPrivateLogsByTags).not.toHaveBeenCalled();
      });

      it('returns only private logs and skips public RPC when source is PRIVATE', async () => {
        const privateLog = randomTxScopedPrivateL2Log();

        aztecNode.getPrivateLogsByTags.mockResolvedValue([[privateLog]]);

        const request = new LogRetrievalRequest(contractAddress, tag, LogSource.PRIVATE);
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(privateLog.txHash);
        expect(aztecNode.getPublicLogsByTagsFromContract).not.toHaveBeenCalled();
      });

      it('only sends relevant tags per source in a mixed batch', async () => {
        const tag1 = Tag.random();
        const tag2 = Tag.random();
        const tag3 = Tag.random();

        const publicLog1 = randomTxScopedPrivateL2Log();
        const privateLog2 = randomTxScopedPrivateL2Log();
        const publicLog3 = randomTxScopedPrivateL2Log();
        const privateLog3 = randomTxScopedPrivateL2Log();

        aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[publicLog1], [publicLog3]]);
        aztecNode.getPrivateLogsByTags.mockResolvedValue([[privateLog2], [privateLog3]]);

        const requests = [
          new LogRetrievalRequest(contractAddress, tag1, LogSource.PUBLIC),
          new LogRetrievalRequest(contractAddress, tag2, LogSource.PRIVATE),
          new LogRetrievalRequest(contractAddress, tag3, LogSource.PUBLIC_AND_PRIVATE),
        ];

        const responses = await logService.fetchLogsByTag(contractAddress, requests);

        // Public RPC receives tag1 and tag3, private RPC receives tag2 and tag3
        expect(aztecNode.getPublicLogsByTagsFromContract).toHaveBeenCalledTimes(1);
        const publicCallTags = aztecNode.getPublicLogsByTagsFromContract.mock.calls[0][1];
        expect(publicCallTags).toHaveLength(2);
        expect(publicCallTags[0]).toEqual(tag1);
        expect(publicCallTags[1]).toEqual(tag3);

        expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
        const privateCallTags = aztecNode.getPrivateLogsByTags.mock.calls[0][0];
        expect(privateCallTags).toHaveLength(2);
        const expectedSiloedTag2 = await SiloedTag.computeFromTagAndApp(tag2, contractAddress);
        const expectedSiloedTag3 = await SiloedTag.computeFromTagAndApp(tag3, contractAddress);
        expect(privateCallTags[0]).toEqual(expectedSiloedTag2);
        expect(privateCallTags[1]).toEqual(expectedSiloedTag3);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(publicLog1.txHash);
        expect(responses[1]).toHaveLength(1);
        expect(responses[1][0].txHash).toEqual(privateLog2.txHash);
        expect(responses[2]).toHaveLength(2);
        expect(responses[2][0].txHash).toEqual(publicLog3.txHash);
        expect(responses[2][1].txHash).toEqual(privateLog3.txHash);
      });
    });
  });
});
