import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { Tag } from '@aztec/stdlib/logs';
import { makeBlockHeader, randomTxScopedPrivateL2Log } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
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

  describe('bulkRetrieveLogs', () => {
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

    it('returns no logs if none are found', async () => {
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);
      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);
      expect(responses.length).toEqual(1);
      expect(responses[0]).toBeNull();
    });

    it('returns a public log if one is found', async () => {
      const scopedLog = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLog]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

      const request = new LogRetrievalRequest(contractAddress, new Tag(scopedLog.logData[0]));

      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });

    it('returns first log when multiple public logs are found for a single tag', async () => {
      const scopedLog1 = randomTxScopedPrivateL2Log();
      const scopedLog2 = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLog1, scopedLog2]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });

    it('returns first log when multiple private logs are found for a single tag', async () => {
      const scopedLog1 = randomTxScopedPrivateL2Log();
      const scopedLog2 = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[scopedLog1, scopedLog2]]);

      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });

    it('returns first log when both a public and private log are found for a single tag', async () => {
      const publicLog = randomTxScopedPrivateL2Log();
      const privateLog = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[publicLog]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[privateLog]]);

      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });

    it('returns a private log if one is found', async () => {
      const scopedLog = randomTxScopedPrivateL2Log();

      aztecNode.getPrivateLogsByTags.mockResolvedValue([[scopedLog]]);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);

      const request = new LogRetrievalRequest(contractAddress, new Tag(scopedLog.logData[0]));

      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
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
      expect(responses[0]).toEqual(expect.objectContaining({ txHash: publicLog1.txHash }));
      expect(responses[1]).toEqual(expect.objectContaining({ txHash: privateLog2.txHash }));
      expect(responses[2]).toBeNull();

      expect(aztecNode.getPublicLogsByTagsFromContract).toHaveBeenCalledTimes(1);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
    });

    it('returns empty array for empty requests', async () => {
      const responses = await logService.fetchLogsByTag(contractAddress, []);
      expect(responses).toEqual([]);
      expect(aztecNode.getPublicLogsByTagsFromContract).not.toHaveBeenCalled();
      expect(aztecNode.getPrivateLogsByTags).not.toHaveBeenCalled();
    });
  });
});
