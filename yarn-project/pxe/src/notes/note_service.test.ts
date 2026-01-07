import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash, randomDataInBlock } from '@aztec/stdlib/block';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type IndexedTxEffect, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import { NoteStore } from '../storage/note_store/note_store.js';
import { NoteService } from './note_service.js';

describe('NoteService', () => {
  let anchorBlockStore: AnchorBlockStore;
  let noteStore: NoteStore;
  let keyStore: KeyStore;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  const syncedBlockNumber = 42;
  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  let noteService: NoteService;
  const TEST_JOB_ID = 'test-job-id';

  beforeEach(async () => {
    const store = await openTmpStore('test');
    keyStore = new KeyStore(store);
    noteStore = await NoteStore.create(store);
    aztecNode = mock<AztecNode>();
    anchorBlockStore = new AnchorBlockStore(store);
    await anchorBlockStore.setHeader(
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(syncedBlockNumber) }),
      }),
    );

    contractAddress = await AztecAddress.random();

    // Check that there are no notes in the database
    const notes = await noteStore.getNotes({ contractAddress });
    expect(notes).toHaveLength(0);

    // Check that the expected number of accounts is present
    const accounts = await keyStore.getAccounts();
    expect(accounts).toHaveLength(0);

    recipient = await keyStore.addAccount(new Fr(69), Fr.random());

    noteService = new NoteService(noteStore, aztecNode, anchorBlockStore, TEST_JOB_ID);
  });

  it('should remove notes that have been nullified', async () => {
    const noteDao = await NoteDao.random({ contractAddress });

    // Spy on the noteStore.applyNullifiers to later on have additional guarantee that we really removed
    // the note.
    jest.spyOn(noteStore, 'applyNullifiers');

    // Add the note to storage
    await noteStore.addNotes([noteDao], recipient.address, TEST_JOB_ID);

    const nullifierIndex = randomDataInBlock(123n);
    aztecNode.findLeavesIndexes.mockResolvedValue([nullifierIndex]);

    await noteService.syncNoteNullifiers(contractAddress);

    // Verify the note was removed by checking storage
    const remainingNotes = await noteStore.getNotes(
      {
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient.address],
      },
      TEST_JOB_ID,
    );
    expect(remainingNotes).toHaveLength(0);

    // Verify the note was removed by checking the spy
    expect(noteStore.applyNullifiers).toHaveBeenCalledTimes(1);
  });

  it('should keep notes that have not been nullified', async () => {
    // Set up initial state with a note
    const noteDao = await NoteDao.random({ contractAddress });

    // Add the note to storage
    await noteStore.addNotes([noteDao], recipient.address, TEST_JOB_ID);

    // No nullifier found in merkle tree
    aztecNode.findLeavesIndexes.mockResolvedValue([undefined]);

    // Call the function under test
    await noteService.syncNoteNullifiers(contractAddress);

    // Verify note still exists
    const remainingNotes = await noteStore.getNotes(
      {
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient.address],
      },
      TEST_JOB_ID,
    );
    expect(remainingNotes).toHaveLength(1);
    expect(remainingNotes[0]).toEqual(noteDao);
  });

  // Verifies that notes are not marked as nullified when their nullifier only exists in blocks that haven't been
  // synced yet. We mock the nullifier to only exist in blocks beyond our current sync point, then verify the note
  // is not removed by applyNullifiers.
  it('should not remove notes if nullifier is in unsynced blocks', async () => {
    // Set up initial state with a note
    const noteDao = await NoteDao.random({ contractAddress });

    // Add the note to storage
    await noteStore.addNotes([noteDao], recipient.address, TEST_JOB_ID);

    // Mock nullifier to only exist after synced block
    aztecNode.findLeavesIndexes.mockImplementation(blockNum => {
      if (typeof blockNum === 'number' && blockNum > syncedBlockNumber) {
        return Promise.resolve([randomDataInBlock(0n)]);
      }
      return Promise.resolve([undefined]);
    });

    // Call the function under test
    await noteService.syncNoteNullifiers(contractAddress);

    // Verify note still exists
    const remainingNotes = await noteStore.getNotes(
      {
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient.address],
      },
      TEST_JOB_ID,
    );
    expect(remainingNotes).toHaveLength(1);
    expect(remainingNotes[0]).toEqual(noteDao);
  });

  it('should search for notes from all accounts', async () => {
    // Add multiple accounts to keystore
    await keyStore.addAccount(Fr.random(), Fr.random());
    await keyStore.addAccount(Fr.random(), Fr.random());

    expect(await keyStore.getAccounts()).toHaveLength(3);

    // Spy on the noteStore.getNotesSpy
    const getNotesSpy = jest.spyOn(noteStore, 'getNotes');

    // Call the function under test
    await noteService.syncNoteNullifiers(contractAddress);

    // Verify applyNullifiers was called once for all accounts
    expect(getNotesSpy).toHaveBeenCalledTimes(1);

    // Verify getNotes was called with the correct contract address (and jobId for production)
    expect(getNotesSpy).toHaveBeenCalledWith(expect.objectContaining({ contractAddress }), TEST_JOB_ID);
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

    const setSyncedBlockNumber = (blockNumber: BlockNumber) => {
      return anchorBlockStore.setHeader(
        BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ blockNumber }),
        }),
      );
    };

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
      await noteService.deliverNote(
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
      const notes = await noteStore.getNotes({ contractAddress, scopes: [recipient.address] }, TEST_JOB_ID);

      expect(notes).toHaveLength(1);
      expect(notes[0].noteHash.equals(noteHash)).toBe(true);
    });

    it('should throw if tx hash does not exist', async () => {
      await expect(
        noteService.deliverNote(
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
        noteService.deliverNote(
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
        noteService.deliverNote(
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

      await noteService.deliverNote(
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
      const notes = await noteStore.getNotes({ contractAddress, scopes: [recipient.address] }, TEST_JOB_ID);
      expect(notes).toHaveLength(0);
    });
  });
});
