import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
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

  beforeEach(async () => {
    const store = await openTmpStore('test', createLogger('pxe:test'));
    keyStore = new KeyStore(store);
    const log = createLogger('pxe:test');
    noteStore = new NoteStore(store, log);
    aztecNode = mock<AztecNode>();
    anchorBlockStore = new AnchorBlockStore(store);
    await anchorBlockStore.setHeader(
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(syncedBlockNumber) }),
      }),
    );

    contractAddress = await AztecAddress.random();

    const notes = await noteStore.getNotes({ contractAddress }, 'test');
    expect(notes).toHaveLength(0);

    const accounts = await keyStore.getAccounts();
    expect(accounts).toHaveLength(0);

    recipient = await keyStore.addAccount(new Fr(69), Fr.random());

    noteService = new NoteService(noteStore, aztecNode, anchorBlockStore, 'test');
  });

  it('should remove notes that have been nullified', async () => {
    const noteDao = await NoteDao.random({ contractAddress });

    // Spy on the noteStore.applyNullifiers to later on have additional guarantee that we really removed
    // the note.
    jest.spyOn(noteStore, 'applyNullifiers');

    await noteStore.addNotes([noteDao], recipient.address, 'test');

    // Set up the nullifier in the merkle tree
    const nullifierIndex = randomDataInBlock(123n);
    aztecNode.findLeavesIndexes.mockResolvedValue([nullifierIndex]);

    await noteService.syncNoteNullifiers(contractAddress);

    const remainingNotes = await noteStore.getNotes(
      {
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient.address],
      },
      'test',
    );
    expect(remainingNotes).toHaveLength(0);

    // Verify the note was removed by checking the spy
    expect(noteStore.applyNullifiers).toHaveBeenCalledTimes(1);

    // Verify that the changes persist after job completion
    {
      await noteStore.commit('test');
      const remainingNotes = await noteStore.getNotes(
        {
          contractAddress,
          status: NoteStatus.ACTIVE,
          scopes: [recipient.address],
        },
        'fresh-job',
      );
      expect(remainingNotes).toHaveLength(0);
    }
  });

  it('should keep notes that have not been nullified', async () => {
    const noteDao = await NoteDao.random({ contractAddress });

    await noteStore.addNotes([noteDao], recipient.address, 'test');

    // No nullifier found in merkle tree
    aztecNode.findLeavesIndexes.mockResolvedValue([undefined]);

    await noteService.syncNoteNullifiers(contractAddress);

    const remainingNotes = await noteStore.getNotes(
      {
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient.address],
      },
      'test',
    );
    expect(remainingNotes).toHaveLength(1);
    expect(remainingNotes[0]).toEqual(noteDao);

    // Verify that the changes persist after job completion
    {
      await noteStore.commit('test');
      const remainingNotes = await noteStore.getNotes(
        {
          contractAddress,
          status: NoteStatus.ACTIVE,
          scopes: [recipient.address],
        },
        'fresh-job',
      );
      expect(remainingNotes).toHaveLength(1);
      expect(remainingNotes[0]).toEqual(noteDao);
    }
  });

  // Verifies that notes are not marked as nullified when their nullifier only exists in blocks that haven't been
  // synced yet. We mock the nullifier to only exist in blocks beyond our current sync point, then verify the note
  // is not removed by applyNullifiers.
  it('should not remove notes if nullifier is in unsynced blocks', async () => {
    const noteDao = await NoteDao.random({ contractAddress });

    await noteStore.addNotes([noteDao], recipient.address, 'test');

    // Mock nullifier to only exist after synced block
    aztecNode.findLeavesIndexes.mockImplementation(blockNum => {
      if (typeof blockNum === 'number' && blockNum > syncedBlockNumber) {
        return Promise.resolve([randomDataInBlock(0n)]);
      }
      return Promise.resolve([undefined]);
    });

    await noteService.syncNoteNullifiers(contractAddress);

    // Verify note still exists
    const remainingNotes = await noteStore.getNotes(
      {
        contractAddress,
        status: NoteStatus.ACTIVE,
        scopes: [recipient.address],
      },
      'test',
    );
    expect(remainingNotes).toHaveLength(1);
    expect(remainingNotes[0]).toEqual(noteDao);

    // Verify that the changes persist after job completion
    {
      await noteStore.commit('test');
      const remainingNotes = await noteStore.getNotes(
        {
          contractAddress,
          status: NoteStatus.ACTIVE,
          scopes: [recipient.address],
        },
        'fresh-job',
      );
      expect(remainingNotes).toHaveLength(1);
      expect(remainingNotes[0]).toEqual(noteDao);
    }
  });

  it('should search for notes from all accounts', async () => {
    await keyStore.addAccount(Fr.random(), Fr.random());
    await keyStore.addAccount(Fr.random(), Fr.random());

    expect(await keyStore.getAccounts()).toHaveLength(3);

    const getNotesSpy = jest.spyOn(noteStore, 'getNotes');

    await noteService.syncNoteNullifiers(contractAddress);

    // Verify applyNullifiers was called once for all accounts
    expect(getNotesSpy).toHaveBeenCalledTimes(1);

    // Verify getNotes was called with the correct contract address and jobId
    expect(getNotesSpy).toHaveBeenCalledWith(expect.objectContaining({ contractAddress }), 'test');
  });

  describe('storeNote', () => {
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

    let txHash: TxHash;
    let txEffect: TxEffect;
    let indexedTxEffect: IndexedTxEffect;
    let blockNumber: BlockNumber;

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

      aztecNode.findLeavesIndexes.mockImplementation((_queryBlockParam, _treeId, _leaves) => {
        // By default the note is not yet nullified.
        return Promise.resolve([undefined]);
      });
    });

    it('should store note if it exists in a tx effect', async () => {
      await noteService.storeNote(
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
      const notes = await noteStore.getNotes({ contractAddress, scopes: [recipient.address] }, 'test');

      expect(notes).toHaveLength(1);
      expect(notes[0].noteHash.equals(noteHash)).toBe(true);

      // Verify note is still stored after committing job
      {
        await noteStore.commit('test');

        const notes = await noteStore.getNotes({ contractAddress, scopes: [recipient.address] }, 'fresh-job');

        expect(notes).toHaveLength(1);
        expect(notes[0].noteHash.equals(noteHash)).toBe(true);
      }
    });

    it('should throw if tx hash does not exist', async () => {
      await expect(
        noteService.storeNote(
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
        noteService.storeNote(
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
        noteService.storeNote(
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

    it('should nullify note if nullifier index is found', async () => {
      const siloedNullifier = await siloNullifier(contractAddress, nullifier);
      const nullifierIndex = randomDataInBlock(123n);

      // Override the mock to return a nullifier index (indicating the note has been nullified)
      aztecNode.findLeavesIndexes.mockImplementation((_queryBlockNum, treeId, leaves) => {
        if (treeId == MerkleTreeId.NULLIFIER_TREE && leaves[0].equals(siloedNullifier)) {
          return Promise.resolve([nullifierIndex]);
        }
        return Promise.resolve([undefined]);
      });

      await noteService.storeNote(
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

      const verifyNoteNullifiedInJobContext = async (jobId: string) => {
        // Now we verify that the note is stored as nullified by checking it can be retrieved only with
        // the ACTIVE_OR_NULLIFIED status on the input.
        const allNotes = await noteStore.getNotes(
          {
            contractAddress,
            scopes: [recipient.address],
            status: NoteStatus.ACTIVE_OR_NULLIFIED,
          },
          jobId,
        );
        expect(allNotes).toHaveLength(1);
        expect(allNotes[0].noteHash.equals(noteHash)).toBe(true);

        const activeNotes = await noteStore.getNotes(
          {
            contractAddress,
            scopes: [recipient.address],
            status: NoteStatus.ACTIVE,
          },
          jobId,
        );
        expect(activeNotes).toHaveLength(0);
      };

      // Verify store behaves correctly pre and post commit
      await verifyNoteNullifiedInJobContext('test');
      await noteStore.commit('test');
      await verifyNoteNullifiedInJobContext('fresh-job');
    });
  });
});
