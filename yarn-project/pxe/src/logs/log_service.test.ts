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

    it('returns empty array when no logs match', async () => {
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);

      const responses = await logService.bulkRetrieveLogs([{ tag, contractAddress }]);

      expect(responses).toEqual([[]]);
    });

    it('merges and sorts public and private logs by block number', async () => {
      const sharedTag = new Tag(Fr.random());
      const publicLog = randomTxScopedPrivateL2Log({ tag: sharedTag.value, blockNumber: 10 });
      const privateLog1 = randomTxScopedPrivateL2Log({ tag: sharedTag.value, blockNumber: 5 });
      const privateLog2 = randomTxScopedPrivateL2Log({ tag: sharedTag.value, blockNumber: 20 });

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[publicLog]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[privateLog1, privateLog2]]);

      const responses = await logService.bulkRetrieveLogs([{ tag: sharedTag, contractAddress }]);

      expect(responses[0]).toHaveLength(3);
      expect(responses[0][0].txHash).toEqual(privateLog1.txHash);
      expect(responses[0][1].txHash).toEqual(publicLog.txHash);
      expect(responses[0][2].txHash).toEqual(privateLog2.txHash);
    });
  });
});
