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

  beforeEach(async () => {
    const store = await openTmpStore('note_data_provider_test');
    noteDataProvider = await NoteDataProvider.create(store);
  });

  const filteringTests: [() => Promise<NotesFilter>, () => Promise<NoteDao[]>][] = [
    [() => Promise.resolve({}), () => Promise.resolve(notes)],

    [
      () => Promise.resolve({ contractAddress: contractAddresses[0] }),
      () => Promise.resolve(notes.filter(note => note.contractAddress.equals(contractAddresses[0]))),
    ],
    [async () => ({ contractAddress: await AztecAddress.random() }), () => Promise.resolve([])],

    [
      () => Promise.resolve({ storageSlot: storageSlots[0] }),
      () => Promise.resolve(notes.filter(note => note.storageSlot.equals(storageSlots[0]))),
    ],
    [() => Promise.resolve({ storageSlot: Fr.random() }), () => Promise.resolve([])],

    [() => Promise.resolve({ txHash: notes[0].txHash }), () => Promise.resolve([notes[0]])],
    [() => Promise.resolve({ txHash: randomTxHash() }), () => Promise.resolve([])],

    [
      () => Promise.resolve({ recipient: recipients[0] }),
      () => Promise.resolve(notes.filter(note => note.recipient.equals(recipients[0]))),
    ],

    [
      () => Promise.resolve({ contractAddress: contractAddresses[0], storageSlot: storageSlots[0] }),
      () =>
        Promise.resolve(
          notes.filter(
            note => note.contractAddress.equals(contractAddresses[0]) && note.storageSlot.equals(storageSlots[0]),
          ),
        ),
    ],
    [
      () => Promise.resolve({ contractAddress: contractAddresses[0], storageSlot: storageSlots[1] }),
      () => Promise.resolve([]),
    ],
  ];

  beforeEach(async () => {
    recipients = await timesParallel(2, () => AztecAddress.random());
    contractAddresses = await timesParallel(2, () => AztecAddress.random());
    storageSlots = times(2, () => Fr.random());

    notes = await timesParallel(10, i => {
      return NoteDao.random({
        contractAddress: contractAddresses[i % contractAddresses.length],
        storageSlot: storageSlots[i % storageSlots.length],
        recipient: recipients[i % recipients.length],
        index: BigInt(i),
        l2BlockNumber: i,
      });
    });

    for (const recipient of recipients) {
      await noteDataProvider.addScope(recipient);
    }
  });

  it.each(filteringTests)('stores notes and retrieves notes', async (getFilter, getExpected) => {
    await noteDataProvider.addNotes(notes);
    const returnedNotes = await noteDataProvider.getNotes(await getFilter());
    const expected = await getExpected();
    expect(returnedNotes.sort()).toEqual(expected.sort());
  });

  it.each(filteringTests)('retrieves nullified notes', async (getFilter, getExpected) => {
    await noteDataProvider.addNotes(notes);

    // Nullify all notes and use the same filter as other test cases
    for (const recipient of recipients) {
      const notesToNullify = notes.filter(note => note.recipient.equals(recipient));
      const nullifiers = notesToNullify.map(note => ({
        data: note.siloedNullifier,
        l2BlockNumber: note.l2BlockNumber,
        l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
      }));
      await expect(noteDataProvider.removeNullifiedNotes(nullifiers, recipient)).resolves.toEqual(notesToNullify);
    }
    const filter = await getFilter();
    const returnedNotes = await noteDataProvider.getNotes({ ...filter, status: NoteStatus.ACTIVE_OR_NULLIFIED });
    const expected = await getExpected();
    expect(returnedNotes.sort()).toEqual(expected.sort());
  });

  it('skips nullified notes by default or when requesting active', async () => {
    await noteDataProvider.addNotes(notes);
    const notesToNullify = notes.filter(note => note.recipient.equals(recipients[0]));
    const nullifiers = notesToNullify.map(note => ({
      data: note.siloedNullifier,
      l2BlockNumber: note.l2BlockNumber,
      l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
    }));
    await expect(noteDataProvider.removeNullifiedNotes(nullifiers, notesToNullify[0].recipient)).resolves.toEqual(
      notesToNullify,
    );

    const actualNotesWithDefault = await noteDataProvider.getNotes({});
    const actualNotesWithActive = await noteDataProvider.getNotes({ status: NoteStatus.ACTIVE });

    expect(actualNotesWithDefault).toEqual(actualNotesWithActive);
    expect(actualNotesWithActive).toEqual(notes.filter(note => !notesToNullify.includes(note)));
  });

  it('handles note unnullification', async () => {
    await noteDataProvider.addNotes(notes);

    const notesToNullify = notes.filter(note => note.recipient.equals(recipients[0]));
    const nullifiers = notesToNullify.map(note => ({
      data: note.siloedNullifier,
      l2BlockNumber: 99,
      l2BlockHash: L2BlockHash.random(),
    }));
    await expect(noteDataProvider.removeNullifiedNotes(nullifiers, notesToNullify[0].recipient)).resolves.toEqual(
      notesToNullify,
    );
    await expect(noteDataProvider.unnullifyNotesAfter(98)).resolves.toEqual(undefined);

    const result = await noteDataProvider.getNotes({ status: NoteStatus.ACTIVE, recipient: recipients[0] });

    expect(result.sort()).toEqual([...notesToNullify].sort());
  });

  it('returns active and nullified notes when requesting either', async () => {
    await noteDataProvider.addNotes(notes);

    const notesToNullify = notes.filter(note => note.recipient.equals(recipients[0]));
    const nullifiers = notesToNullify.map(note => ({
      data: note.siloedNullifier,
      l2BlockNumber: note.l2BlockNumber,
      l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
    }));
    await expect(noteDataProvider.removeNullifiedNotes(nullifiers, notesToNullify[0].recipient)).resolves.toEqual(
      notesToNullify,
    );

    const result = await noteDataProvider.getNotes({
      status: NoteStatus.ACTIVE_OR_NULLIFIED,
    });

    // We have to compare the sorted arrays since the database does not return the same order as when originally
    // inserted combining active and nullified results.
    expect(result.sort()).toEqual([...notes].sort());
  });

  it('stores notes and retrieves notes with siloed account', async () => {
    await noteDataProvider.addNotes(notes.slice(0, 5), recipients[0]);

    await noteDataProvider.addNotes(notes.slice(5), recipients[1]);

    const recipient0Notes = await noteDataProvider.getNotes({
      scopes: [recipients[0]],
    });

    expect(recipient0Notes.sort()).toEqual(notes.slice(0, 5).sort());

    const recipient1Notes = await noteDataProvider.getNotes({
      scopes: [recipients[1]],
    });

    expect(recipient1Notes.sort()).toEqual(notes.slice(5).sort());

    const bothRecipientNotes = await noteDataProvider.getNotes({
      scopes: [recipients[0], recipients[1]],
    });

    expect(bothRecipientNotes.sort()).toEqual(notes.sort());
  });

  it('a nullified note removes notes from all accounts in the pxe', async () => {
    await noteDataProvider.addNotes([notes[0]], recipients[0]);
    await noteDataProvider.addNotes([notes[0]], recipients[1]);

    await expect(
      noteDataProvider.getNotes({
        scopes: [recipients[0]],
      }),
    ).resolves.toEqual([notes[0]]);
    await expect(
      noteDataProvider.getNotes({
        scopes: [recipients[1]],
      }),
    ).resolves.toEqual([notes[0]]);
    await expect(
      noteDataProvider.removeNullifiedNotes(
        [
          {
            data: notes[0].siloedNullifier,
            l2BlockHash: L2BlockHash.fromString(notes[0].l2BlockHash),
            l2BlockNumber: notes[0].l2BlockNumber,
          },
        ],
        recipients[0],
      ),
    ).resolves.toEqual([notes[0]]);

    await expect(
      noteDataProvider.getNotes({
        scopes: [recipients[0]],
      }),
    ).resolves.toEqual([]);
    await expect(
      noteDataProvider.getNotes({
        scopes: [recipients[1]],
      }),
    ).resolves.toEqual([]);
  });

  it('removes notes after a given block', async () => {
    await noteDataProvider.addNotes(notes, recipients[0]);

    await noteDataProvider.removeNotesAfter(5);
    const result = await noteDataProvider.getNotes({ scopes: [recipients[0]] });
    expect(new Set(result)).toEqual(new Set(notes.slice(0, 6)));
  });
});
