import { NoteDao } from '@aztec/stdlib/note';

import { StoredNote } from './stored_note.js';

describe('StoredNote', () => {
  it('round-trips through a buffer with scopes', async () => {
    const noteDao = await NoteDao.random();
    const stored = new StoredNote(noteDao, new Set(['0xscope1', '0xscope2']));

    const restored = StoredNote.fromBuffer(stored.toBuffer());

    expect(restored.noteDao.equals(noteDao)).toBe(true);
    expect([...restored.scopes].sort()).toEqual(['0xscope1', '0xscope2']);
  });
});
