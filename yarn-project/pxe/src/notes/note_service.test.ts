import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, randomDataInBlock } from '@aztec/stdlib/block';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { makeBlockHeader } from '@aztec/stdlib/testing';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { type IndexedTxEffect, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { NoteValidationRequest } from '../contract_function_simulator/noir-structs/note_validation_request.js';
import { NoteStore } from '../storage/note_store/note_store.js';
import { NoteService } from './note_service.js';

describe('NoteService', () => {
  let noteStore: NoteStore;
  let keyStore: KeyStore;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  const syncedBlockNumber = 42;
  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  let noteService: NoteService;

  const setSyncedBlockNumber = (blockNumber: BlockNumber) => {
    const anchorBlockHeader = makeBlockHeader(0, { blockNumber });
    noteService = new NoteService(noteStore, aztecNode, anchorBlockHeader, 'test');
  };

  beforeEach(async () => {
    const store = await openTmpStore('test');
    keyStore = new KeyStore(store);
    noteStore = new NoteStore(store);
    aztecNode = mock<AztecNode>();

    contractAddress = await AztecAddress.random();

    recipient = await keyStore.addAccount(new Fr(69), Fr.random());

    const notes = await noteStore.getNotes({ contractAddress, scopes: [recipient.address] }, 'test');
    expect(notes).toHaveLength(0);

    const accounts = await keyStore.getAccounts();
    expect(accounts).toHaveLength(1);

    setSyncedBlockNumber(BlockNumber(syncedBlockNumber));
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

    await noteService.syncNoteNullifiers(contractAddress, [recipient.address]);

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

    await noteService.syncNoteNullifiers(contractAddress, [recipient.address]);

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

    await noteService.syncNoteNullifiers(contractAddress, [recipient.address]);

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

    await noteService.syncNoteNullifiers(contractAddress, [recipient.address]);

    // Verify applyNullifiers was called once for all accounts
    expect(getNotesSpy).toHaveBeenCalledTimes(1);

    // Verify getNotes was called with the correct contract address and jobId
    expect(getNotesSpy).toHaveBeenCalledWith(expect.objectContaining({ contractAddress }), 'test');
  });

  describe('validateAndStoreNotes', () => {
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

    let buildRequest: (overrides?: Partial<NoteValidationRequest>) => NoteValidationRequest;

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
        l2BlockHash: BlockHash.random(),
        data: txEffect,
        txIndexInBlock: 0,
      };

      /* Happy path context conditions:
       ** - PXE is sync'd to _at least_ block including tx
       ** - Node knows tx effect (passed in via the prefetched map)
       ** - Node knows unique note hash (and siloed nullifier if requested)
       */
      setSyncedBlockNumber(blockNumber);

      buildRequest = (overrides = {}) =>
        new NoteValidationRequest(
          overrides.contractAddress ?? contractAddress,
          overrides.owner ?? owner,
          overrides.storageSlot ?? storageSlot,
          overrides.randomness ?? randomness,
          overrides.noteNonce ?? noteNonce,
          overrides.content ?? content,
          overrides.noteHash ?? noteHash,
          overrides.nullifier ?? nullifier,
          overrides.txHash ?? txHash,
        );

      aztecNode.findLeavesIndexes.mockImplementation((_queryBlockParam, _treeId, leaves) => {
        // By default the notes are not yet nullified.
        return Promise.resolve(leaves.map(() => undefined));
      });
    });

    it('should store note if it exists in a tx effect', async () => {
      await noteService.validateAndStoreNotes([buildRequest()], recipient.address, defaultTxEffectsMap());

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
        noteService.validateAndStoreNotes(
          [buildRequest({ txHash: TxHash.random() })],
          recipient.address,
          defaultTxEffectsMap(),
        ),
      ).rejects.toThrow(/Could not find tx effect/);
    });

    it('should throw if note was not emitted in the tx', async () => {
      await expect(
        noteService.validateAndStoreNotes(
          [buildRequest({ noteHash: Fr.random() })],
          recipient.address,
          defaultTxEffectsMap(),
        ),
      ).rejects.toThrow(/is not present in tx/);
    });

    it('should throw if tx was mined after synced block number', async () => {
      setSyncedBlockNumber(BlockNumber(blockNumber - 1));

      await expect(
        noteService.validateAndStoreNotes([buildRequest()], recipient.address, defaultTxEffectsMap()),
      ).rejects.toThrow(/Obtained a newer tx effect for .* for a note validation request than the anchor block/);
    });

    it('should batch findLeavesIndexes across notes', async () => {
      // Two notes from the same tx so we can reuse the indexedTxEffect; each carries its own unique note hash.
      const otherNoteHash = Fr.random();
      const otherNullifier = Fr.random();
      const otherNoteNonce = Fr.random();
      const otherUniqueNoteHash = await computeUniqueNoteHash(
        otherNoteNonce,
        await siloNoteHash(contractAddress, otherNoteHash),
      );

      const sharedTxEffect: IndexedTxEffect = {
        ...indexedTxEffect,
        data: TxEffect.from({
          ...indexedTxEffect.data,
          noteHashes: [uniqueNoteHash, otherUniqueNoteHash],
        }),
      };
      const map = new Map([[txHash.toString(), sharedTxEffect]]);

      await noteService.validateAndStoreNotes(
        [
          buildRequest(),
          buildRequest({ noteHash: otherNoteHash, nullifier: otherNullifier, noteNonce: otherNoteNonce }),
        ],
        recipient.address,
        map,
      );

      // Both notes should have been looked up in a single batched call.
      expect(aztecNode.findLeavesIndexes).toHaveBeenCalledTimes(1);
      const [, , leaves] = aztecNode.findLeavesIndexes.mock.calls[0];
      expect(leaves).toHaveLength(2);
    });

    it('should nullify note if nullifier index is found', async () => {
      const siloedNullifier = await siloNullifier(contractAddress, nullifier);
      const nullifierIndex = randomDataInBlock(123n);

      // Override the mock to return a nullifier index (indicating the note has been nullified)
      aztecNode.findLeavesIndexes.mockImplementation((_queryBlockNum, treeId, leaves) => {
        return Promise.resolve(
          leaves.map(leaf =>
            treeId == MerkleTreeId.NULLIFIER_TREE && leaf.equals(siloedNullifier) ? nullifierIndex : undefined,
          ),
        );
      });

      await noteService.validateAndStoreNotes([buildRequest()], recipient.address, defaultTxEffectsMap());

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

    function defaultTxEffectsMap() {
      return new Map([[txHash.toString(), indexedTxEffect]]);
    }
  });
});
