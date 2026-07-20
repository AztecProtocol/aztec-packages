import { NoteDao } from '@aztec/stdlib/note';

import { StoredNote } from './stored_note.js';

describe('StoredNote', () => {
  describe('serialization', () => {
    it('round-trips through a buffer with scopes', async () => {
      const noteDao = await NoteDao.random();
      const stored = new StoredNote(noteDao, new Set(['0xscope1', '0xscope2']));

      const restored = StoredNote.fromBuffer(stored.toBuffer());

      expect(restored.noteDao.equals(noteDao)).toBe(true);
      expect([...restored.scopes].sort()).toEqual(['0xscope1', '0xscope2']);
    });

    it('round-trips a note with no scopes', async () => {
      const noteDao = await NoteDao.random();
      const stored = new StoredNote(noteDao, new Set());

      const restored = StoredNote.fromBuffer(stored.toBuffer());

      expect(restored.noteDao.equals(noteDao)).toBe(true);
      expect(restored.scopes.size).toBe(0);
    });

    it('round-trips a note carrying many scopes', async () => {
      const noteDao = await NoteDao.random();
      const scopes = new Set(Array.from({ length: 100 }, (_, i) => `0xscope-${i}`));
      const stored = new StoredNote(noteDao, scopes);

      const restored = StoredNote.fromBuffer(stored.toBuffer());

      expect(restored.scopes).toEqual(scopes);
    });
  });

  describe('addScope', () => {
    it('adds a scope to an empty set', async () => {
      const stored = new StoredNote(await NoteDao.random(), new Set());

      stored.addScope('0xnew-scope');

      expect([...stored.scopes]).toEqual(['0xnew-scope']);
    });

    it('adds a scope to an existing set', async () => {
      const stored = new StoredNote(await NoteDao.random(), new Set(['0xexisting']));

      stored.addScope('0xnew-scope');

      expect([...stored.scopes].sort()).toEqual(['0xexisting', '0xnew-scope']);
    });

    it('is idempotent when the same scope is added twice', async () => {
      const stored = new StoredNote(await NoteDao.random(), new Set());

      stored.addScope('0xscope');
      stored.addScope('0xscope');

      expect([...stored.scopes]).toEqual(['0xscope']);
    });
  });
});
