import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash, randomDataInBlock } from '@aztec/stdlib/block';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier, siloPrivateLog } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { PublicLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import { NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  GlobalVariables,
  type IndexedTxEffect,
  TxEffect,
  TxHash,
  randomIndexedTxEffect,
} from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { randomInt } from 'crypto';
import { type MockProxy, mock } from 'jest-mock-extended';

import {
  AddressDataProvider,
  AnchorBlockDataProvider,
  CapsuleDataProvider,
  ContractDataProvider,
  NoteDao,
  NoteDataProvider,
  PrivateEventDataProvider,
} from '../../storage/index.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import {
  bulkRetrieveLogs,
  deliverEvent,
  deliverNote,
  getBlock,
  getPrivateLogByTag,
  getPublicDataWitness,
  getPublicLogByTag,
  getPublicStorageAt,
  syncNoteNullifiers,
} from './common.js';

jest.setTimeout(30_000);

describe('Common oracle functions', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let contractDataProvider: ContractDataProvider;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let keyStore: KeyStore;
  let capsuleDataProvider: CapsuleDataProvider;
  let privateEventDataProvider: PrivateEventDataProvider;
  let noteDataProvider: NoteDataProvider;

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
    privateEventDataProvider = new PrivateEventDataProvider(store);
    capsuleDataProvider = new CapsuleDataProvider(store);
    noteDataProvider = await NoteDataProvider.create(store);

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
    let contractAddress: AztecAddress;
    let leafSlot: Fr;

    beforeEach(async () => {
      leafSlot = Fr.random();
      contractAddress = await AztecAddress.random();
      await setSyncedBlockNumber(BlockNumber(syncedBlockNumber));
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

  describe('deliverEvent', () => {
    let blockNumber: BlockNumber;
    let eventSelector: EventSelector;
    let eventContent: Fr[];
    let eventCommitment: Fr;
    let eventNullifier: Fr;
    let txEffect: TxEffect;
    let indexedTxEffect: IndexedTxEffect;

    // beforeEach sets up the happy path case, so error modes are tested
    // by minimally failing happy path conditions
    beforeEach(async () => {
      blockNumber = BlockNumber(42);
      eventSelector = EventSelector.random();
      eventContent = [Fr.random(), Fr.random()];

      eventCommitment = Fr.random();
      eventNullifier = await siloNullifier(contractAddress, eventCommitment);

      txEffect = TxEffect.from({
        ...(await TxEffect.random()),
        nullifiers: [eventNullifier],
      });

      indexedTxEffect = {
        l2BlockNumber: blockNumber,
        l2BlockHash: L2BlockHash.random(),
        data: txEffect,
        txIndexInBlock: 0,
      };

      /* Happy path context conditions:
       ** - PXE is sync'd to _at least_ block including tx
       ** - Node knows tx effect
       ** - Node knows siloed event commitment
       */
      await setSyncedBlockNumber(blockNumber);

      aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(indexedTxEffect));

      aztecNode.findLeavesIndexes.mockImplementation(() =>
        Promise.resolve([
          {
            data: BigInt(0),
            l2BlockNumber: indexedTxEffect.l2BlockNumber,
            l2BlockHash: indexedTxEffect.l2BlockHash,
          },
        ]),
      );
    });

    function runDeliverEvent(
      overrides: {
        eventCommitment?: Fr;
      } = {},
    ) {
      return deliverEvent(
        contractAddress,
        eventSelector,
        eventContent,
        overrides.eventCommitment || eventCommitment,
        txEffect.txHash,
        recipient.address,
        anchorBlockDataProvider,
        aztecNode,
        privateEventDataProvider,
      );
    }

    it('should throw when tx does not exist or has no effects', async () => {
      aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(undefined));
      await expect(runDeliverEvent).rejects.toThrow(/Could not find tx effect for tx hash/);
    });

    it('should throw when tx block has not yet been synchronized', async () => {
      indexedTxEffect = {
        ...indexedTxEffect,
        l2BlockNumber: BlockNumber(blockNumber + 1),
      };
      aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(indexedTxEffect));

      await expect(runDeliverEvent).rejects.toThrow(/Could not find tx effect for tx hash .* as of block number/);
    });

    it('should throw if event is not in tx effects', async () => {
      await expect(runDeliverEvent({ eventCommitment: Fr.random() })).rejects.toThrow(
        /Event commitment .* is not present in tx/,
      );
    });

    it('should throw if event is not in nullifiers', async () => {
      aztecNode.findLeavesIndexes.mockImplementation(() => Promise.resolve([]));

      await expect(runDeliverEvent).rejects.toThrow(/Event commitment .* is not present on the nullifier tree/);
    });

    it('should store event for later retrieval', async () => {
      await runDeliverEvent();

      // I should be able to retrieve the private event I just saved using getPrivateEvents
      const result = await privateEventDataProvider.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: blockNumber,
        toBlock: blockNumber + 1,
        scopes: [recipient.address],
      });

      expect(result.length).toEqual(1);
      expect(result[0].packedEvent).toEqual(eventContent);
    });
  });

  describe('deliverNote', () => {
    // Recipient is different from the owner because recipient refers to the
    // recipient of the message containing the note, while owner refers to the
    // owner of the note.
    let owner: AztecAddress;
    let storageSlot: Fr;
    let randomness: Fr;
    let noteNonce: Fr;
    let content: Fr[];

    let noteHash: Fr;
    let uniqueNoteHash: Fr;
    let nullifier: Fr;
    let siloedNullifier: Fr;

    let txHash: TxHash;
    let txEffect: TxEffect;
    let indexedTxEffect: IndexedTxEffect;
    let blockNumber: BlockNumber;

    let nullified = false;

    // beforeEach sets up the happy path case, so error modes are tested
    // by minimally failing happy path conditions
    beforeEach(async () => {
      noteHash = Fr.random();
      nullifier = Fr.random();
      txHash = TxHash.random();
      owner = await AztecAddress.random();
      storageSlot = Fr.random();
      randomness = Fr.random();
      noteNonce = Fr.random();
      content = [Fr.random(), Fr.random()];

      uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
      siloedNullifier = await siloNullifier(contractAddress, nullifier);

      blockNumber = BlockNumber(42);

      txEffect = TxEffect.from({
        ...(await TxEffect.random()),
        noteHashes: [uniqueNoteHash],
      });

      indexedTxEffect = {
        l2BlockNumber: blockNumber,
        l2BlockHash: L2BlockHash.random(),
        data: txEffect,
        txIndexInBlock: 0,
      };

      /* Happy path context conditions:
       ** - PXE is sync'd to _at least_ block including tx
       ** - Node knows tx effect
       ** - Node knows unique note hash (and siloed nullifier if requested)
       */
      await setSyncedBlockNumber(blockNumber);

      aztecNode.getTxEffect.mockImplementation(queryTxHash =>
        Promise.resolve(queryTxHash == txHash ? indexedTxEffect : undefined),
      );

      aztecNode.findLeavesIndexes.mockImplementation((queryBlockNum, treeId, leaves) => {
        if (queryBlockNum != blockNumber) {
          throw new Error(`Got a tree query for block ${queryBlockNum} but synced block is ${blockNumber}`);
        }

        if (treeId == MerkleTreeId.NOTE_HASH_TREE && leaves[0].equals(uniqueNoteHash)) {
          return Promise.resolve([
            {
              data: BigInt(0),
              l2BlockNumber: indexedTxEffect.l2BlockNumber,
              l2BlockHash: indexedTxEffect.l2BlockHash,
            },
          ]);
        } else if (treeId == MerkleTreeId.NULLIFIER_TREE && leaves[0].equals(siloedNullifier)) {
          // Note that returning undefined (i.e. the un-nullified case) covers both scenarios where the note has not
          // been nullified and where the nullifier is in a block past the synced block.
          return Promise.resolve([
            nullified
              ? {
                  data: BigInt(0),
                  l2BlockNumber: indexedTxEffect.l2BlockNumber,
                  l2BlockHash: indexedTxEffect.l2BlockHash,
                }
              : undefined,
          ]);
        } else {
          throw new Error();
        }
      });
    });

    it('should store note if it exists in note hash tree and is not nullified', async () => {
      await deliverNote(
        contractAddress,
        owner,
        storageSlot,
        randomness,
        noteNonce,
        content,
        noteHash,
        nullifier,
        txHash,
        recipient.address,
        anchorBlockDataProvider,
        aztecNode,
        noteDataProvider,
      );

      // Verify note was stored
      const notes = await noteDataProvider.getNotes({ contractAddress, scopes: [recipient.address] });

      expect(notes).toHaveLength(1);
      expect(notes[0].noteHash.equals(noteHash)).toBe(true);
    });

    it('should throw if tx hash does not exist', async () => {
      await expect(
        deliverNote(
          contractAddress,
          owner,
          storageSlot,
          randomness,
          noteNonce,
          content,
          noteHash,
          nullifier,
          TxHash.random(),
          recipient.address,
          anchorBlockDataProvider,
          aztecNode,
          noteDataProvider,
        ),
      ).rejects.toThrow(/Could not find tx effect/);
    });

    it('should throw if note was not emitted in the tx', async () => {
      await expect(
        deliverNote(
          contractAddress,
          owner,
          storageSlot,
          randomness,
          noteNonce,
          content,
          Fr.random(), // note hash
          nullifier,
          txHash,
          recipient.address,
          anchorBlockDataProvider,
          aztecNode,
          noteDataProvider,
        ),
      ).rejects.toThrow(/is not present in tx/);
    });

    it('should throw if tx was mined after synced block number', async () => {
      await setSyncedBlockNumber(BlockNumber(blockNumber - 1));

      await expect(
        deliverNote(
          contractAddress,
          owner,
          storageSlot,
          randomness,
          noteNonce,
          content,
          noteHash,
          nullifier,
          txHash,
          recipient.address,
          anchorBlockDataProvider,
          aztecNode,
          noteDataProvider,
        ),
      ).rejects.toThrow(/as of block number/);
    });

    it('should store and immediately remove note if it is already nullified', async () => {
      nullified = true;

      await deliverNote(
        contractAddress,
        owner,
        storageSlot,
        randomness,
        noteNonce,
        content,
        noteHash,
        nullifier,
        txHash,
        recipient.address,
        anchorBlockDataProvider,
        aztecNode,
        noteDataProvider,
      );

      // Verify note was removed
      const notes = await noteDataProvider.getNotes({ contractAddress, scopes: [recipient.address] });
      expect(notes).toHaveLength(0);
    });
  });

  describe('syncNoteNullifiers', () => {
    let recipient: AztecAddress;

    beforeEach(async () => {
      // Check that there are no notes in the database
      const notes = await noteDataProvider.getNotes({ contractAddress });
      expect(notes).toHaveLength(0);

      // Check that the expected number of accounts is present
      const accounts = await keyStore.getAccounts();
      expect(accounts).toHaveLength(1);

      recipient = accounts[0];
    });

    it('should remove notes that have been nullified', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress });

      // Spy on the noteDataProvider.applyNullifiers to later on have additional guarantee that we really removed
      // the note.
      jest.spyOn(noteDataProvider, 'applyNullifiers');

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // Set up the nullifier in the merkle tree
      const nullifierIndex = randomDataInBlock(123n);
      aztecNode.findLeavesIndexes.mockResolvedValue([nullifierIndex]);

      // Call the function under test
      await syncNoteNullifiers(contractAddress, anchorBlockDataProvider, noteDataProvider, aztecNode);

      // Verify the note was removed by checking storage
      const remainingNotes = await noteDataProvider.getNotes({
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient],
      });
      expect(remainingNotes).toHaveLength(0);

      // Verify the note was removed by checking the spy
      expect(noteDataProvider.applyNullifiers).toHaveBeenCalledTimes(1);
    });

    it('should keep notes that have not been nullified', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress });

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // No nullifier found in merkle tree
      aztecNode.findLeavesIndexes.mockResolvedValue([undefined]);

      // Call the function under test
      await syncNoteNullifiers(contractAddress, anchorBlockDataProvider, noteDataProvider, aztecNode);

      // Verify note still exists
      const remainingNotes = await noteDataProvider.getNotes({
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient],
      });
      expect(remainingNotes).toHaveLength(1);
      expect(remainingNotes[0]).toEqual(noteDao);
    });

    // Verifies that notes are not marked as nullified when their nullifier only exists in blocks that haven't been
    // synced yet. We mock the nullifier to only exist in blocks beyond our current sync point, then verify the note
    // is not removed by applyNullifiers.
    it('should not remove notes if nullifier is in unsynced blocks', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress });
      const syncedBlockNumber = 100;
      await setSyncedBlockNumber(BlockNumber(syncedBlockNumber));

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // Mock nullifier to only exist after synced block
      aztecNode.findLeavesIndexes.mockImplementation(blockNum => {
        if (typeof blockNum === 'number' && blockNum > syncedBlockNumber) {
          return Promise.resolve([randomDataInBlock(0n)]);
        }
        return Promise.resolve([undefined]);
      });

      // Call the function under test
      await syncNoteNullifiers(contractAddress, anchorBlockDataProvider, noteDataProvider, aztecNode);
      // Verify note still exists
      const remainingNotes = await noteDataProvider.getNotes({
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient],
      });
      expect(remainingNotes).toHaveLength(1);
      expect(remainingNotes[0]).toEqual(noteDao);
    });

    it('should search for notes from all accounts', async () => {
      // Add multiple accounts to keystore
      await keyStore.addAccount(Fr.random(), Fr.random());
      await keyStore.addAccount(Fr.random(), Fr.random());

      expect(await keyStore.getAccounts()).toHaveLength(3);

      // Spy on the noteDataProvider.getNotesSpy
      const getNotesSpy = jest.spyOn(noteDataProvider, 'getNotes');

      // Call the function under test
      await syncNoteNullifiers(contractAddress, anchorBlockDataProvider, noteDataProvider, aztecNode);

      // Verify applyNullifiers was called once for all accounts
      expect(getNotesSpy).toHaveBeenCalledTimes(1);

      // Verify getNotes was called with the correct contract address
      expect(getNotesSpy).toHaveBeenCalledWith(expect.objectContaining({ contractAddress }));
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
