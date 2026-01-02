import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { PublicLog, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';
import { TxHash, randomIndexedTxEffect } from '@aztec/stdlib/tx';

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
      const scopedLog = await TxScopedL2Log.random(true);
      (scopedLog.log as PublicLog).contractAddress = contractAddress;

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLog]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);
      const indexedTxEffect = await randomIndexedTxEffect();

      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const request = new LogRetrievalRequest(contractAddress, new Tag(scopedLog.log.fields[0]));

      const responses = await logService.bulkRetrieveLogs([request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });

    it('returns a private log if one is found', async () => {
      const scopedLog = await TxScopedL2Log.random(false);

      aztecNode.getPrivateLogsByTags.mockResolvedValue([[scopedLog]]);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);
      const indexedTxEffect = await randomIndexedTxEffect();
      aztecNode.getTxEffect.mockResolvedValue(indexedTxEffect);

      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const request = new LogRetrievalRequest(contractAddress, new Tag(scopedLog.log.fields[0]));

      const responses = await logService.bulkRetrieveLogs([request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });
  });

  describe('getPublicLogByTag', () => {
    const tag = new Tag(Fr.random());

    beforeEach(() => {
      aztecNode.getPublicLogsByTagsFromContract.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    it('returns null if no logs found for tag', async () => {
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[]]);

      const result = await logService.getPublicLogByTag(tag, contractAddress);
      expect(result).toBeNull();
    });

    it('returns log data when single log found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();
      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const result = (await logService.getPublicLogByTag(tag, logContractAddress))!;

      expect(result.logPayload).toEqual(scopedLog.log.getEmittedFieldsWithoutTag());
      expect(result.uniqueNoteHashesInTx).toEqual(indexedTxEffect.data.noteHashes);
      expect(result.txHash).toEqual(scopedLog.txHash);
      expect(result.firstNullifierInTx).toEqual(indexedTxEffect.data.nullifiers[0]);

      expect(aztecNode.getPublicLogsByTagsFromContract).toHaveBeenCalledWith(logContractAddress, [tag]);
      expect(aztecNode.getTxEffect).toHaveBeenCalledWith(scopedLog.txHash);
    });

    it('throws if multiple logs found for tag', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLog, scopedLog]]);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      await expect(logService.getPublicLogByTag(tag, logContractAddress)).rejects.toThrow(/Got 2 logs for tag/);
    });

    it('throws if tx effect not found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLog]]);
      aztecNode.getTxEffect.mockResolvedValue(undefined);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      await expect(logService.getPublicLogByTag(tag, logContractAddress)).rejects.toThrow(
        /failed to retrieve tx effects/,
      );
    });

    it('returns log fields that are actually emitted', async () => {
      const logContractAddress = await AztecAddress.random();
      const logPlaintext = [Fr.random()];
      const logContent = [tag.value, ...logPlaintext];

      const log = PublicLog.from({
        contractAddress: logContractAddress,
        fields: logContent,
      });
      const scopedLogWithPadding = new TxScopedL2Log(
        TxHash.random(),
        randomInt(100),
        randomInt(100),
        BlockNumber(randomInt(100)),
        L2BlockHash.random(),
        0n,
        log,
      );

      aztecNode.getPublicLogsByTagsFromContract.mockResolvedValue([[scopedLogWithPadding]]);
      aztecNode.getTxEffect.mockResolvedValue(await randomIndexedTxEffect());

      const result = await logService.getPublicLogByTag(tag, logContractAddress);

      expect(result?.logPayload).toEqual(logPlaintext);
    });
  });
});
