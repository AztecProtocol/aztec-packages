import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { siloPrivateLog } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { PublicLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import { BlockHeader, GlobalVariables, TxHash, randomIndexedTxEffect } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { randomInt } from 'crypto';
import { type MockProxy, mock } from 'jest-mock-extended';

import {
  AddressDataProvider,
  AnchorBlockDataProvider,
  CapsuleDataProvider,
  ContractDataProvider,
} from '../../storage/index.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import {
  bulkRetrieveLogs,
  getBlock,
  getLowNullifierMembershipWitness,
  getPrivateLogByTag,
  getPublicDataWitness,
  getPublicLogByTag,
  getPublicStorageAt,
} from './common.js';

jest.setTimeout(30_000);

describe('Common oracle functions', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let contractDataProvider: ContractDataProvider;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let keyStore: KeyStore;
  let capsuleDataProvider: CapsuleDataProvider;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  // The block number of the last log to be emitted.
  const MAX_BLOCK_NUMBER_OF_A_LOG = BlockNumber(3);

  beforeEach(async () => {
    const store = await openTmpStore('test');
    aztecNode = mock<AztecNode>();
    contractDataProvider = new ContractDataProvider(store);
    jest.spyOn(contractDataProvider, 'getDebugContractName').mockImplementation(() => Promise.resolve('TestContract'));

    addressDataProvider = new AddressDataProvider(store);
    anchorBlockDataProvider = new AnchorBlockDataProvider(store);
    keyStore = new KeyStore(store);
    capsuleDataProvider = new CapsuleDataProvider(store);

    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await addressDataProvider.addCompleteAddress(recipient);

    // PXEOracleInterface.syncTaggedLogs(...) function syncs logs up to the block number up to which PXE synced. We set
    // the synced block number to that of the last emitted log to receive all the logs by default.
    await setSyncedBlockNumber(MAX_BLOCK_NUMBER_OF_A_LOG);

    contractAddress = await AztecAddress.random();
  });

  describe('Respects synced block number', () => {
    const syncedBlockNumber = 100;
    let nullifier: Fr;
    let contractAddress: AztecAddress;
    let leafSlot: Fr;

    beforeEach(async () => {
      leafSlot = Fr.random();
      nullifier = Fr.random();
      contractAddress = await AztecAddress.random();
      await setSyncedBlockNumber(BlockNumber(syncedBlockNumber));
    });

    it('throws when getting low nullifier membership witness for future block', async () => {
      await expect(
        getLowNullifierMembershipWitness(
          BlockNumber(syncedBlockNumber + 1),
          nullifier,
          anchorBlockDataProvider,
          aztecNode,
        ),
      ).rejects.toThrow(`Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`);
    });

    it('throws when getting block for future block number', async () => {
      await expect(getBlock(BlockNumber(syncedBlockNumber + 1), anchorBlockDataProvider, aztecNode)).rejects.toThrow(
        `Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`,
      );
    });

    it('throws when getting public data witness for future block', async () => {
      await expect(
        getPublicDataWitness(BlockNumber(syncedBlockNumber + 1), leafSlot, anchorBlockDataProvider, aztecNode),
      ).rejects.toThrow(`Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`);
    });

    it('throws when getting public storage for future block', async () => {
      await expect(
        getPublicStorageAt(
          BlockNumber(syncedBlockNumber + 1),
          contractAddress,
          leafSlot,
          anchorBlockDataProvider,
          aztecNode,
        ),
      ).rejects.toThrow(`Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`);
    });
  });

  describe('utilityBulkRetrieveLogs', () => {
    const unsiloedTag = Fr.random();
    const REQUEST_SLOT = Fr.random();
    const RESPONSE_SLOT = Fr.random();

    beforeEach(() => {
      aztecNode.getLogsByTags.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    it('returns no logs if none are found', async () => {
      aztecNode.getLogsByTags.mockResolvedValue([[]]);

      const request = new LogRetrievalRequest(contractAddress, unsiloedTag);

      await capsuleDataProvider.setCapsuleArray(contractAddress, REQUEST_SLOT, [request.toFields()]);
      await bulkRetrieveLogs(contractAddress, REQUEST_SLOT, RESPONSE_SLOT, capsuleDataProvider, aztecNode);

      expect((await capsuleDataProvider.readCapsuleArray(contractAddress, REQUEST_SLOT)).length).toEqual(0);

      const responses = await capsuleDataProvider.readCapsuleArray(contractAddress, RESPONSE_SLOT);
      expect(responses.length).toEqual(1);

      // Check Option::none
      expect(responses[0][0]).toEqual(new Fr(0)); // TODO: deserialize into option and check properly
    });

    it('returns a public log if one is found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      (scopedLog.log as PublicLog).contractAddress = contractAddress;

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();

      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const request = new LogRetrievalRequest(contractAddress, scopedLog.log.fields[0]);

      await capsuleDataProvider.setCapsuleArray(contractAddress, REQUEST_SLOT, [request.toFields()]);
      await bulkRetrieveLogs(contractAddress, REQUEST_SLOT, RESPONSE_SLOT, capsuleDataProvider, aztecNode);

      expect((await capsuleDataProvider.readCapsuleArray(contractAddress, REQUEST_SLOT)).length).toEqual(0);

      const responses = await capsuleDataProvider.readCapsuleArray(contractAddress, RESPONSE_SLOT);
      expect(responses.length).toEqual(1);

      // Check Option::some
      expect(responses[0][0]).toEqual(new Fr(1)); // TODO: deserialize into option and check properly
    });

    it('returns a private log if one is found', async () => {
      const scopedLog = await TxScopedL2Log.random(false);
      scopedLog.log.fields[0] = await siloPrivateLog(contractAddress, Fr.random());

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();
      aztecNode.getTxEffect.mockResolvedValue(indexedTxEffect);

      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const request = new LogRetrievalRequest(contractAddress, scopedLog.log.fields[0]);

      await capsuleDataProvider.setCapsuleArray(contractAddress, REQUEST_SLOT, [request.toFields()]);
      await bulkRetrieveLogs(contractAddress, REQUEST_SLOT, RESPONSE_SLOT, capsuleDataProvider, aztecNode);

      expect((await capsuleDataProvider.readCapsuleArray(contractAddress, REQUEST_SLOT)).length).toEqual(0);

      const responses = await capsuleDataProvider.readCapsuleArray(contractAddress, RESPONSE_SLOT);
      expect(responses.length).toEqual(1);

      // Check Option::some
      expect(responses[0][0]).toEqual(new Fr(1)); // TODO: deserialize into option and check properly
    });
  });

  describe('getPublicLogByTag', () => {
    const tag = Fr.random();

    beforeEach(() => {
      aztecNode.getLogsByTags.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    it('returns null if no logs found for tag', async () => {
      aztecNode.getLogsByTags.mockResolvedValue([[]]);

      const result = await getPublicLogByTag(tag, contractAddress, aztecNode);
      expect(result).toBeNull();
    });

    it('returns log data when single log found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();
      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const result = (await getPublicLogByTag(tag, logContractAddress, aztecNode))!;

      expect(result.logPayload).toEqual(scopedLog.log.getEmittedFieldsWithoutTag());
      expect(result.uniqueNoteHashesInTx).toEqual(indexedTxEffect.data.noteHashes);
      expect(result.txHash).toEqual(scopedLog.txHash);
      expect(result.firstNullifierInTx).toEqual(indexedTxEffect.data.nullifiers[0]);

      expect(aztecNode.getLogsByTags).toHaveBeenCalledWith([tag]);
      expect(aztecNode.getTxEffect).toHaveBeenCalledWith(scopedLog.txHash);
    });

    it('throws if multiple logs found for tag', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog, scopedLog]]);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      await expect(getPublicLogByTag(tag, logContractAddress, aztecNode)).rejects.toThrow(/Got 2 logs for tag/);
    });

    it('throws if tx effect not found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      aztecNode.getTxEffect.mockResolvedValue(undefined);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      await expect(getPublicLogByTag(tag, logContractAddress, aztecNode)).rejects.toThrow(
        /failed to retrieve tx effects/,
      );
    });

    it('returns log fields that are actually emitted', async () => {
      const logContractAddress = await AztecAddress.random();
      const logPlaintext = [Fr.random()];
      const logContent = [tag, ...logPlaintext];

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
        log,
      );

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLogWithPadding]]);
      aztecNode.getTxEffect.mockResolvedValue(await randomIndexedTxEffect());

      const result = await getPublicLogByTag(tag, logContractAddress, aztecNode);

      expect(result?.logPayload).toEqual(logPlaintext);
    });
  });

  describe('getPrivateLogByTag', () => {
    let tag: Fr;

    beforeEach(() => {
      tag = Fr.random();
    });

    it('returns null if no logs found', async () => {
      aztecNode.getLogsByTags.mockResolvedValue([[]]);
      const result = await getPrivateLogByTag(tag, aztecNode);
      expect(result).toBeNull();
    });

    it('returns log and tx effect if single log found', async () => {
      const scopedLog = await TxScopedL2Log.random(false);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();
      aztecNode.getTxEffect.mockResolvedValue(indexedTxEffect);

      const result = await getPrivateLogByTag(tag, aztecNode);

      expect(result?.logPayload).toEqual(scopedLog.log.getEmittedFieldsWithoutTag());
      expect(result?.uniqueNoteHashesInTx).toEqual(indexedTxEffect.data.noteHashes);
      expect(result?.txHash).toEqual(scopedLog.txHash);
      expect(result?.firstNullifierInTx).toEqual(indexedTxEffect.data.nullifiers[0]);
      expect(aztecNode.getTxEffect).toHaveBeenCalledWith(scopedLog.txHash);
    });

    it('throws if multiple logs found for tag', async () => {
      const scopedLog = await TxScopedL2Log.random(false);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog, scopedLog]]);

      await expect(getPrivateLogByTag(tag, aztecNode)).rejects.toThrow(/Got 2 logs for tag/);
    });

    it('throws if tx effect not found', async () => {
      const scopedLog = await TxScopedL2Log.random(false);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      aztecNode.getTxEffect.mockResolvedValue(undefined);

      await expect(getPrivateLogByTag(tag, aztecNode)).rejects.toThrow(/failed to retrieve tx effects/);
    });
  });

  const setSyncedBlockNumber = (blockNumber: BlockNumber) => {
    return anchorBlockDataProvider.setHeader(
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber }),
      }),
    );
  };
});
