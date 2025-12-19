import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { randomDataInBlock } from '@aztec/stdlib/block';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { AnchorBlockDataProvider, NoteDataProvider } from '../storage/index.js';
import { NoteSynchronizer } from './note_synchronizer.js';

describe('NoteSynchronizer', () => {
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let noteDataProvider: NoteDataProvider;
  let keyStore: KeyStore;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  const syncedBlockNumber = 42;
  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  let noteSynchronizer: NoteSynchronizer;

  beforeEach(async () => {
    const store = await openTmpStore('test');
    keyStore = new KeyStore(store);
    noteDataProvider = await NoteDataProvider.create(store);
    noteDataProvider = await NoteDataProvider.create(store);
    aztecNode = mock<AztecNode>();
    anchorBlockDataProvider = new AnchorBlockDataProvider(store);
    await anchorBlockDataProvider.setHeader(
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(syncedBlockNumber) }),
      }),
    );

    contractAddress = await AztecAddress.random();

    // Check that there are no notes in the database
    const notes = await noteDataProvider.getNotes({ contractAddress });
    expect(notes).toHaveLength(0);

    // Check that the expected number of accounts is present
    const accounts = await keyStore.getAccounts();
    expect(accounts).toHaveLength(0);

    recipient = await keyStore.addAccount(new Fr(69), Fr.random());

    noteSynchronizer = new NoteSynchronizer(noteDataProvider, aztecNode, anchorBlockDataProvider);
  });

  it('should remove notes that have been nullified', async () => {
    // Set up initial state with a note
    const noteDao = await NoteDao.random({ contractAddress });

    // Spy on the noteDataProvider.applyNullifiers to later on have additional guarantee that we really removed
    // the note.
    jest.spyOn(noteDataProvider, 'applyNullifiers');

    // Add the note to storage
    await noteDataProvider.addNotes([noteDao], recipient.address);

    // Set up the nullifier in the merkle tree
    const nullifierIndex = randomDataInBlock(123n);
    aztecNode.findLeavesIndexes.mockResolvedValue([nullifierIndex]);

    // Call the function under test
    await noteSynchronizer.syncNoteNullifiers(contractAddress);

    // Verify the note was removed by checking storage
    const remainingNotes = await noteDataProvider.getNotes({
      contractAddress,
      status: NoteStatus.ACTIVE,
      scopes: [recipient.address],
    });
    expect(remainingNotes).toHaveLength(0);

    // Verify the note was removed by checking the spy
    expect(noteDataProvider.applyNullifiers).toHaveBeenCalledTimes(1);
  });

  it('should keep notes that have not been nullified', async () => {
    // Set up initial state with a note
    const noteDao = await NoteDao.random({ contractAddress });

    // Add the note to storage
    await noteDataProvider.addNotes([noteDao], recipient.address);

    // No nullifier found in merkle tree
    aztecNode.findLeavesIndexes.mockResolvedValue([undefined]);

    // Call the function under test
    await noteSynchronizer.syncNoteNullifiers(contractAddress);

    // Verify note still exists
    const remainingNotes = await noteDataProvider.getNotes({
      contractAddress,
      status: NoteStatus.ACTIVE,
      scopes: [recipient.address],
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

    // Add the note to storage
    await noteDataProvider.addNotes([noteDao], recipient.address);

    // Mock nullifier to only exist after synced block
    aztecNode.findLeavesIndexes.mockImplementation(blockNum => {
      if (typeof blockNum === 'number' && blockNum > syncedBlockNumber) {
        return Promise.resolve([randomDataInBlock(0n)]);
      }
      return Promise.resolve([undefined]);
    });

    // Call the function under test
    await noteSynchronizer.syncNoteNullifiers(contractAddress);

    // Verify note still exists
    const remainingNotes = await noteDataProvider.getNotes({
      contractAddress,
      status: NoteStatus.ACTIVE,
      scopes: [recipient.address],
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
    await noteSynchronizer.syncNoteNullifiers(contractAddress);

    // Verify applyNullifiers was called once for all accounts
    expect(getNotesSpy).toHaveBeenCalledTimes(1);

    // Verify getNotes was called with the correct contract address
    expect(getNotesSpy).toHaveBeenCalledWith(expect.objectContaining({ contractAddress }));
  });
});
