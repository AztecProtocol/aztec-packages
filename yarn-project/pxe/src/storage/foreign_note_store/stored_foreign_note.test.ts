import { Fr } from '@aztec/foundation/curves/bn254';
import { NoteDao } from '@aztec/stdlib/note';

import { StoredForeignNote } from './stored_foreign_note.js';

describe('StoredForeignNote', () => {
  describe('construction', () => {
    it('creates a StoredForeignNote with default values', async () => {
      const noteDao = await NoteDao.random();
      const siloedNoteHash = Fr.random();
      const storedNote = new StoredForeignNote(noteDao, siloedNoteHash, new Set());

      expect(storedNote.noteDao).toBe(noteDao);
      expect(storedNote.siloedNoteHash).toBe(siloedNoteHash);
      expect(storedNote.scopes.size).toBe(0);
    });

    it('creates a StoredForeignNote with scopes', async () => {
      const noteDao = await NoteDao.random();
      const siloedNoteHash = Fr.random();
      const scopes = new Set(['scope1', 'scope2']);
      const storedNote = new StoredForeignNote(noteDao, siloedNoteHash, scopes);

      expect(storedNote.scopes).toEqual(scopes);
    });
  });

  describe('serialization', () => {
    it('note with no scopes', async () => {
      const noteDao = await NoteDao.random();
      const siloedNoteHash = Fr.random();
      const original = new StoredForeignNote(noteDao, siloedNoteHash, new Set());

      const buffer = original.toBuffer();
      const restored = StoredForeignNote.fromBuffer(buffer);

      expect(restored.noteDao.equals(original.noteDao)).toBe(true);
      expect(restored.siloedNoteHash.equals(original.siloedNoteHash)).toBe(true);
      expect(restored.scopes.size).toBe(0);
    });

    it('note with scopes', async () => {
      const noteDao = await NoteDao.random();
      const siloedNoteHash = Fr.random();
      const scopes = new Set(['scope1', 'scope2', 'scope3']);
      const original = new StoredForeignNote(noteDao, siloedNoteHash, scopes);

      const buffer = original.toBuffer();
      const restored = StoredForeignNote.fromBuffer(buffer);

      expect(restored.noteDao.equals(original.noteDao)).toBe(true);
      expect(restored.siloedNoteHash.equals(original.siloedNoteHash)).toBe(true);
      expect(restored.scopes).toEqual(scopes);
    });

    it('note with many scopes', async () => {
      const noteDao = await NoteDao.random();
      const siloedNoteHash = Fr.random();
      const scopes = new Set(Array.from({ length: 100 }, (_, i) => `scope-${i}`));
      const original = new StoredForeignNote(noteDao, siloedNoteHash, scopes);

      const buffer = original.toBuffer();
      const restored = StoredForeignNote.fromBuffer(buffer);

      expect(restored.scopes).toEqual(scopes);
    });

    it('preserves siloedNoteHash through serialization', async () => {
      const noteDao = await NoteDao.random();
      const siloedNoteHash = Fr.random();
      const original = new StoredForeignNote(noteDao, siloedNoteHash, new Set(['scope1']));

      const buffer = original.toBuffer();
      const restored = StoredForeignNote.fromBuffer(buffer);

      expect(restored.siloedNoteHash.toBigInt()).toBe(siloedNoteHash.toBigInt());
    });
  });

  describe('addScope', () => {
    it('adds a scope to an empty set', async () => {
      const storedNote = new StoredForeignNote(await NoteDao.random(), Fr.random(), new Set());

      storedNote.addScope('new-scope');

      expect(storedNote.scopes.has('new-scope')).toBe(true);
      expect(storedNote.scopes.size).toBe(1);
    });

    it('adds a scope to an existing set', async () => {
      const storedNote = new StoredForeignNote(await NoteDao.random(), Fr.random(), new Set(['existing']));

      storedNote.addScope('new-scope');

      expect(storedNote.scopes.has('existing')).toBe(true);
      expect(storedNote.scopes.has('new-scope')).toBe(true);
      expect(storedNote.scopes.size).toBe(2);
    });

    it('is idempotent when adding the same scope twice', async () => {
      const storedNote = new StoredForeignNote(await NoteDao.random(), Fr.random(), new Set());

      storedNote.addScope('scope');
      storedNote.addScope('scope');

      expect(storedNote.scopes.size).toBe(1);
    });

    it('preserves scopes through serialization after adding', async () => {
      const storedNote = new StoredForeignNote(await NoteDao.random(), Fr.random(), new Set(['scope1']));

      storedNote.addScope('scope2');

      const restored = StoredForeignNote.fromBuffer(storedNote.toBuffer());

      expect(restored.scopes.has('scope1')).toBe(true);
      expect(restored.scopes.has('scope2')).toBe(true);
      expect(restored.scopes.size).toBe(2);
    });
  });

  describe('data integrity', () => {
    it('preserves all noteDao fields through serialization', async () => {
      const noteDao = await NoteDao.random();
      const siloedNoteHash = Fr.random();
      const original = new StoredForeignNote(noteDao, siloedNoteHash, new Set(['scope1']));

      const restored = StoredForeignNote.fromBuffer(original.toBuffer());

      expect(restored.noteDao.contractAddress.equals(original.noteDao.contractAddress)).toBe(true);
      expect(restored.noteDao.storageSlot.equals(original.noteDao.storageSlot)).toBe(true);
      expect(restored.noteDao.owner.equals(original.noteDao.owner)).toBe(true);
      expect(restored.noteDao.noteHash.equals(original.noteDao.noteHash)).toBe(true);
      expect(restored.noteDao.l2BlockNumber).toBe(original.noteDao.l2BlockNumber);
      expect(restored.noteDao.txIndexInBlock).toBe(original.noteDao.txIndexInBlock);
      expect(restored.noteDao.noteIndexInTx).toBe(original.noteDao.noteIndexInTx);
    });

    it('handles empty strings in scopes', async () => {
      const storedNote = new StoredForeignNote(await NoteDao.random(), Fr.random(), new Set(['', 'valid']));

      const restored = StoredForeignNote.fromBuffer(storedNote.toBuffer());

      expect(restored.scopes.has('')).toBe(true);
      expect(restored.scopes.has('valid')).toBe(true);
      expect(restored.scopes.size).toBe(2);
    });

    it('handles special characters in scope strings', async () => {
      const specialScopes = new Set([
        'scope-with-dash',
        'scope_with_underscore',
        'scope.with.dots',
        'scope/with/slashes',
      ]);
      const storedNote = new StoredForeignNote(await NoteDao.random(), Fr.random(), specialScopes);

      const restored = StoredForeignNote.fromBuffer(storedNote.toBuffer());

      expect(restored.scopes).toEqual(specialScopes);
    });
  });
});
