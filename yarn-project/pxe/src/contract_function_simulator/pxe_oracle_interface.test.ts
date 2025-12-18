import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash, randomDataInBlock } from '@aztec/stdlib/block';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type IndexedTxEffect, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import { ContractDataProvider } from '../storage/contract_data_provider/contract_data_provider.js';
import { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import { PrivateEventDataProvider } from '../storage/private_event_data_provider/private_event_data_provider.js';
import { PXEOracleInterface } from './pxe_oracle_interface.js';

jest.setTimeout(30_000);

describe('PXEOracleInterface', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let privateEventDataProvider: PrivateEventDataProvider;
  let contractDataProvider: ContractDataProvider;
  let noteDataProvider: NoteDataProvider;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let capsuleDataProvider: CapsuleDataProvider;
  let keyStore: KeyStore;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  let pxeOracleInterface: PXEOracleInterface;

  // The block number of the last log to be emitted.
  const MAX_BLOCK_NUMBER_OF_A_LOG = BlockNumber(3);

  beforeEach(async () => {
    const store = await openTmpStore('test');
    aztecNode = mock<AztecNode>();
    contractDataProvider = new ContractDataProvider(store);
    jest.spyOn(contractDataProvider, 'getDebugContractName').mockImplementation(() => Promise.resolve('TestContract'));

    addressDataProvider = new AddressDataProvider(store);
    privateEventDataProvider = new PrivateEventDataProvider(store);
    noteDataProvider = await NoteDataProvider.create(store);
    anchorBlockDataProvider = new AnchorBlockDataProvider(store);
    capsuleDataProvider = new CapsuleDataProvider(store);
    keyStore = new KeyStore(store);
    pxeOracleInterface = new PXEOracleInterface(
      aztecNode,
      noteDataProvider,
      capsuleDataProvider,
      anchorBlockDataProvider,
      privateEventDataProvider,
    ); // Set up contract address
    contractAddress = await AztecAddress.random();
    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await addressDataProvider.addCompleteAddress(recipient);

    // PXEOracleInterface.syncTaggedLogs(...) function syncs logs up to the block number up to which PXE synced. We set
    // the synced block number to that of the last emitted log to receive all the logs by default.
    await setSyncedBlockNumber(MAX_BLOCK_NUMBER_OF_A_LOG);
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

    function deliverEvent(
      overrides: {
        eventCommitment?: Fr;
      } = {},
    ) {
      return pxeOracleInterface.deliverEvent(
        contractAddress,
        eventSelector,
        eventContent,
        overrides.eventCommitment || eventCommitment,
        txEffect.txHash,
        recipient.address,
      );
    }

    it('should throw when tx does not exist or has no effects', async () => {
      aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(undefined));
      await expect(deliverEvent).rejects.toThrow(/Could not find tx effect for tx hash/);
    });

    it('should throw when tx block has not yet been synchronized', async () => {
      indexedTxEffect = {
        ...indexedTxEffect,
        l2BlockNumber: BlockNumber(blockNumber + 1),
      };
      aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(indexedTxEffect));

      await expect(deliverEvent).rejects.toThrow(/Could not find tx effect for tx hash .* as of block number/);
    });

    it('should throw if event is not in tx effects', async () => {
      await expect(deliverEvent({ eventCommitment: Fr.random() })).rejects.toThrow(
        /Event commitment .* is not present in tx/,
      );
    });

    it('should throw if event is not in nullifiers', async () => {
      aztecNode.findLeavesIndexes.mockImplementation(() => Promise.resolve([]));

      await expect(deliverEvent).rejects.toThrow(/Event commitment .* is not present on the nullifier tree/);
    });

    it('should store event for later retrieval', async () => {
      await deliverEvent();

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
      await pxeOracleInterface.deliverNote(
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
      );

      // Verify note was stored
      const notes = await noteDataProvider.getNotes({ contractAddress, scopes: [recipient.address] });

      expect(notes).toHaveLength(1);
      expect(notes[0].noteHash.equals(noteHash)).toBe(true);
    });

    it('should throw if tx hash does not exist', async () => {
      await expect(
        pxeOracleInterface.deliverNote(
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
        ),
      ).rejects.toThrow(/Could not find tx effect/);
    });

    it('should throw if note was not emitted in the tx', async () => {
      await expect(
        pxeOracleInterface.deliverNote(
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
        ),
      ).rejects.toThrow(/is not present in tx/);
    });

    it('should throw if tx was mined after synced block number', async () => {
      await setSyncedBlockNumber(BlockNumber(blockNumber - 1));

      await expect(
        pxeOracleInterface.deliverNote(
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
        ),
      ).rejects.toThrow(/as of block number/);
    });

    it('should store and immediately remove note if it is already nullified', async () => {
      nullified = true;

      await pxeOracleInterface.deliverNote(
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
      await pxeOracleInterface.syncNoteNullifiers(contractAddress);

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
      await pxeOracleInterface.syncNoteNullifiers(contractAddress);

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
      await pxeOracleInterface.syncNoteNullifiers(contractAddress);

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
      await pxeOracleInterface.syncNoteNullifiers(contractAddress);

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
