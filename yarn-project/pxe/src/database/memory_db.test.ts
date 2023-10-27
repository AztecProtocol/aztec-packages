import { AztecAddress, Fr } from '@aztec/circuits.js';
import { ExtendedNote, randomExtendedNote } from '@aztec/types';

import { MemoryDB } from './memory_db.js';

describe('Memory DB', () => {
  let db: MemoryDB;

  beforeEach(() => {
    db = new MemoryDB();
  });

  describe('NoteDao', () => {
    const contractAddress = AztecAddress.random();
    const storageSlot = Fr.random();

    const createNote = (attributes: Partial<ExtendedNote> = {}, sameStorage = true) =>
      randomExtendedNote({
        ...attributes,
        contractAddress: sameStorage ? contractAddress : AztecAddress.random(),
        storageSlot: sameStorage ? storageSlot : Fr.random(),
      });

    const createNotes = (numberOfNotes: number, sameStorage = true) =>
      Array(numberOfNotes)
        .fill(0)
        .map(() => createNote({}, sameStorage));

    it('should add and get notes', async () => {
      const notes = createNotes(3, false);
      for (let i = 0; i < notes.length; ++i) {
        await db.addNote(notes[i]);
      }

      for (let i = 0; i < notes.length; ++i) {
        const result = await db.getNotes({
          contractAddress: notes[i].contractAddress,
          storageSlot: notes[i].storageSlot,
        });
        expect(result).toEqual([notes[i]]);
      }
    });

    it('should batch add notes', async () => {
      const notes = createNotes(3, false);
      await db.addNote(notes);

      for (let i = 0; i < notes.length; ++i) {
        const result = await db.getNotes({
          contractAddress: notes[i].contractAddress,
          storageSlot: notes[i].storageSlot,
        });
        expect(result).toEqual([notes[i]]);
      }
    });

    it('should get all notes with the same contract storage slot', async () => {
      const notes = createNotes(3);
      await db.addNote(notes);

      const result = await db.getNotes({ contractAddress, storageSlot });
      expect(result.length).toBe(notes.length);
      expect(result).toEqual(expect.objectContaining(notes));
    });
  });
});
