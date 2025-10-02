import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { NoteStatus, type NotesFilter } from '@aztec/stdlib/note';
import { randomTxHash } from '@aztec/stdlib/testing';

import times from 'lodash.times';

import { NoteDao } from './note_dao.js';
import { NoteDataProvider } from './note_data_provider.js';

describe('NoteDataProvider', () => {
  let noteDataProvider: NoteDataProvider;
  let recipients: AztecAddress[];
  let contractAddresses: AztecAddress[];
  let storageSlots: Fr[];
  let notes: NoteDao[];

  // Helper: get notes for all contracts given a filter (without specifying contract)
  type NotesFilterWithoutContract = Omit<NotesFilter, 'contractAddress'>;
  async function getNotesForAllContracts(filter: NotesFilterWithoutContract) {
    const notesArrays = await Promise.all(
      contractAddresses.map(contractAddress => noteDataProvider.getNotes({ ...filter, contractAddress })),
    );
    return notesArrays.flat();
  }

  // --- Before Each ---

  // Initialize fresh NoteDataProvider before each test
  beforeEach(async () => {
    const store = await openTmpStore('note_data_provider_test');
    noteDataProvider = await NoteDataProvider.create(store);
  });

  /**
   * Sets up test data before each test case.
   *
   * This creates a predictable dataset of 10 notes distributed across:
   * - 2 recipients (users who can receive notes)
   * - 2 contract addresses (smart contracts that manage notes)
   * - 2 storage slots (locations within contracts where notes are stored)
   *
   * The notes are distributed in a round-robin fashion using modulo arithmetic,
   * ensuring each combination of (contract, slot, recipient) has predictable coverage.
   *
   * Data Distribution Pattern:
   * - Notes 0,2,4,6,8: contract[0], slot[0], recipient[0], blocks 0,2,4,6,8
   * - Notes 1,3,5,7,9: contract[1], slot[1], recipient[1], blocks 1,3,5,7,9
   *
   * This setup enables comprehensive testing of filtering combinations:
   * - Single dimension filters (by contract, slot, or recipient)
   * - Multi-dimension filters (e.g., contract AND slot)
   * - Edge cases (non-existent values should return empty results)
   */
  beforeEach(async () => {
    recipients = await timesParallel(2, () => AztecAddress.random());
    contractAddresses = await timesParallel(2, () => AztecAddress.random());
    storageSlots = times(2, () => Fr.random());

    // Create 10 notes with deterministic distribution across the above entities
    // Uses modulo (%) to cycle through arrays, ensuring even distribution
    notes = await timesParallel(10, i => {
      return NoteDao.random({
        contractAddress: contractAddresses[i % contractAddresses.length], // Alternates between 2 contracts
        storageSlot: storageSlots[i % storageSlots.length], // Alternates between 2 slots
        recipient: recipients[i % recipients.length], // Alternates between 2 recipients
        index: BigInt(i), // Sequential index: 0,1,2,...,9
        l2BlockNumber: i, // Sequential block: 0,1,2,...,9
      });
    });

    // Register each recipient with the note data provider so it can track their notes
    for (const recipient of recipients) {
      await noteDataProvider.addScope(recipient);
    }
  });

  // --- Filtering Tests Definition ---

  /**
   * Defines an array of tests that filter notes in different ways.
   * Each test is a tuple of two functions:
   * 1. A function that returns a NotesFilter object (the filter to apply)
   * 2. A function that returns the expected array of NoteDao objects that should be returned by getNotes(...) when
   *    called with the filter from (1).
   * The tests will add a predefined set of notes to the database, then call getNotes(...) with the filter from (1)
   * and check that the returned notes match the expected notes from (2).
   */
  const filteringTests: [() => Promise<NotesFilter>, () => Promise<NoteDao[]>][] = [
    // Test 1: Filter by contract address only - should return all notes for that contract
    [
      () => Promise.resolve({ contractAddress: contractAddresses[0] }),
      () => Promise.resolve(notes.filter(note => note.contractAddress.equals(contractAddresses[0]))),
    ],
    // Test 2: Filter by non-existent contract address - should return empty array
    [async () => ({ contractAddress: await AztecAddress.random() }), () => Promise.resolve([])],

    // Test 3: Filter by contract + existing storage slot - should return matching notes
    [
      () => Promise.resolve({ contractAddress: contractAddresses[0], storageSlot: storageSlots[0] }),
      () =>
        Promise.resolve(
          notes.filter(
            note => note.storageSlot.equals(storageSlots[0]) && note.contractAddress.equals(contractAddresses[0]),
          ),
        ),
    ],
    // Test 4: Filter by contract + non-existent storage slot - should return empty array
    [
      () => Promise.resolve({ contractAddress: contractAddresses[0], storageSlot: Fr.random() }),
      () => Promise.resolve([]),
    ],

    // Test 5: Filter by contract + existing transaction hash - should return single matching note
    [
      () => Promise.resolve({ contractAddress: contractAddresses[0], txHash: notes[0].txHash }),
      () => Promise.resolve([notes[0]]),
    ],
    // Test 6: Filter by contract + non-existent transaction hash - should return empty array
    [
      () => Promise.resolve({ contractAddress: contractAddresses[0], txHash: randomTxHash() }),
      () => Promise.resolve([]),
    ],

    // Test 7: Filter by contract + existing recipient - should return notes for that recipient
    [
      () => Promise.resolve({ contractAddress: contractAddresses[0], recipient: recipients[0] }),
      () =>
        Promise.resolve(
          notes.filter(
            note => note.recipient.equals(recipients[0]) && note.contractAddress.equals(contractAddresses[0]),
          ),
        ),
    ],
    // Test 8: Filter by contract + second storage slot (should be empty due to data distribution)
    [
      () => Promise.resolve({ contractAddress: contractAddresses[0], storageSlot: storageSlots[1] }),
      () => Promise.resolve([]),
    ],
  ];

  // --- Filtering Tests ---
  describe('Filtering notes', () => {
    /**
     * Basic filtering functionality test.
     *
     * Tests that the NoteDataProvider can correctly store and retrieve notes using various filters:
     * - By contract address only
     * - By contract + storage slot combinations
     * - By contract + transaction hash
     * - By contract + recipient
     * - Edge cases with non-existent values (should return empty arrays)
     */
    it.each(filteringTests)('stores notes and retrieves notes', async (getFilter, getExpected) => {
      await noteDataProvider.addNotes(notes, AztecAddress.ZERO);
      const returnedNotes = await noteDataProvider.getNotes(await getFilter());
      const expected = await getExpected();
      expect(returnedNotes.sort()).toEqual(expected.sort());
    });

    /**
     * Nullified notes filtering test.
     *
     * Tests that the same filtering logic works correctly for nullified (spent) notes.
     * This test:
     * 1. Adds all notes to the provider
     * 2. Nullifies ALL notes (marks them as spent)
     * 3. Applies the same filters but with ACTIVE_OR_NULLIFIED status
     * 4. Verifies that nullified notes are still returned when explicitly requested
     */
    it.each(filteringTests)('retrieves nullified notes', async (getFilter, getExpected) => {
      await noteDataProvider.addNotes(notes, AztecAddress.ZERO);

      const nullifiers = notes.map(note => ({
        data: note.siloedNullifier,
        l2BlockNumber: note.l2BlockNumber,
        l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
      }));
      await expect(noteDataProvider.applyNullifiers(nullifiers)).resolves.toEqual(notes);
      const filter = await getFilter();
      const returnedNotes = await noteDataProvider.getNotes({ ...filter, status: NoteStatus.ACTIVE_OR_NULLIFIED });
      const expected = await getExpected();
      expect(returnedNotes.sort()).toEqual(expected.sort());
    });
  });

  // --- Nullification / Status Tests ---

  describe('Note nullification and status handling', () => {
    /**
     * Default note status behavior test.
     *
     * Tests that nullified (spent) notes are excluded by default from query results.
     * This test:
     * 1. Adds all notes
     * 2. Nullifies notes belonging to the first recipient (half the notes)
     * 3. Queries notes with no status specified (default behavior)
     * 4. Queries notes with explicit ACTIVE status
     * 5. Verifies both queries return the same results (only active notes)
     */
    it('skips nullified notes by default or when requesting active', async () => {
      await noteDataProvider.addNotes(notes, AztecAddress.ZERO);
      const notesToNullify = notes.filter(note => note.recipient.equals(recipients[0]));
      const nullifiers = notesToNullify.map(note => ({
        data: note.siloedNullifier,
        l2BlockNumber: note.l2BlockNumber,
        l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
      }));
      await expect(noteDataProvider.applyNullifiers(nullifiers)).resolves.toEqual(notesToNullify);

      const actualNotesWithDefault = await getNotesForAllContracts({});
      const actualNotesWithActive = await getNotesForAllContracts({ status: NoteStatus.ACTIVE });

      expect(actualNotesWithDefault).toEqual(actualNotesWithActive);
      expect(actualNotesWithActive).toEqual(notes.filter(note => !notesToNullify.includes(note)));
    });

    /**
     * Note restore test.
     *
     * Tests the ability to restore (un-nullify) notes - making previously spent notes active again.
     * This scenario occurs during blockchain reorganizations when transactions get reverted.
     * This test:
     * 1. Adds all notes
     * 2. Nullifies notes at block 99 (simulating they were spent in a transaction)
     * 3. Calls rewindNullifiersAfterBlock(98) to revert nullifications after block 98
     * 4. Verifies the previously nullified notes are now active again
     */
    it('handles note unnullification', async () => {
      await noteDataProvider.addNotes(notes, AztecAddress.ZERO);

      const notesToNullify = notes.filter(note => note.recipient.equals(recipients[0]));
      const nullifiers = notesToNullify.map(note => ({
        data: note.siloedNullifier,
        l2BlockNumber: 99,
        l2BlockHash: L2BlockHash.random(),
      }));
      await expect(noteDataProvider.applyNullifiers(nullifiers)).resolves.toEqual(notesToNullify);
      await expect(noteDataProvider.rollbackNotesAndNullifiers(98, 99)).resolves.toEqual(undefined);

      const result = await getNotesForAllContracts({ status: NoteStatus.ACTIVE, recipient: recipients[0] });

      expect(result.sort()).toEqual([...notesToNullify].sort());
    });

    /**
     * Combined active and nullified notes query test.
     *
     * Tests that when explicitly requesting ACTIVE_OR_NULLIFIED status, both
     * active and nullified notes are returned in the results.
     * This test:
     * 1. Adds all notes
     * 2. Nullifies half the notes (recipient[0]'s notes)
     * 3. Queries with ACTIVE_OR_NULLIFIED status
     * 4. Verifies ALL original notes are returned (both active and nullified)
     *
     * Note: Results are sorted because the database doesn't guarantee order when
     * combining active and nullified results.
     */
    it('returns active and nullified notes when requesting either', async () => {
      await noteDataProvider.addNotes(notes, AztecAddress.ZERO);

      const notesToNullify = notes.filter(note => note.recipient.equals(recipients[0]));
      const nullifiers = notesToNullify.map(note => ({
        data: note.siloedNullifier,
        l2BlockNumber: note.l2BlockNumber,
        l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
      }));
      await expect(noteDataProvider.applyNullifiers(nullifiers)).resolves.toEqual(notesToNullify);

      const result = await getNotesForAllContracts({
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });

      expect(result.sort()).toEqual([...notes].sort());
    });

    // --- Edge cases ---
    describe('Note nullification edge cases', () => {
      /**
       * Non-existent nullifier rejection test.
       *
       * Tests that attempting to nullify notes that don't exist throws an error
       * and leaves existing notes unaffected.
       * This test:
       * 1. Adds all test notes to the provider
       * 2. Attempts to nullify a fake/non-existent nullifier
       * 3. Verifies the operation throws a "Nullifier not found" error
       * 4. Confirms all original notes remain unchanged
       */
      it('throws when attempting to nullify notes that do not exist', async () => {
        await noteDataProvider.addNotes(notes, AztecAddress.ZERO);

        const fakeNullifier = {
          data: Fr.random(),
          l2BlockNumber: 999,
          l2BlockHash: L2BlockHash.random(),
        };

        await expect(noteDataProvider.applyNullifiers([fakeNullifier])).rejects.toThrow(/Nullifier not found/);

        // verify existing notes are unaffected
        const allNotes = await getNotesForAllContracts({});
        expect(allNotes.sort()).toEqual(notes.sort());
      });

      /**
       * Mixed nullifiers atomic operation test.
       *
       * Tests that nullification operations are atomic - if any nullifier in a batch
       * doesn't exist, the entire operation fails and no notes are removed.
       * This test:
       * 1. Adds all test notes to the provider
       * 2. Creates a batch with one valid nullifier (for notes[0]) and one fake nullifier
       * 3. Attempts to nullify both in a single operation
       * 4. Verifies the operation throws a "Nullifier not found" error
       * 5. Confirms NO notes were removed (including the valid one)
       */
      it('throws when some nullifiers do not exist even if others are valid', async () => {
        await noteDataProvider.addNotes(notes, AztecAddress.ZERO);

        const realNote = notes[0];
        const realNullifier = {
          data: realNote.siloedNullifier,
          l2BlockNumber: realNote.l2BlockNumber,
          l2BlockHash: L2BlockHash.fromString(realNote.l2BlockHash),
        };

        const fakeNullifier = {
          data: Fr.random(),
          l2BlockNumber: 999,
          l2BlockHash: L2BlockHash.random(),
        };

        const mixedNullifiers = [realNullifier, fakeNullifier];

        await expect(noteDataProvider.applyNullifiers(mixedNullifiers)).rejects.toThrow(/Nullifier not found/);

        const remainingNotes = await getNotesForAllContracts({});
        expect(remainingNotes.sort()).toEqual(notes.sort());
      });
    });
  });

  // --- Account Scoping Tests ---

  describe('Account scoping and Account-scoped note storage', () => {
    /**
     * Account-scoped note storage and retrieval test.
     *
     * Tests that notes can be stored and retrieved per specific account (recipient),
     * implementing proper privacy isolation between users.
     * This test:
     * 1. Stores first 5 notes under recipient[0]'s scope
     * 2. Stores remaining 5 notes under recipient[1]'s scope
     * 3. Queries notes scoped to recipient[0] - should get only first 5 notes
     * 4. Queries notes scoped to recipient[1] - should get only last 5 notes
     * 5. Queries notes scoped to both recipients - should get all 10 notes
     */
    it('stores notes and retrieves notes with siloed account', async () => {
      await noteDataProvider.addNotes(notes.slice(0, 5), recipients[0]);
      await noteDataProvider.addNotes(notes.slice(5), recipients[1]);

      const recipient0Notes = await getNotesForAllContracts({
        scopes: [recipients[0]],
      });

      expect(recipient0Notes.sort()).toEqual(notes.slice(0, 5).sort());

      const recipient1Notes = await getNotesForAllContracts({
        scopes: [recipients[1]],
      });

      expect(recipient1Notes.sort()).toEqual(notes.slice(5).sort());

      const bothRecipientNotes = await getNotesForAllContracts({
        scopes: [recipients[0], recipients[1]],
      });

      expect(bothRecipientNotes.sort()).toEqual(notes.sort());
    });

    /**
     * Global nullification behavior test.
     *
     * Tests that when a note is nullified (spent), it's removed from ALL accounts
     * that were tracking it, not just the account that spent it.
     * This test:
     * 1. Adds the same note to both recipient[0] and recipient[1] scopes
     * 2. Verifies both recipients can see the note initially
     * 3. Nullifies the note (simulating it being spent by someone)
     * 4. Verifies the note is removed from BOTH recipients' views
     */
    it('a nullified note removes notes from all accounts in the pxe', async () => {
      await noteDataProvider.addNotes([notes[0]], recipients[0]);
      await noteDataProvider.addNotes([notes[0]], recipients[1]);

      await expect(
        getNotesForAllContracts({
          scopes: [recipients[0]],
        }),
      ).resolves.toEqual([notes[0]]);
      await expect(
        getNotesForAllContracts({
          scopes: [recipients[1]],
        }),
      ).resolves.toEqual([notes[0]]);
      await expect(
        noteDataProvider.applyNullifiers([
          {
            data: notes[0].siloedNullifier,
            l2BlockHash: L2BlockHash.fromString(notes[0].l2BlockHash),
            l2BlockNumber: notes[0].l2BlockNumber,
          },
        ]),
      ).resolves.toEqual([notes[0]]);

      await expect(
        getNotesForAllContracts({
          scopes: [recipients[0]],
        }),
      ).resolves.toEqual([]);
      await expect(
        getNotesForAllContracts({
          scopes: [recipients[1]],
        }),
      ).resolves.toEqual([]);
    });
  });

  // --- Block-based Note Removal Tests ---

  describe('Block-based note removal', () => {
    /**
     * Synchronization and reorganization test.
     *
     * Tests the ability to handle blockchain reorganizations by syncing notes and nullifiers
     * after a specific block number. This test:
     * 1. Adds all 10 notes (created in blocks 0-9) under recipient[0]
     * 2. Nullifies some notes at higher block numbers to simulate spending
     * 3. Calls syncNotesAndNullifiers(5) to handle a reorg at block 5
     * 4. Verifies that notes from blocks 6-9 are removed and nullifications after block 5 are restored
     *
     */
    it('syncs notes and nullifiers after a given block', async () => {
      await noteDataProvider.addNotes(notes, recipients[0]);

      // Nullify some notes at block 7 to simulate spending
      const notesToNullify = notes.slice(0, 3);
      const nullifiers = notesToNullify.map(note => ({
        data: note.siloedNullifier,
        l2BlockNumber: 7,
        l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
      }));
      await noteDataProvider.applyNullifiers(nullifiers);

      // Sync after block 5 - should restore nullified notes and remove notes from blocks 6-9
      await noteDataProvider.rollbackNotesAndNullifiers(5, 9);

      const result = await getNotesForAllContracts({ scopes: [recipients[0]] });

      // Should have notes 0-5 (blocks 0-5) all active, including the previously nullified ones
      expect(new Set(result)).toEqual(new Set(notes.slice(0, 6)));
    });
  });
});
