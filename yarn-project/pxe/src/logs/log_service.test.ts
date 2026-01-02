import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { Tag } from '@aztec/stdlib/logs';
import { randomTxScopedPrivateL2Log } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import { SenderAddressBook } from '../storage/tagging_data_provider/sender_address_book.js';
import { RecipientTaggingDataProvider } from '../tagging/recipient_sync/recipient_tagging_data_provider.js';
import { LogService } from './log_service.js';

describe('LogService', () => {
  let contractAddress: AztecAddress;
  let aztecNode: MockProxy<AztecNode>;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let keyStore: KeyStore;
  let capsuleDataProvider: CapsuleDataProvider;
  let recipientTaggingDataProvider: RecipientTaggingDataProvider;
  let addressDataProvider: AddressDataProvider;
  let senderAddressBook: SenderAddressBook;
  let logService: LogService;

  describe('bulkRetrieveLogs', () => {
    const tag = new Tag(Fr.random());

    beforeEach(async () => {
      // Set up contract address
      contractAddress = await AztecAddress.random();
      anchorBlockDataProvider = new AnchorBlockDataProvider(await openTmpStore('test'));
      keyStore = new KeyStore(await openTmpStore('test'));
      capsuleDataProvider = new CapsuleDataProvider(await openTmpStore('test'));
      recipientTaggingDataProvider = new RecipientTaggingDataProvider(await openTmpStore('test'));
      senderAddressBook = new SenderAddressBook(await openTmpStore('test'));
      addressDataProvider = new AddressDataProvider(await openTmpStore('test'));

      aztecNode = mock<AztecNode>();

      logService = new LogService(
        aztecNode,
        anchorBlockDataProvider,
        keyStore,
        capsuleDataProvider,
        recipientTaggingDataProvider,
        senderAddressBook,
        addressDataProvider,
      );

      aztecNode.getPrivateLogsByTags.mockReset();
      aztecNode.getPublicLogsByTagsFromContract.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    it('returns no logs if none are found', async () => {
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);
      const request = new LogRetrievalRequest(contractAddress, tag);
      const responses = await logService.bulkRetrieveLogs([request]);
      expect(responses.length).toEqual(1);
      expect(responses[0]).toBeNull();
    });

    it('returns a public log if one is found', async () => {
      const scopedLog = randomTxScopedPrivateL2Log();

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLog]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

      const request = new LogRetrievalRequest(contractAddress, new Tag(scopedLog.logData[0]));

      const responses = await logService.bulkRetrieveLogs([request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });

    it('returns a private log if one is found', async () => {
      const scopedLog = randomTxScopedPrivateL2Log();

      aztecNode.getPrivateLogsByTags.mockResolvedValue([[scopedLog]]);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);

      const request = new LogRetrievalRequest(contractAddress, new Tag(scopedLog.logData[0]));

      const responses = await logService.bulkRetrieveLogs([request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });
  });
});
