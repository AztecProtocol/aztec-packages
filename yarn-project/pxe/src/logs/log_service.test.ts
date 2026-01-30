import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { Tag } from '@aztec/stdlib/logs';
import { makeBlockHeader, randomTxScopedPrivateL2Log } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { AddressStore } from '../storage/address_store/address_store.js';
import { CapsuleStore } from '../storage/capsule_store/capsule_store.js';
import { RecipientTaggingStore } from '../storage/tagging_store/recipient_tagging_store.js';
import { SenderAddressBookStore } from '../storage/tagging_store/sender_address_book_store.js';
import { LogService } from './log_service.js';

describe('LogService', () => {
  let contractAddress: AztecAddress;
  let aztecNode: MockProxy<AztecNode>;
  let keyStore: KeyStore;
  let capsuleStore: CapsuleStore;
  let recipientTaggingStore: RecipientTaggingStore;
  let addressStore: AddressStore;
  let senderAddressBookStore: SenderAddressBookStore;
  let logService: LogService;

  describe('bulkRetrieveLogs', () => {
    const tag = new Tag(Fr.random());

    beforeEach(async () => {
      // Set up contract address
      contractAddress = await AztecAddress.random();
      keyStore = new KeyStore(await openTmpStore('test'));
      capsuleStore = new CapsuleStore(await openTmpStore('test'));
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
        keyStore,
        capsuleStore,
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
