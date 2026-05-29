import { NoteDao } from '@aztec/stdlib/note';

import type { Origin } from '../foundation/origin.js';
import { StoredNote } from './stored_note.js';

const originAt = (blockNumber: number, hash: string = '0x0123abcd'): Origin => ({ blockNumber, blockHash: hash });

describe('StoredNote', () => {
  describe('construction', () => {
    it('creates a StoredNote with default values', async () => {
      const noteDao = await NoteDao.random();
      const storedNote = new StoredNote(noteDao, new Set());

      expect(storedNote.noteDao).toBe(noteDao);
      expect(storedNote.isNullified()).toBe(false);
      expect(storedNote.scopes.size).toBe(0);
      expect(storedNote.nullifiedAt).toBeUndefined();
    });
  });

  describe('serialization', () => {
    it('active note with no scopes', async () => {
      const noteDao = await NoteDao.random();
      const original = new StoredNote(noteDao, new Set());

      const buffer = original.toBuffer();
      const restored = StoredNote.fromBuffer(buffer);

      expect(restored.noteDao.equals(original.noteDao)).toBe(true);
      expect(restored.isNullified()).toBe(false);
      expect(restored.scopes.size).toBe(0);
      expect(restored.nullifiedAt).toBeUndefined();
    });

    it('active note with scopes', async () => {
      const noteDao = await NoteDao.random();
      const scopes = new Set(['scope1', 'scope2', 'scope3']);
      const original = new StoredNote(noteDao, scopes);

      const buffer = original.toBuffer();
      const restored = StoredNote.fromBuffer(buffer);

      expect(restored.noteDao.equals(original.noteDao)).toBe(true);
      expect(restored.isNullified()).toBe(false);
      expect(restored.scopes).toEqual(scopes);
      expect(restored.nullifiedAt).toBeUndefined();
    });

    it('nullified note', async () => {
      const noteDao = await NoteDao.random();
      const nullifiedAt = originAt(123);
      const original = new StoredNote(noteDao, new Set(['scope1']), nullifiedAt);

      const buffer = original.toBuffer();
      const restored = StoredNote.fromBuffer(buffer);

      expect(restored.noteDao.equals(original.noteDao)).toBe(true);
      expect(restored.isNullified()).toBe(true);
      expect(restored.scopes).toEqual(new Set(['scope1']));
      expect(restored.nullifiedAt).toEqual(nullifiedAt);
    });

    it('note with multiple scopes', async () => {
      const noteDao = await NoteDao.random();
      const scopes = new Set(Array.from({ length: 100 }, (_, i) => `scope-${i}`));
      const original = new StoredNote(noteDao, scopes);

      const buffer = original.toBuffer();
      const restored = StoredNote.fromBuffer(buffer);

      expect(restored.scopes).toEqual(scopes);
    });
  });

  describe('addScope', () => {
    it('adds a scope to an empty set', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set());

      storedNote.addScope('new-scope');

      expect(storedNote.scopes.has('new-scope')).toBe(true);
      expect(storedNote.scopes.size).toBe(1);
    });

    it('adds a scope to an existing set', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set(['existing']));

      storedNote.addScope('new-scope');

      expect(storedNote.scopes.has('existing')).toBe(true);
      expect(storedNote.scopes.has('new-scope')).toBe(true);
      expect(storedNote.scopes.size).toBe(2);
    });

    it('is idempotent when adding the same scope twice', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set());

      storedNote.addScope('scope');
      storedNote.addScope('scope');

      expect(storedNote.scopes.size).toBe(1);
    });
  });

  describe('markAsNullified', () => {
    it('sets nullifiedAt', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set());
      const origin = originAt(50);

      storedNote.markAsNullified(origin);

      expect(storedNote.isNullified()).toBe(true);
      expect(storedNote.nullifiedAt).toEqual(origin);
    });

    it('updates nullifiedAt when called multiple times', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set());

      storedNote.markAsNullified(originAt(10));
      storedNote.markAsNullified(originAt(20));

      expect(storedNote.nullifiedAt).toEqual(originAt(20));
    });

    it('persists nullifiedAt through serialization', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set());
      storedNote.markAsNullified(originAt(42));

      const restored = StoredNote.fromBuffer(storedNote.toBuffer());

      expect(restored.isNullified()).toBe(true);
      expect(restored.nullifiedAt).toEqual(originAt(42));
    });
  });

  describe('markAsActive', () => {
    it('clears nullifiedAt', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set(), originAt(100));

      storedNote.markAsActive();

      expect(storedNote.isNullified()).toBe(false);
      expect(storedNote.nullifiedAt).toBeUndefined();
    });

    it('is idempotent on already active notes', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set());

      storedNote.markAsActive();

      expect(storedNote.isNullified()).toBe(false);
      expect(storedNote.nullifiedAt).toBeUndefined();
    });

    it('persists active state through serialization', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set(), originAt(100));
      storedNote.markAsActive();

      const restored = StoredNote.fromBuffer(storedNote.toBuffer());

      expect(restored.isNullified()).toBe(false);
      expect(restored.nullifiedAt).toBeUndefined();
    });
  });

  describe('state transitions', () => {
    it('can transition from active to nullified and back', async () => {
      const storedNote = new StoredNote(await NoteDao.random(), new Set());

      expect(storedNote.isNullified()).toBe(false);
      expect(storedNote.nullifiedAt).toBeUndefined();

      storedNote.markAsNullified(originAt(10));
      expect(storedNote.isNullified()).toBe(true);
      expect(storedNote.nullifiedAt).toEqual(originAt(10));

      storedNote.markAsActive();
      expect(storedNote.isNullified()).toBe(false);
      expect(storedNote.nullifiedAt).toBeUndefined();
    });

    it('preserves scopes through state transitions', async () => {
      const scopes = new Set(['scope1', 'scope2']);
      const storedNote = new StoredNote(await NoteDao.random(), scopes);

      storedNote.markAsNullified(originAt(10));
      expect(storedNote.scopes).toEqual(scopes);

      storedNote.markAsActive();
      expect(storedNote.scopes).toEqual(scopes);
    });

    it('preserves noteDao through state transitions', async () => {
      const noteDao = await NoteDao.random();
      const storedNote = new StoredNote(noteDao, new Set());

      storedNote.markAsNullified(originAt(10));
      expect(storedNote.noteDao).toBe(noteDao);

      storedNote.markAsActive();
      expect(storedNote.noteDao).toBe(noteDao);
    });
  });
});
